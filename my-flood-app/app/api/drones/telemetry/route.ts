import { NextRequest, NextResponse } from "next/server";

import { recordDroneTelemetry } from "@/lib/database/drones";

export const runtime = "nodejs";

function getNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
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
    const payload = (await request.json()) as Record<string, unknown>;
    const code = typeof payload.code === "string" ? payload.code.trim() : "";
    const name = typeof payload.name === "string" ? payload.name.trim() : code;
    const lat = getNumber(payload.lat);
    const lng = getNumber(payload.lng);

    if (!code || lat === null || lng === null) {
      return NextResponse.json({ ok: false, message: "code, lat and lng are required." }, { status: 400 });
    }

    const result = await recordDroneTelemetry({
      code,
      name,
      status: typeof payload.status === "string" ? (payload.status as never) : undefined,
      lat,
      lng,
      altitudeM: getNumber(payload.altitudeM ?? payload.altitude_m),
      speedMps: getNumber(payload.speedMps ?? payload.speed_mps),
      headingDeg: getNumber(payload.headingDeg ?? payload.heading_deg),
      batteryPercent: getNumber(payload.batteryPercent ?? payload.battery_percent),
      signalPercent: getNumber(payload.signalPercent ?? payload.signal_percent),
      missionId: typeof payload.missionId === "string" ? payload.missionId : null,
    });

    if (!result.configured) {
      return NextResponse.json({ ok: false, configured: false, message: "Supabase is not configured." }, { status: 503 });
    }

    return NextResponse.json({ ok: true, ...result }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to record drone telemetry.",
      },
      { status: 500 },
    );
  }
}
