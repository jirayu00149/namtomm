#!/usr/bin/env python3
"""Train the rodnam YOLO water-level model from a Roboflow YOLO dataset.

This wrapper avoids relying on the `yolo` executable being on PATH. It trains
through the Ultralytics Python API and copies the resulting best.pt into the
service model path expected by server.py.
"""

from __future__ import annotations

import argparse
import shutil
from pathlib import Path
from typing import Any, Optional

from ultralytics import YOLO

SERVICE_DIR = Path(__file__).resolve().parent
APP_ROOT = SERVICE_DIR.parents[1]
DEFAULT_DATA = APP_ROOT / "data.yaml"
DEFAULT_OUTPUT_MODEL = SERVICE_DIR / "models" / "flood_water_level.pt"


def existing_path(value: str, fallback_root: Path = APP_ROOT) -> Path:
    path = Path(value).expanduser()
    if path.is_absolute():
        return path
    cwd_path = Path.cwd() / path
    if cwd_path.exists():
        return cwd_path.resolve()
    return (fallback_root / path).resolve()


def add_if_present(options: dict[str, Any], key: str, value: Optional[str]) -> None:
    if value is not None and value != "":
        options[key] = value


def latest_weight(save_dir: Path) -> Path:
    weights_dir = save_dir / "weights"
    best = weights_dir / "best.pt"
    if best.exists():
        return best
    last = weights_dir / "last.pt"
    if last.exists():
        return last
    raise FileNotFoundError(f"No best.pt or last.pt found in {weights_dir}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train YOLOv11 water-level detector and copy best.pt into the service.")
    parser.add_argument("--data", default=str(DEFAULT_DATA), help="Dataset YAML path. Defaults to my-flood-app/data.yaml.")
    parser.add_argument("--model", default="yolo11n.pt", help="Base YOLO model, e.g. yolo11n.pt or a local .pt path.")
    parser.add_argument("--epochs", type=int, default=50)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=2)
    parser.add_argument("--workers", type=int, default=0, help="Use 0 on Windows to avoid dataloader spawn issues.")
    parser.add_argument("--name", default="flood_level")
    parser.add_argument("--project", default=str(APP_ROOT / "runs" / "detect"))
    parser.add_argument("--device", default=None, help="Optional device, e.g. cpu, 0, cuda:0.")
    parser.add_argument("--fraction", type=float, default=None, help="Optional dataset fraction for smoke tests, e.g. 0.02.")
    parser.add_argument("--patience", type=int, default=30)
    parser.add_argument("--output", default=str(DEFAULT_OUTPUT_MODEL), help="Where to copy the trained model.")
    parser.add_argument("--no-copy", action="store_true", help="Do not copy best.pt into tools/yolo-water-service/models.")
    parser.add_argument("--exist-ok", action="store_true", help="Allow overwriting an existing run directory.")
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    data_path = existing_path(args.data)
    if not data_path.exists():
        raise FileNotFoundError(f"Dataset YAML not found: {data_path}")

    project_dir = Path(args.project).expanduser().resolve()
    model = YOLO(args.model)

    train_options: dict[str, Any] = {
        "data": str(data_path),
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "workers": args.workers,
        "project": str(project_dir),
        "name": args.name,
        "patience": args.patience,
        "exist_ok": args.exist_ok,
    }
    add_if_present(train_options, "device", args.device)
    if args.fraction is not None:
        train_options["fraction"] = args.fraction

    print(f"Training with data: {data_path}")
    print(f"Saving runs under: {project_dir}")
    result = model.train(**train_options)

    save_dir_value = getattr(result, "save_dir", None) or getattr(getattr(model, "trainer", None), "save_dir", None)
    if not save_dir_value:
        raise RuntimeError("Ultralytics did not report a save_dir for this training run.")

    trained_weight = latest_weight(Path(save_dir_value))
    print(f"Trained weight: {trained_weight}")

    if args.no_copy:
        return

    output_path = Path(args.output).expanduser().resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(trained_weight, output_path)
    print(f"Copied service model to: {output_path}")


if __name__ == "__main__":
    main()