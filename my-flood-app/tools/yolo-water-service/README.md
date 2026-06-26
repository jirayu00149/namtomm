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
WATER_REFERENCE_HEIGHT_CM=200
WATER_REFERENCE_TOP_Y=0
WATER_REFERENCE_BOTTOM_Y=720
```

4. Run the service:

```powershell
npm run yolo:service
```

5. Run the Next app in another terminal. When a user submits a report image, `/api/reports` sends the image to this service and stores `yolo_depth_cm`, `yolo_risk`, `yolo_confidence`, and `yolo_labels`.

## Calibration

`WATER_REFERENCE_TOP_Y`, `WATER_REFERENCE_BOTTOM_Y`, and `WATER_REFERENCE_HEIGHT_CM` define the measured vertical span in the image. For a real deployment, calibrate these values from a visible gauge, marker, bridge pillar, or camera-specific reference distance. Without calibration, the service can detect flood-water but the centimeter value is only an estimate.

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