import { priorityFromWaterRisk, type WaterRisk, type YoloWaterLevelResult } from "@/lib/ai/yolo-water-level";
import { getSupabaseAdmin, getSupabaseConfigState } from "@/lib/supabase/admin";

const FLOOD_IMAGE_BUCKET = "flood-images";

type DroneStatus = "offline" | "ready" | "in_mission" | "returning" | "maintenance";

type DroneRow = {
  id: string;
  code: string;
  name: string;
  status: DroneStatus;
  current_lat: number | null;
  current_lng: number | null;
  battery_percent: number | null;
  signal_percent: number | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

type DroneMissionRow = {
  id: string;
  drone_id: string | null;
  assigned_report_id: string | null;
  mission_type: string;
  status: string;
  target_lat: number | null;
  target_lng: number | null;
  notes: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
};

type DroneCaptureRow = {
  id: string;
  drone_id: string | null;
  mission_id: string | null;
  flood_report_id: string | null;
  image_path: string;
  lat: number;
  lng: number;
  yolo_depth_cm: number | null;
  yolo_risk: string | null;
  yolo_confidence: number | null;
  yolo_labels: string[] | null;
  created_at: string;
};

type DroneWaterEventRow = {
  id: string;
  drone_id: string | null;
  device_code: string;
  source_type: string;
  method: string | null;
  model_path: string | null;
  yolo_depth_cm: number | null;
  yolo_risk: WaterRisk;
  raw_severity: string | null;
  confidence: number | null;
  level_percent: number | null;
  waterline_y: number | null;
  frame_width: number | null;
  frame_height: number | null;
  lat: number | null;
  lng: number | null;
  location_accuracy_m: number | null;
  detections: unknown[] | null;
  created_at: string;
};

export type DroneTelemetryInput = {
  code: string;
  name: string;
  status?: DroneStatus;
  lat: number;
  lng: number;
  altitudeM: number | null;
  speedMps: number | null;
  headingDeg: number | null;
  batteryPercent: number | null;
  signalPercent: number | null;
  missionId: string | null;
};

export type DroneCaptureInput = {
  code: string;
  name: string;
  image: File;
  lat: number;
  lng: number;
  missionId: string | null;
  details: string;
  yolo: YoloWaterLevelResult;
};

export type DroneWaterEventInput = {
  code: string;
  name: string;
  sourceType: string;
  method: string;
  modelPath: string;
  depthCm: number | null;
  risk: WaterRisk;
  rawSeverity: string;
  confidence: number | null;
  levelPercent: number | null;
  waterlineY: number | null;
  frameWidth: number | null;
  frameHeight: number | null;
  lat: number | null;
  lng: number | null;
  locationAccuracyM: number | null;
  detections: unknown[];
  rawPayload: Record<string, unknown>;
  createdAt: string | null;
};

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "drone-capture.jpg";
}

function normalizeCode(code: string) {
  return code.trim().toUpperCase();
}

function normalizeSourceType(value: string) {
  const raw = value.trim().toLowerCase();
  if (raw === "mobile_photo" || raw === "telemetry") {
    return raw;
  }

  return "yolo";
}

function normalizeConfidence(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return null;
  }

  if (value > 1 && value <= 100) {
    return Math.round((value / 100) * 10000) / 10000;
  }

  return Math.min(1, Math.max(0, value));
}

async function ensureDrone(code: string, name: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const normalizedCode = normalizeCode(code);
  const { data, error } = await supabase
    .from("drones")
    .upsert(
      {
        code: normalizedCode,
        name: name.trim() || normalizedCode,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "code" },
    )
    .select("id,code,name,status,current_lat,current_lng,battery_percent,signal_percent,last_seen_at,created_at,updated_at")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data as DroneRow;
}

export async function listDroneOperations() {
  const supabase = getSupabaseAdmin();
  const config = getSupabaseConfigState();

  if (!supabase) {
    return { configured: false, drones: [], missions: [], captures: [], waterEvents: [], config };
  }

  const [dronesResult, missionsResult, capturesResult, waterEventsResult] = await Promise.all([
    supabase
      .from("drones")
      .select("id,code,name,status,current_lat,current_lng,battery_percent,signal_percent,last_seen_at,created_at,updated_at")
      .order("updated_at", { ascending: false }),
    supabase
      .from("drone_missions")
      .select("id,drone_id,assigned_report_id,mission_type,status,target_lat,target_lng,notes,started_at,completed_at,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("drone_captures")
      .select("id,drone_id,mission_id,flood_report_id,image_path,lat,lng,yolo_depth_cm,yolo_risk,yolo_confidence,yolo_labels,created_at")
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("drone_water_events")
      .select("id,drone_id,device_code,source_type,method,model_path,yolo_depth_cm,yolo_risk,raw_severity,confidence,level_percent,waterline_y,frame_width,frame_height,lat,lng,location_accuracy_m,detections,created_at")
      .order("created_at", { ascending: false })
      .limit(80),
  ]);

  if (dronesResult.error) throw new Error(dronesResult.error.message);
  if (missionsResult.error) throw new Error(missionsResult.error.message);
  if (capturesResult.error) throw new Error(capturesResult.error.message);
  if (waterEventsResult.error) throw new Error(waterEventsResult.error.message);

  return {
    configured: true,
    drones: (dronesResult.data || []) as DroneRow[],
    missions: (missionsResult.data || []) as DroneMissionRow[],
    captures: (capturesResult.data || []) as DroneCaptureRow[],
    waterEvents: (waterEventsResult.data || []) as DroneWaterEventRow[],
    config,
  };
}

export async function recordDroneTelemetry(input: DroneTelemetryInput) {
  const supabase = getSupabaseAdmin();
  const config = getSupabaseConfigState();

  if (!supabase) {
    return { configured: false, telemetryId: null, config };
  }

  const drone = await ensureDrone(input.code, input.name);
  if (!drone) {
    return { configured: false, telemetryId: null, config };
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabase
    .from("drones")
    .update({
      status: input.status || "ready",
      current_lat: input.lat,
      current_lng: input.lng,
      battery_percent: input.batteryPercent,
      signal_percent: input.signalPercent,
      last_seen_at: now,
      updated_at: now,
    })
    .eq("id", drone.id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data, error } = await supabase
    .from("drone_telemetry")
    .insert({
      drone_id: drone.id,
      mission_id: input.missionId,
      lat: input.lat,
      lng: input.lng,
      altitude_m: input.altitudeM,
      speed_mps: input.speedMps,
      heading_deg: input.headingDeg,
      battery_percent: input.batteryPercent,
      signal_percent: input.signalPercent,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { configured: true, telemetryId: data.id as number, droneId: drone.id, config };
}

export async function recordDroneWaterEvent(input: DroneWaterEventInput) {
  const supabase = getSupabaseAdmin();
  const config = getSupabaseConfigState();

  if (!supabase) {
    return { configured: false, eventId: null, droneId: null, config };
  }

  const drone = await ensureDrone(input.code, input.name);
  if (!drone) {
    return { configured: false, eventId: null, droneId: null, config };
  }

  const now = new Date().toISOString();
  const droneUpdate: Record<string, unknown> = {
    status: "ready",
    last_seen_at: now,
    updated_at: now,
  };

  if (input.lat !== null && input.lng !== null) {
    droneUpdate.current_lat = input.lat;
    droneUpdate.current_lng = input.lng;
  }

  const { error: updateError } = await supabase.from("drones").update(droneUpdate).eq("id", drone.id);
  if (updateError) {
    throw new Error(updateError.message);
  }

  const { data, error } = await supabase
    .from("drone_water_events")
    .insert({
      drone_id: drone.id,
      device_code: normalizeCode(input.code),
      source_type: normalizeSourceType(input.sourceType),
      method: input.method,
      model_path: input.modelPath,
      yolo_depth_cm: input.depthCm,
      yolo_risk: input.risk,
      raw_severity: input.rawSeverity,
      confidence: normalizeConfidence(input.confidence),
      level_percent: input.levelPercent,
      waterline_y: input.waterlineY,
      frame_width: input.frameWidth,
      frame_height: input.frameHeight,
      lat: input.lat,
      lng: input.lng,
      location_accuracy_m: input.locationAccuracyM,
      detections: input.detections,
      raw_payload: input.rawPayload,
      created_at: input.createdAt || now,
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return { configured: true, eventId: data.id as string, droneId: drone.id, config };
}

export async function createDroneCapture(input: DroneCaptureInput) {
  const supabase = getSupabaseAdmin();
  const config = getSupabaseConfigState();

  if (!supabase) {
    return { configured: false, captureId: null, reportId: null, config };
  }

  const drone = await ensureDrone(input.code, input.name);
  if (!drone) {
    return { configured: false, captureId: null, reportId: null, config };
  }

  const imagePath = `drone-captures/${drone.code}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(input.image.name)}`;
  const imageBuffer = Buffer.from(await input.image.arrayBuffer());

  const { error: uploadError } = await supabase.storage
    .from(FLOOD_IMAGE_BUCKET)
    .upload(imagePath, imageBuffer, {
      contentType: input.image.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const priority = priorityFromWaterRisk(input.yolo.risk);

  const { data: capture, error: captureError } = await supabase
    .from("drone_captures")
    .insert({
      drone_id: drone.id,
      mission_id: input.missionId,
      image_path: imagePath,
      lat: input.lat,
      lng: input.lng,
      yolo_depth_cm: input.yolo.depthCm,
      yolo_risk: input.yolo.risk,
      yolo_confidence: input.yolo.confidence,
      yolo_labels: input.yolo.labels,
    })
    .select("id")
    .single();

  if (captureError) {
    throw new Error(captureError.message);
  }

  const { data: report, error: reportError } = await supabase
    .from("flood_reports")
    .insert({
      reporter_name: `Drone ${drone.code}`,
      image_path: imagePath,
      lat: input.lat,
      lng: input.lng,
      details: input.details,
      source: "drone",
      drone_capture_id: capture.id,
      yolo_depth_cm: input.yolo.depthCm,
      yolo_risk: input.yolo.risk,
      yolo_confidence: input.yolo.confidence,
      yolo_labels: input.yolo.labels,
      priority,
      status: "submitted",
    })
    .select("id")
    .single();

  if (reportError) {
    throw new Error(reportError.message);
  }

  await supabase.from("drone_captures").update({ flood_report_id: report.id }).eq("id", capture.id);

  return { configured: true, captureId: capture.id as string, reportId: report.id as string, droneId: drone.id, config };
}