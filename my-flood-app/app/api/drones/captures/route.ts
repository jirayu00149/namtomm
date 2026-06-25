import { NextRequest, NextResponse } from "next/server";

import { analyzeWaterLevelWithYolo } from "@/lib/ai/yolo-water-level";
import { createDroneCapture } from "@/lib/database/drones";

export const runtime = "nodejs";

function parseNumber(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getText(value: FormDataEntryValue | null, fallback = "") {
  return typeof value === "string" ? value.trim() : fallback;
}

function requireGatewayToken(request: NextRequest) {
  const expected = process.env.DRONE_GATEWAY_TOKEN || process.env.ADMIN_API_TOKEN;
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return Boolean(expected && actual === expected);
}

export async function POST(request: NextRequest) {
  if (!requireGatewayToken(request)) {
    return NextResponse.json({ ok: false, message: "Drone gateway token is required." }, { status: 403 });
  }

  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ ok: false, message: "Use multipart/form-data with image, code, lat and lng." }, { status: 400 });
    }

    const formData = await request.formData();
    const image = formData.get("image");
    const code = getText(formData.get("code"));
    const name = getText(formData.get("name"), code);
    const lat = parseNumber(formData.get("lat"));
    const lng = parseNumber(formData.get("lng"));

    if (!(image instanceof File) || image.size === 0) {
      return NextResponse.json({ ok: false, message: "Image is required." }, { status: 400 });
    }

    if (!code || lat === null || lng === null) {
      return NextResponse.json({ ok: false, message: "code, lat and lng are required." }, { status: 400 });
    }

    const yolo = await analyzeWaterLevelWithYolo(image);
    const result = await createDroneCapture({
      code,
      name,
      image,
      lat,
      lng,
      missionId: getText(formData.get("missionId")) || null,
      details: getText(formData.get("details")),
      yolo,
    });

    if (!result.configured) {
      return NextResponse.json({ ok: false, configured: false, yolo, message: "Supabase is not configured." }, { status: 503 });
    }

    return NextResponse.json({ ok: true, ...result, yolo }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to create drone capture.",
      },
      { status: 500 },
    );
  }
}
