# YOLO Water-Level Service

This service receives a user report image, runs an Ultralytics YOLO flood-water model, estimates the waterline, and returns a `depthCm` value that `POST /api/reports` stores in Supabase.

## Setup

1. Install dependencies:

```powershell
npm run yolo:install
```

2. Put your trained water/flood YOLO model here:

```text
tools/yolo-water-service/models/flood_water_level.pt
```

3. Confirm `.env.local` contains:

```env
YOLO_API_URL=http://127.0.0.1:8010/detect-water-level
YOLO_MODEL_PATH=tools/yolo-water-service/models/flood_water_level.pt
YOLO_CONF=0.25
WATER_LEVEL_CLASS_STEP_CM=10
WATER_LEVEL_CLASS_BASE_CM=0
YOLO_WATER_LABELS=water,flood,flooding,flood-water,flood_water,waterline,water_line,level-
YOLO_REFERENCE_LABELS=utility_pole,electric_pole,power_pole,pole,water_level_gauge,water_gauge,staff_gauge,gauge_board,level_staff,water_staff,flood_gauge,ruler,staff,gauge,reference_marker,marker
WATER_REFERENCE_HEIGHT_CM=900
WATER_GAUGE_REFERENCE_HEIGHT_CM=200
WATER_REFERENCE_TOP_Y=0
WATER_REFERENCE_BOTTOM_Y=720
```

4. Run the service:

```powershell
npm run yolo:service
```

5. Run the Next app in another terminal. When a user submits a report image, `/api/reports` sends the image to this service and stores `yolo_depth_cm`, `yolo_risk`, `yolo_confidence`, and `yolo_labels`.

## Calibration

`WATER_REFERENCE_TOP_Y`, `WATER_REFERENCE_BOTTOM_Y`, and `WATER_REFERENCE_HEIGHT_CM` define the measured vertical span in the image. The default pole reference height is 900 cm so a detected utility/electric pole can be used as a 9 m scale reference. If the detected reference is a water-level staff/gauge, the service uses `WATER_GAUGE_REFERENCE_HEIGHT_CM` instead. For Roboflow classes like `level-1` through `level-12`, the service maps the class to centimeters with `WATER_LEVEL_CLASS_STEP_CM` and `WATER_LEVEL_CLASS_BASE_CM`. For a real deployment, calibrate these values from a visible gauge, marker, bridge pillar, utility pole, or camera-specific reference distance. Without calibration, the service can detect flood-water but the centimeter value is only an estimate.

## Response shape

The service returns fields already understood by the Next API:

```json
{
  "depthCm": 42.5,
  "water_level_cm": 42.5,
  "risk": "danger",
  "confidence": 0.87,
  "labels": ["flood-water"],
  "detections": []
}
```