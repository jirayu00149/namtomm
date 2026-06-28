import { getSupabaseAdmin, getSupabaseConfigState } from "@/lib/supabase/admin";
import { priorityFromWaterRisk, type YoloWaterLevelResult } from "@/lib/ai/yolo-water-level";
import type { SupabaseClient } from "@supabase/supabase-js";

const FLOOD_IMAGE_BUCKET = "flood-images";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ReportPriority = "critical" | "warning" | "normal";
export type ReportStatus = "submitted" | "reviewing" | "assigned" | "resolved";

export type FloodReport = {
  id: string;
  userId: string | null;
  reporterName: string;
  imagePath: string;
  imageUrl: string | null;
  lat: number;
  lng: number;
  details: string;
  depthCm: number | null;
  risk: string;
  confidence: number | null;
  labels: string[];
  priority: ReportPriority;
  status: ReportStatus;
  createdAt: string;
};

type FloodReportRow = {
  id: string;
  user_id: string | null;
  reporter_name: string | null;
  image_path: string;
  lat: number;
  lng: number;
  details: string | null;
  yolo_depth_cm: number | null;
  yolo_risk: string | null;
  yolo_confidence: number | null;
  yolo_labels: string[] | null;
  priority: ReportPriority;
  status: ReportStatus;
  created_at: string;
};

type CreateFloodReportInput = {
  image: File;
  lat: number;
  lng: number;
  details: string;
  reporterName: string;
  userId: string | null;
  yolo: YoloWaterLevelResult;
};

function sanitizeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "flood-image.jpg";
}

function normalizeUserId(userId: string | null) {
  const candidate = userId?.trim();
  return candidate && UUID_PATTERN.test(candidate) ? candidate : null;
}

async function resolveExistingUserId(supabase: SupabaseClient, userId: string | null) {
  const candidate = normalizeUserId(userId);
  if (!candidate) {
    return null;
  }

  const { data, error } = await supabase.auth.admin.getUserById(candidate);
  if (error || !data.user) {
    return null;
  }

  return data.user.id;
}

function toReport(row: FloodReportRow, imageUrl: string | null = null): FloodReport {
  return {
    id: row.id,
    userId: row.user_id,
    reporterName: row.reporter_name || "ผู้ใช้ไม่ระบุชื่อ",
    imagePath: row.image_path,
    imageUrl,
    lat: Number(row.lat),
    lng: Number(row.lng),
    details: row.details || "",
    depthCm: row.yolo_depth_cm,
    risk: row.yolo_risk || "pending",
    confidence: row.yolo_confidence,
    labels: row.yolo_labels || [],
    priority: row.priority,
    status: row.status,
    createdAt: row.created_at,
  };
}

async function signImageUrl(imagePath: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase.storage
    .from(FLOOD_IMAGE_BUCKET)
    .createSignedUrl(imagePath, 60 * 10);

  if (error) {
    return null;
  }

  return data.signedUrl;
}

export async function listFloodReports() {
  const supabase = getSupabaseAdmin();
  const config = getSupabaseConfigState();

  if (!supabase) {
    return { configured: false, reports: [] as FloodReport[], config };
  }

  const { data, error } = await supabase
    .from("flood_reports")
    .select(
      "id,user_id,reporter_name,image_path,lat,lng,details,yolo_depth_cm,yolo_risk,yolo_confidence,yolo_labels,priority,status,created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(error.message);
  }

  const rows = (data || []) as FloodReportRow[];
  const reports = await Promise.all(
    rows.map(async (row) => toReport(row, await signImageUrl(row.image_path))),
  );

  return { configured: true, reports, config };
}

export async function createFloodReport(input: CreateFloodReportInput) {
  const supabase = getSupabaseAdmin();
  const config = getSupabaseConfigState();

  if (!supabase) {
    return { configured: false, report: null, config };
  }

  const verifiedUserId = await resolveExistingUserId(supabase, input.userId);
  const owner = verifiedUserId || "anonymous";
  const imagePath = `reports/${owner}/${Date.now()}-${crypto.randomUUID()}-${sanitizeFileName(input.image.name)}`;
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

  const priority = priorityFromWaterRisk(input.yolo.risk) as ReportPriority;

  const { data, error } = await supabase
    .from("flood_reports")
    .insert({
      user_id: verifiedUserId,
      reporter_name: input.reporterName,
      image_path: imagePath,
      lat: input.lat,
      lng: input.lng,
      details: input.details,
      yolo_depth_cm: input.yolo.depthCm,
      yolo_risk: input.yolo.risk,
      yolo_confidence: input.yolo.confidence,
      yolo_labels: input.yolo.labels,
      priority,
      status: "submitted",
    })
    .select(
      "id,user_id,reporter_name,image_path,lat,lng,details,yolo_depth_cm,yolo_risk,yolo_confidence,yolo_labels,priority,status,created_at",
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  const row = data as FloodReportRow;
  return { configured: true, report: toReport(row, await signImageUrl(row.image_path)), config };
}

export async function clearFloodReports() {
  const supabase = getSupabaseAdmin();
  const config = getSupabaseConfigState();

  if (!supabase) {
    return { configured: false, deleted: 0, config };
  }

  const { data, error } = await supabase
    .from("flood_reports")
    .delete()
    .neq("id", "00000000-0000-0000-0000-000000000000")
    .select("id");

  if (error) {
    throw new Error(error.message);
  }

  return { configured: true, deleted: data?.length || 0, config };
}
