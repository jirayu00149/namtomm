export type WaterRisk = "pending" | "safe" | "watch" | "danger";

export type YoloWaterLevelResult = {
  depthCm: number | null;
  risk: WaterRisk;
  confidence: number | null;
  labels: string[];
  source: "yolo" | "not_configured" | "error";
  message?: string;
};

type YoloApiResponse = {
  depthCm?: number | string | null;
  depth_cm?: number | string | null;
  water_level_cm?: number | string | null;
  risk?: string | null;
  status?: string | null;
  confidence?: number | string | null;
  labels?: string[] | null;
  detections?: Array<{ label?: string; class?: string; confidence?: number }>;
  message?: string;
};

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

function normalizeRisk(value: unknown, depthCm: number | null): WaterRisk {
  const raw = typeof value === "string" ? value.toLowerCase() : "";

  if (["danger", "critical", "high", "unsafe"].includes(raw)) {
    return "danger";
  }

  if (["watch", "warning", "medium"].includes(raw)) {
    return "watch";
  }

  if (["safe", "low", "normal"].includes(raw)) {
    return "safe";
  }

  if (depthCm === null) {
    return "pending";
  }

  if (depthCm >= 40) {
    return "danger";
  }

  if (depthCm >= 20) {
    return "watch";
  }

  return "safe";
}

function labelsFromResponse(data: YoloApiResponse) {
  if (Array.isArray(data.labels)) {
    return data.labels.filter(Boolean);
  }

  if (Array.isArray(data.detections)) {
    return data.detections
      .map((item) => item.label || item.class)
      .filter((label): label is string => Boolean(label));
  }

  return [];
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
    const depthCm =
      toNumber(data.depthCm) ?? toNumber(data.depth_cm) ?? toNumber(data.water_level_cm);
    const confidence = toNumber(data.confidence);

    return {
      depthCm,
      risk: normalizeRisk(data.risk ?? data.status, depthCm),
      confidence,
      labels: labelsFromResponse(data),
      source: "yolo",
      message: data.message,
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