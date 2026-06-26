export type WaterRisk = "pending" | "safe" | "watch" | "danger";

export type YoloWaterLevelResult = {
  depthCm: number | null;
  risk: WaterRisk;
  confidence: number | null;
  labels: string[];
  source: "yolo" | "not_configured" | "error";
  message?: string;
};

type JsonRecord = Record<string, unknown>;

type DetectionBox = {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  width: number;
  height: number;
  centerY: number;
};

type YoloApiResponse = JsonRecord & {
  depthCm?: number | string | null;
  depth_cm?: number | string | null;
  water_level_cm?: number | string | null;
  risk?: string | null;
  status?: string | null;
  severity?: string | null;
  confidence?: number | string | null;
  labels?: string[] | null;
  detections?: unknown[] | null;
  predictions?: unknown[] | null;
  objects?: unknown[] | null;
  results?: unknown[] | null;
  message?: string;
};

const depthKeys = [
  "depthCm",
  "depth_cm",
  "water_level_cm",
  "waterLevelCm",
  "water_depth_cm",
  "waterDepthCm",
  "level_cm",
];

const scaleKeys = ["scaleCmPerPx", "scale_cm_per_px", "cm_per_px", "centimeters_per_pixel"];
const referenceHeightKeys = ["referenceHeightCm", "reference_height_cm", "gaugeHeightCm", "gauge_height_cm", "markerHeightCm", "marker_height_cm"];
const maxDepthKeys = ["maxDepthCm", "max_depth_cm", "cameraMaxDepthCm", "camera_max_depth_cm"];
const imageHeightKeys = ["imageHeight", "image_height", "height", "original_height"];

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function toNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function firstNumber(record: JsonRecord, keys: string[]) {
  for (const key of keys) {
    const value = toNumber(record[key]);
    if (value !== null) {
      return value;
    }
  }

  return null;
}

function labelFromDetection(item: JsonRecord) {
  const value = item.label ?? item.class ?? item.name ?? item.class_name ?? item.category;
  return typeof value === "string" ? value : null;
}

function confidenceFromDetection(item: JsonRecord) {
  return toNumber(item.confidence ?? item.score ?? item.probability);
}

function normalizeRisk(value: unknown, depthCm: number | null, labels: string[] = []): WaterRisk {
  const raw = typeof value === "string" ? value.toLowerCase() : "";
  const labelText = labels.join(" ").toLowerCase();

  if (["danger", "critical", "high", "unsafe"].includes(raw)) {
    return "danger";
  }

  if (["watch", "warning", "medium"].includes(raw)) {
    return "watch";
  }

  if (["safe", "low", "normal"].includes(raw)) {
    return "safe";
  }

  if (depthCm !== null) {
    if (depthCm >= 40) {
      return "danger";
    }

    if (depthCm >= 20) {
      return "watch";
    }

    return "safe";
  }

  if (/(flood|water|waterline|water_line|inundation|road_flood)/i.test(labelText)) {
    return "watch";
  }

  return "pending";
}

function collectArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function normalizeDetections(data: YoloApiResponse) {
  const detections: JsonRecord[] = [];
  const sourceArrays = [data.detections, data.predictions, data.objects, data.results];

  for (const source of sourceArrays) {
    for (const entry of collectArray(source)) {
      if (!isRecord(entry)) {
        continue;
      }

      if (Array.isArray(entry.boxes)) {
        for (const box of entry.boxes) {
          if (isRecord(box)) {
            detections.push(box);
          }
        }
      } else if (Array.isArray(entry.detections)) {
        for (const detection of entry.detections) {
          if (isRecord(detection)) {
            detections.push(detection);
          }
        }
      } else {
        detections.push(entry);
      }
    }
  }

  return detections;
}

function labelsFromResponse(data: YoloApiResponse, detections: JsonRecord[]) {
  const labels = new Set<string>();

  if (Array.isArray(data.labels)) {
    for (const label of data.labels) {
      if (typeof label === "string" && label.trim()) {
        labels.add(label.trim());
      }
    }
  }

  for (const detection of detections) {
    const label = labelFromDetection(detection);
    if (label) {
      labels.add(label);
    }
  }

  return Array.from(labels);
}

function confidenceFromResponse(data: YoloApiResponse, detections: JsonRecord[]) {
  const topLevel = toNumber(data.confidence);
  if (topLevel !== null) {
    return topLevel;
  }

  const values = detections
    .map(confidenceFromDetection)
    .filter((value): value is number => value !== null);

  if (values.length === 0) {
    return null;
  }

  return Math.max(...values);
}

function boxFromArray(values: unknown[], format: string | null): DetectionBox | null {
  if (values.length < 4) {
    return null;
  }

  const numbers = values.slice(0, 4).map(toNumber);
  if (numbers.some((value) => value === null)) {
    return null;
  }

  const [a, b, c, d] = numbers as [number, number, number, number];
  const xyxy = format === "xyxy" || format === "x1y1x2y2";
  const x1 = a;
  const y1 = b;
  const x2 = xyxy ? c : a + c;
  const y2 = xyxy ? d : b + d;
  return normalizeBox(x1, y1, x2, y2);
}

function normalizeBox(x1: number, y1: number, x2: number, y2: number): DetectionBox | null {
  const left = Math.min(x1, x2);
  const top = Math.min(y1, y2);
  const right = Math.max(x1, x2);
  const bottom = Math.max(y1, y2);
  const width = right - left;
  const height = bottom - top;

  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }

  return {
    x1: left,
    y1: top,
    x2: right,
    y2: bottom,
    width,
    height,
    centerY: top + height / 2,
  };
}

function boxFromDetection(item: JsonRecord): DetectionBox | null {
  const formatValue = item.format ?? item.bbox_format ?? item.box_format;
  const format = typeof formatValue === "string" ? formatValue.toLowerCase() : null;
  const xyxy = collectArray(item.xyxy);
  if (xyxy.length >= 4) {
    return boxFromArray(xyxy, "xyxy");
  }

  const bbox = collectArray(item.bbox ?? item.box);
  if (bbox.length >= 4) {
    return boxFromArray(bbox, format);
  }

  const xmin = toNumber(item.xmin ?? item.x_min ?? item.left);
  const ymin = toNumber(item.ymin ?? item.y_min ?? item.top);
  const xmax = toNumber(item.xmax ?? item.x_max ?? item.right);
  const ymax = toNumber(item.ymax ?? item.y_max ?? item.bottom);
  if (xmin !== null && ymin !== null && xmax !== null && ymax !== null) {
    return normalizeBox(xmin, ymin, xmax, ymax);
  }

  const x = toNumber(item.x);
  const y = toNumber(item.y);
  const width = toNumber(item.width ?? item.w);
  const height = toNumber(item.height ?? item.h);
  if (x !== null && y !== null && width !== null && height !== null) {
    if (format === "center" || item.x_center !== undefined || item.y_center !== undefined) {
      return normalizeBox(x - width / 2, y - height / 2, x + width / 2, y + height / 2);
    }

    return normalizeBox(x, y, x + width, y + height);
  }

  return null;
}

function matchDetection(detections: JsonRecord[], pattern: RegExp) {
  return detections
    .map((item) => ({ item, label: labelFromDetection(item) || "", box: boxFromDetection(item) }))
    .filter((entry) => entry.box && pattern.test(entry.label));
}

function calculateDepthFromDetections(data: YoloApiResponse, detections: JsonRecord[]) {
  const directDetectionDepth = detections
    .map((item) => firstNumber(item, depthKeys))
    .find((value) => value !== null);
  if (directDetectionDepth !== undefined) {
    return directDetectionDepth;
  }

  const imageHeight = firstNumber(data, imageHeightKeys);
  const explicitScale = firstNumber(data, scaleKeys);
  const referenceHeightCm = firstNumber(data, referenceHeightKeys);
  const maxDepthCm = firstNumber(data, maxDepthKeys);
  const waterline = matchDetection(detections, /(waterline|water_line|water-level|water_level|surface|flood_line)/i)[0];
  const waterRegion = matchDetection(detections, /(flood|water|inundation)/i)[0];
  const reference = matchDetection(detections, /(gauge|ruler|scale|staff|reference|marker|meter)/i)[0];
  const waterBox = waterline?.box || waterRegion?.box || null;

  if (!waterBox) {
    return null;
  }

  const referenceBox = reference?.box || null;
  const cmPerPx = explicitScale ?? (referenceHeightCm !== null && referenceBox ? referenceHeightCm / referenceBox.height : null);
  const waterY = waterline?.box ? waterline.box.centerY : waterBox.y1;
  const bottomY = referenceBox?.y2 ?? imageHeight ?? null;

  if (cmPerPx !== null && bottomY !== null) {
    const depthPx = Math.max(0, bottomY - waterY);
    return Math.round(depthPx * cmPerPx * 10) / 10;
  }

  if (maxDepthCm !== null && imageHeight !== null) {
    const levelPercent = Math.max(0, Math.min(1, (imageHeight - waterY) / imageHeight));
    return Math.round(levelPercent * maxDepthCm * 10) / 10;
  }

  return null;
}

export async function analyzeWaterLevelWithYolo(image: File): Promise<YoloWaterLevelResult> {
  const endpoint = process.env.YOLO_API_URL;

  if (!endpoint) {
    return {
      depthCm: null,
      risk: "pending",
      confidence: null,
      labels: [],
      source: "not_configured",
      message: "YOLO_API_URL is not configured.",
    };
  }

  const formData = new FormData();
  formData.append("image", image, image.name || "flood-image.jpg");

  const headers = new Headers();
  const apiKey = process.env.YOLO_API_KEY;
  if (apiKey) {
    headers.set("Authorization", `Bearer ${apiKey}`);
  }

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      return {
        depthCm: null,
        risk: "pending",
        confidence: null,
        labels: [],
        source: "error",
        message: `YOLO service returned ${response.status}.`,
      };
    }

    const data = (await response.json()) as YoloApiResponse;
    const detections = normalizeDetections(data);
    const labels = labelsFromResponse(data, detections);
    const depthCm = firstNumber(data, depthKeys) ?? calculateDepthFromDetections(data, detections);
    const confidence = confidenceFromResponse(data, detections);

    return {
      depthCm,
      risk: normalizeRisk(data.risk ?? data.status ?? data.severity, depthCm, labels),
      confidence,
      labels,
      source: "yolo",
      message: data.message || (depthCm !== null ? "Water level measured from YOLO output." : undefined),
    };
  } catch (error) {
    return {
      depthCm: null,
      risk: "pending",
      confidence: null,
      labels: [],
      source: "error",
      message: error instanceof Error ? error.message : "YOLO analysis failed.",
    };
  }
}

export function priorityFromWaterRisk(risk: WaterRisk) {
  if (risk === "danger") {
    return "critical";
  }

  if (risk === "watch") {
    return "warning";
  }

  return "normal";
}