import { NextRequest, NextResponse } from "next/server";

import { type WaterRisk } from "@/lib/ai/yolo-water-level";
import { listDroneOperations, recordDroneWaterEvent } from "@/lib/database/drones";

export const runtime = "nodejs";

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function getText(value: unknown, fallback = "") {
  if (typeof value === "string") return value.trim() || fallback;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function validCreatedAt(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function requireWaterToken(request: NextRequest) {
  const expected = process.env.WATER_INGEST_TOKEN || process.env.DRONE_GATEWAY_TOKEN || process.env.ADMIN_API_TOKEN;
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const waterToken = request.headers.get("x-water-ingest-token");
  return Boolean(expected && (bearer === expected || waterToken === expected));
}

function mapWaterRisk(rawSeverity: unknown, levelCm: number | null, alertCm: number | null, criticalCm: number | null): WaterRisk {
  const raw = typeof rawSeverity === "string" ? rawSeverity.toLowerCase() : "";

  if (["danger", "critical", "high", "unsafe"].includes(raw)) return "danger";
  if (["warning", "watch", "medium"].includes(raw)) return "watch";
  if (["normal", "safe", "low"].includes(raw)) return "safe";

  if (levelCm === null) return "pending";
  if (criticalCm !== null && levelCm >= criticalCm) return "danger";
  if (alertCm !== null && levelCm >= alertCm) return "watch";
  if (levelCm > 0) return "watch";
  return "safe";
}

function getDetections(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function stripLargeFields(payload: Record<string, unknown>) {
  const rawPayload = { ...payload };
  delete rawPayload.photo_data_url;
  delete rawPayload.photoDataUrl;
  return rawPayload;
}

export async function GET() {
  try {
    const result = await listDroneOperations();
    const events = result.waterEvents || [];
    return NextResponse.json({ ok: true, configured: result.configured, events, latest: events[0] || null });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to load water-level events.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  if (!requireWaterToken(request)) {
    return NextResponse.json({ ok: false, message: "Water ingest token is required." }, { status: 403 });
  }

  try {
    const payload = (await request.json()) as Record<string, unknown>;
    const code = getText(payload.device_id ?? payload.deviceId ?? payload.code, "HY-WATER-01");
    const name = getText(payload.name, `${code} water scanner`);
    const levelCm = getNumber(payload.level_cm ?? payload.water_level_cm ?? payload.levelCm);
    const alertCm = getNumber(payload.alert_cm ?? payload.alertCm) ?? 80;
    const criticalCm = getNumber(payload.critical_cm ?? payload.criticalCm) ?? 120;
    const risk = mapWaterRisk(payload.severity ?? payload.risk ?? payload.status, levelCm, alertCm, criticalCm);
    const sourceType = getText(payload.source_type ?? payload.sourceType, getText(payload.photo_data_url) ? "mobile_photo" : "yolo");
    const lat = getNumber(payload.latitude ?? payload.lat);
    const lng = getNumber(payload.longitude ?? payload.lng);

    const result = await recordDroneWaterEvent({
      code,
      name,
      sourceType,
      method: getText(payload.method, "ultralytics-yolo-water-level"),
      modelPath: getText(payload.model_path ?? payload.modelPath),
      depthCm: levelCm,
      risk,
      rawSeverity: getText(payload.severity ?? payload.risk ?? payload.status),
      confidence: getNumber(payload.confidence ?? payload.score),
      levelPercent: getNumber(payload.level_percent ?? payload.levelPercent),
      waterlineY: getNumber(payload.waterline_y ?? payload.waterlineY),
      frameWidth: getNumber(payload.frame_width ?? payload.frameWidth),
      frameHeight: getNumber(payload.frame_height ?? payload.frameHeight),
      lat,
      lng,
      locationAccuracyM: getNumber(payload.location_accuracy_m ?? payload.accuracy),
      detections: getDetections(payload.detections),
      rawPayload: stripLargeFields(payload),
      createdAt: validCreatedAt(payload.created_at ?? payload.createdAt),
    });

    if (!result.configured) {
      return NextResponse.json({ ok: false, configured: false, message: "Supabase is not configured." }, { status: 503 });
    }

    return NextResponse.json(
      {
        ok: true,
        ...result,
        event: {
          id: result.eventId,
          device_code: code,
          level_cm: levelCm,
          risk,
          severity: getText(payload.severity ?? payload.risk ?? payload.status),
        },
      },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to ingest water-level event.",
      },
      { status: 500 },
    );
  }
}