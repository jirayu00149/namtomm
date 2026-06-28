# Database, YOLO and Drone Setup

This app now has a clean production path:

- `POST /api/reports` receives image, coordinates, details and optional user id.
- The API sends the image to `YOLO_API_URL` for water-level detection.
- The API uploads the image to the private Supabase Storage bucket `flood-images`.
- The API stores coordinates, user reference, image path and YOLO result in `public.flood_reports`.
- `/dash` and `/dashboard` read reports from `GET /api/reports` only. Sample cases are not rendered.
- The dashboard has working menu views: Overview, Reports, Drones, AI and Settings.

## 1. Supabase

Run `supabase/schema.sql` in the Supabase SQL editor. It creates:

- `public.profiles`
- `public.flood_reports`
- `public.drones`
- `public.drone_missions`
- `public.drone_telemetry`
- `public.drone_water_events`
- `public.drone_captures`
- private Storage bucket `flood-images`
- RLS policies for citizen-owned reports and operator/admin drone access

Then copy `.env.example` to `.env.local` and fill:

```txt
SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
ADMIN_API_TOKEN=
DRONE_GATEWAY_TOKEN=
WATER_INGEST_TOKEN=
```

Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only. Do not expose it as `NEXT_PUBLIC_*`.

## 2. YOLO water-level service

Set:

```txt
YOLO_API_URL=http://127.0.0.1:8010/detect-water-level
YOLO_API_KEY=optional
```

The app sends multipart form data with field `image`. The recommended JSON response is:

```json
{
  "depthCm": 35,
  "risk": "watch",
  "confidence": 0.91,
  "labels": ["flood_water", "road"]
}
```

Accepted risk values are normalized to `safe`, `watch`, `danger` or `pending`.

## 3. Drone integration path

The `Drones` dashboard view is ready for real data without fake fleet rows. The database supports:

- `drones`: fleet identity, online status, latest position, battery and signal
- `drone_missions`: assigned missions linked to flood reports
- `drone_telemetry`: live position stream from a drone gateway
- `drone_water_events`: YOLO water-level events from the previous Raspberry Pi detector
- `drone_captures`: drone images that can use the same Storage and YOLO pipeline

Available drone API:

- `GET /api/drones` lists fleet, missions and captures.
- `POST /api/drones/telemetry` accepts JSON telemetry from a drone gateway.
- `POST /api/drones/captures` accepts multipart images from a drone, sends them to YOLO, stores the image and creates a linked flood report.
- `POST /api/yolo/water-level` is the compatibility route for the older `yolo_water_level_detector.py` script. It stores water-level events without requiring an image.

Gateway requests must include:

```txt
Authorization: Bearer $DRONE_GATEWAY_TOKEN
```

Telemetry JSON example:

```json
{
  "code": "DRONE-01",
  "name": "North Survey 1",
  "lat": 13.7563,
  "lng": 100.5018,
  "batteryPercent": 82,
  "signalPercent": 94,
  "altitudeM": 45
}
```

Drone capture fields: `image`, `code`, `name`, `lat`, `lng`, optional `missionId` and `details`.

Previous Pi water YOLO script:

```bash
python hardware/raspberry-pi/scripts/yolo_water_level_detector.py \
  --server-url http://127.0.0.1:3000/api/yolo/water-level \
  --ingest-token $WATER_INGEST_TOKEN
```

The compatibility endpoint also accepts `Authorization: Bearer $DRONE_GATEWAY_TOKEN` if the bridge already uses the newer gateway token.

## 4. Clear cases

Sample cases are already removed from the dashboard. To clear real database cases, set `ADMIN_API_TOKEN` and call:

```bash
curl -X DELETE http://127.0.0.1:3000/api/reports \
  -H "Authorization: Bearer $ADMIN_API_TOKEN"
```


## 5. YOLO Water-Level Service

A local FastAPI service is included at `tools/yolo-water-service`. It receives the user-submitted report image, runs an Ultralytics YOLO flood-water model, estimates the waterline, and returns `depthCm` / `water_level_cm` to `/api/reports`.

```powershell
npm run yolo:install
npm run yolo:service
```

Place the trained model at:

```text
tools/yolo-water-service/models/flood_water_level.pt
```

The report API stores the returned values in `public.flood_reports.yolo_depth_cm`, `yolo_risk`, `yolo_confidence`, and `yolo_labels`. The dashboard reads those values and shows the AI water-level result for each user photo.

For real centimeter measurements, calibrate the camera/reference span:

```env
YOLO_REFERENCE_LABELS=utility_pole,electric_pole,power_pole,pole,water_level_gauge,water_gauge,staff_gauge,gauge_board,level_staff,water_staff,flood_gauge,ruler,staff,gauge,reference_marker,marker
WATER_REFERENCE_HEIGHT_CM=900
WATER_GAUGE_REFERENCE_HEIGHT_CM=200
WATER_REFERENCE_TOP_Y=0
WATER_REFERENCE_BOTTOM_Y=720
```

For pole-based measurement, keep `WATER_REFERENCE_HEIGHT_CM=900` and train/map a reference label such as `utility_pole`, `electric_pole`, `power_pole`, or `pole`. For a water-level staff/gauge, train/map labels such as `water_level_gauge`, `staff_gauge`, or `gauge_board`; the service will use `WATER_GAUGE_REFERENCE_HEIGHT_CM` for that reference. If you deploy the YOLO service to another machine, set `YOLO_API_URL` to that public HTTPS endpoint and upload the same value as a Cloudflare Worker secret.

## 6. Verify before push

```bash
npm run lint
npm run build
```
