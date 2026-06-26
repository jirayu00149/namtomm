import { NextRequest, NextResponse } from "next/server";

import { analyzeWaterLevelWithYolo } from "@/lib/ai/yolo-water-level";
import { validateFloodReport } from "@/lib/ai/report-validation";
import {
  clearFloodReports,
  createFloodReport,
  listFloodReports,
} from "@/lib/database/flood-reports";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

function json(data: unknown, init: ResponseInit = {}) {
  return NextResponse.json(data, {
    ...init,
    headers: {
      ...corsHeaders,
      ...init.headers,
    },
  });
}

function parseNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getText(value: FormDataEntryValue | null, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET() {
  try {
    const result = await listFloodReports();
    return json({ ok: true, ...result });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to load flood reports.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data") && !contentType.includes("application/x-www-form-urlencoded")) {
      return json({ ok: false, message: "Use multipart/form-data with image, lat and lng." }, { status: 400 });
    }

    const formData = await request.formData();
    const image = formData.get("image");
    const lat = parseNumber(formData.get("lat"));
    const lng = parseNumber(formData.get("lng"));
    const locationAccuracyM = parseNumber(formData.get("locationAccuracyM"));
    const locationSource = getText(formData.get("locationSource"), "unknown");

    if (!(image instanceof File) || image.size === 0) {
      return json({ ok: false, message: "Image is required." }, { status: 400 });
    }

    if (lat === null || lng === null) {
      return json({ ok: false, message: "Valid lat and lng are required." }, { status: 400 });
    }

    const yolo = await analyzeWaterLevelWithYolo(image);
    const validation = validateFloodReport({ yolo, lat, lng, locationSource, locationAccuracyM });

    if (validation.verdict === "rejected") {
      return json({ ok: false, rejected: true, yolo, validation, message: validation.reason }, { status: 422 });
    }

    const result = await createFloodReport({
      image,
      lat,
      lng,
      details: getText(formData.get("details")),
      reporterName: getText(formData.get("reporterName"), "ผู้ใช้ไม่ระบุชื่อ"),
      userId: getText(formData.get("userId")) || null,
      yolo,
    });

    if (!result.configured) {
      return json(
        {
          ok: false,
          configured: false,
          yolo,
          message: "Supabase is not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
        },
        { status: 503 },
      );
    }

    return json({ ok: true, configured: true, report: result.report, yolo, validation }, { status: 201 });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to create flood report.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const expectedToken = process.env.ADMIN_API_TOKEN;
  const actualToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  if (!expectedToken || actualToken !== expectedToken) {
    return json({ ok: false, message: "Admin token is required." }, { status: 403 });
  }

  try {
    const result = await clearFloodReports();
    return json({ ok: true, ...result });
  } catch (error) {
    return json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to clear flood reports.",
      },
      { status: 500 },
    );
  }
}
