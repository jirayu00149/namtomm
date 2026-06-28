#!/usr/bin/env python3
"""HTTP YOLO water-level service for rodnam user reports.

Next.js sends multipart field `image` to this service through YOLO_API_URL.
The service runs an Ultralytics YOLO water/flood model and returns depthCm.
"""

from __future__ import annotations

import argparse
import os
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional, Tuple

import cv2
import numpy as np
import uvicorn
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from ultralytics import YOLO

app = FastAPI(title="rodnam YOLO water-level service", version="1.0.0")

DEFAULT_MODEL = Path(__file__).resolve().parent / "models" / "flood_water_level.pt"
DEFAULT_WATER_LABELS = ["water", "flood", "flood-water", "flood_water", "waterline", "water_line"]
DEFAULT_POLE_REFERENCE_LABELS = ["utility_pole", "electric_pole", "power_pole", "pole"]
DEFAULT_GAUGE_REFERENCE_LABELS = [
    "water_level_gauge",
    "water_gauge",
    "staff_gauge",
    "gauge_board",
    "level_staff",
    "water_staff",
    "flood_gauge",
    "ruler",
    "staff",
    "gauge",
    "reference_marker",
    "marker",
]
DEFAULT_REFERENCE_LABELS = DEFAULT_POLE_REFERENCE_LABELS + DEFAULT_GAUGE_REFERENCE_LABELS
DEFAULT_REFERENCE_HEIGHT_CM = 900.0
DEFAULT_GAUGE_REFERENCE_HEIGHT_CM = 200.0


def load_env_file() -> None:
    candidates = [Path.cwd() / ".env.local", Path(__file__).resolve().parents[2] / ".env.local"]
    for path in candidates:
        if not path.exists():
            continue
        for raw_line in path.read_text(encoding="utf-8").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, value = line.split("=", 1)
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value
        return


load_env_file()

_model: Optional[YOLO] = None
_model_path: Optional[Path] = None


def env_float(name: str, fallback: float) -> float:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return fallback
    try:
        return float(raw)
    except ValueError:
        return fallback


def env_int(name: str, fallback: int) -> int:
    raw = os.environ.get(name, "").strip()
    if not raw:
        return fallback
    try:
        return int(raw)
    except ValueError:
        return fallback


def parse_csv(value: str) -> List[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_classes(value: str) -> Optional[List[int]]:
    items = parse_csv(value)
    if not items:
        return None
    return [int(item) for item in items]


def wanted_labels() -> List[str]:
    return parse_csv(os.environ.get("YOLO_WATER_LABELS", "")) or DEFAULT_WATER_LABELS


def reference_labels() -> List[str]:
    return parse_csv(os.environ.get("YOLO_REFERENCE_LABELS", "")) or DEFAULT_REFERENCE_LABELS


def gauge_reference_labels() -> List[str]:
    return parse_csv(os.environ.get("YOLO_GAUGE_REFERENCE_LABELS", "")) or DEFAULT_GAUGE_REFERENCE_LABELS


def model_path() -> Path:
    return Path(os.environ.get("YOLO_MODEL_PATH", str(DEFAULT_MODEL))).expanduser().resolve()


def load_model() -> YOLO:
    global _model, _model_path
    path = model_path()
    if _model is not None and _model_path == path:
        return _model
    if not path.exists():
        raise RuntimeError(f"YOLO_MODEL_PATH not found: {path}")
    _model = YOLO(str(path))
    _model_path = path
    return _model


def check_auth(request: Request) -> None:
    expected = os.environ.get("YOLO_API_KEY", "").strip()
    if not expected:
        return
    actual = request.headers.get("authorization", "").replace("Bearer ", "", 1).strip()
    if actual != expected:
        raise HTTPException(status_code=401, detail="Invalid YOLO API key")


def class_matches(class_id: int, class_name: str, labels: Iterable[str], classes: Optional[List[int]]) -> bool:
    if classes is not None and class_id in classes:
        return True
    wanted = [str(item).lower() for item in labels]
    return not wanted or any(item in class_name.lower() for item in wanted)


def clamp(value: float, low: float, high: float) -> float:
    return min(high, max(low, value))


def risk_from_level(level_cm: Optional[float], alert_cm: float, critical_cm: float) -> str:
    if level_cm is None:
        return "pending"
    if level_cm >= critical_cm:
        return "danger"
    if level_cm >= alert_cm:
        return "watch"
    return "safe"


def polygon_area(points: Optional[np.ndarray]) -> float:
    if points is None or len(points) < 3:
        return 0.0
    return float(abs(cv2.contourArea(points.astype(np.float32))))


def decode_image(data: bytes) -> np.ndarray:
    image = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if image is None:
        raise HTTPException(status_code=400, detail="Cannot decode image")
    return image


def detections_from_result(result: Any, labels: List[str], classes: Optional[List[int]]) -> List[Dict[str, Any]]:
    detections: List[Dict[str, Any]] = []
    names = result.names or {}
    boxes = result.boxes
    masks_xy = getattr(result.masks, "xy", None) if result.masks is not None else None
    if boxes is None:
        return detections

    for index, box in enumerate(boxes):
        class_id = int(box.cls[0].item())
        class_name = str(names.get(class_id, f"class {class_id}"))
        if not class_matches(class_id, class_name, labels, classes):
            continue

        confidence = float(box.conf[0].item())
        x1, y1, x2, y2 = [float(value) for value in box.xyxy[0].tolist()]
        polygon = None
        if masks_xy is not None and index < len(masks_xy):
            polygon = np.asarray(masks_xy[index], dtype=np.float32)
        waterline_y = float(np.min(polygon[:, 1])) if polygon is not None and len(polygon) else y1
        area = polygon_area(polygon) if polygon is not None else max(0.0, x2 - x1) * max(0.0, y2 - y1)
        detections.append({
            "class_id": class_id,
            "class_name": class_name,
            "label": class_name,
            "confidence": round(confidence, 4),
            "x": round(x1, 2),
            "y": round(y1, 2),
            "width": round(max(0.0, x2 - x1), 2),
            "height": round(max(0.0, y2 - y1), 2),
            "bbox": [round(x1, 2), round(y1, 2), round(max(0.0, x2 - x1), 2), round(max(0.0, y2 - y1), 2)],
            "waterline_y": round(waterline_y, 2),
            "area": round(area, 2),
            "source": "mask" if polygon is not None else "box",
        })
    return detections


def best_detection(detections: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    if not detections:
        return None
    return max(detections, key=lambda item: float(item.get("area", 0.0)) * max(0.01, float(item.get("confidence", 0.0))))


def is_gauge_reference(detection: Optional[Dict[str, Any]]) -> bool:
    if detection is None:
        return False
    class_name = str(detection.get("class_name", "")).lower()
    return any(label.lower() in class_name for label in gauge_reference_labels())


def estimate_level(
    detections: List[Dict[str, Any]],
    top_y: float,
    bottom_y: float,
    height_cm: float,
) -> Tuple[Optional[float], Optional[float], Optional[float], float]:
    if not detections:
        return None, None, None, 0.0
    best = best_detection(detections)
    if best is None:
        return None, None, None, 0.0
    waterline_y = float(best["waterline_y"])
    span = max(1.0, bottom_y - top_y)
    level_percent = clamp(((bottom_y - waterline_y) / span) * 100.0, 0.0, 100.0)
    level_cm = (level_percent / 100.0) * height_cm
    confidence = max(float(item.get("confidence", 0.0)) for item in detections)
    return waterline_y, level_cm, level_percent, confidence


@app.get("/health")
def health() -> Dict[str, Any]:
    path = model_path()
    return {
        "ok": path.exists(),
        "modelPath": str(path),
        "waterLabels": wanted_labels(),
        "referenceLabels": reference_labels(),
        "gaugeReferenceLabels": gauge_reference_labels(),
        "referenceHeightCm": env_float("WATER_REFERENCE_HEIGHT_CM", DEFAULT_REFERENCE_HEIGHT_CM),
        "gaugeReferenceHeightCm": env_float("WATER_GAUGE_REFERENCE_HEIGHT_CM", DEFAULT_GAUGE_REFERENCE_HEIGHT_CM),
    }


@app.post("/detect-water-level")
async def detect_water_level(
    request: Request,
    image: UploadFile = File(...),
    reference_height_cm: Optional[float] = Form(None),
    reference_top_y: Optional[float] = Form(None),
    reference_bottom_y: Optional[float] = Form(None),
) -> Dict[str, Any]:
    check_auth(request)
    try:
        model = load_model()
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    frame = decode_image(await image.read())
    height, width = frame.shape[:2]
    labels = wanted_labels()
    ref_labels = reference_labels()
    classes = parse_classes(os.environ.get("YOLO_WATER_CLASSES", ""))
    ref_classes = parse_classes(os.environ.get("YOLO_REFERENCE_CLASSES", ""))
    predict_classes = sorted({*(classes or []), *(ref_classes or [])}) if classes is not None and ref_classes is not None else None
    conf = env_float("YOLO_CONF", 0.25)
    imgsz = env_int("YOLO_IMGSZ", 640)
    top_y = reference_top_y if reference_top_y is not None else env_float("WATER_REFERENCE_TOP_Y", 0.0)
    bottom_y = reference_bottom_y if reference_bottom_y is not None else env_float("WATER_REFERENCE_BOTTOM_Y", float(height))
    height_cm = reference_height_cm if reference_height_cm is not None else env_float("WATER_REFERENCE_HEIGHT_CM", DEFAULT_REFERENCE_HEIGHT_CM)
    reference_kind = "form" if reference_height_cm is not None else "default"
    alert_cm = env_float("WATER_ALERT_CM", 80.0)
    critical_cm = env_float("WATER_CRITICAL_CM", 120.0)

    results = model.predict(frame, conf=conf, imgsz=imgsz, classes=predict_classes, verbose=False)
    detections = detections_from_result(results[0], labels, classes) if results else []
    reference_detections = detections_from_result(results[0], ref_labels, ref_classes) if results else []
    reference = best_detection(reference_detections)
    reference_source = "form" if reference_top_y is not None or reference_bottom_y is not None else "env"
    if reference is not None and reference_top_y is None and reference_bottom_y is None:
        top_y = float(reference["y"])
        bottom_y = float(reference["y"]) + float(reference["height"])
        reference_source = str(reference["class_name"])
        if is_gauge_reference(reference):
            reference_kind = "water_gauge"
            if reference_height_cm is None:
                height_cm = env_float("WATER_GAUGE_REFERENCE_HEIGHT_CM", DEFAULT_GAUGE_REFERENCE_HEIGHT_CM)
        elif reference_height_cm is None:
            reference_kind = "pole_or_marker"
    elif not os.environ.get("WATER_REFERENCE_TOP_Y") and not os.environ.get("WATER_REFERENCE_BOTTOM_Y"):
        reference_source = "image_height"
    waterline_y, level_cm, level_percent, confidence = estimate_level(detections, top_y, bottom_y, height_cm)
    risk = risk_from_level(level_cm, alert_cm, critical_cm)

    return {
        "ok": True,
        "depthCm": round(level_cm, 2) if level_cm is not None else None,
        "depth_cm": round(level_cm, 2) if level_cm is not None else None,
        "water_level_cm": round(level_cm, 2) if level_cm is not None else None,
        "risk": risk,
        "status": risk,
        "confidence": round(confidence, 4),
        "labels": sorted({item["class_name"] for item in [*detections, *reference_detections]}),
        "detections": detections,
        "reference_detections": reference_detections,
        "waterline_y": round(waterline_y, 2) if waterline_y is not None else None,
        "level_percent": round(level_percent, 2) if level_percent is not None else None,
        "frame_width": width,
        "frame_height": height,
        "reference_height_cm": height_cm,
        "reference_top_y": top_y,
        "reference_bottom_y": bottom_y,
        "reference_source": reference_source,
        "reference_kind": reference_kind,
        "message": "Water level measured by Ultralytics YOLO." if level_cm is not None else "No flood-water detection found.",
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--host", default=os.environ.get("YOLO_HOST", "127.0.0.1"))
    parser.add_argument("--port", type=int, default=int(os.environ.get("YOLO_PORT", "8010")))
    args = parser.parse_args()
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()