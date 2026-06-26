import { NextResponse } from "next/server";

import { getSupabaseAdmin, getSupabaseConfigState } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,OPTIONS",
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

async function countTable(table: string) {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { count, error } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true });

  if (error) return 0;
  return count || 0;
}

async function countAuthUsers() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return null;

  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error) return null;
  return typeof data.total === "number" ? data.total : data.users.length;
}

export function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function GET() {
  const config = getSupabaseConfigState();

  if (!config.configured) {
    return json({
      ok: true,
      configured: false,
      stats: {
        userCount: null,
        reportCount: 0,
        droneCount: 0,
        missionCount: 0,
        waterEventCount: 0,
      },
      config,
    });
  }

  const [userCount, reportCount, droneCount, missionCount, waterEventCount] = await Promise.all([
    countAuthUsers(),
    countTable("flood_reports"),
    countTable("drones"),
    countTable("drone_missions"),
    countTable("drone_water_events"),
  ]);

  return json({
    ok: true,
    configured: true,
    stats: {
      userCount,
      reportCount,
      droneCount,
      missionCount,
      waterEventCount,
    },
    config,
  });
}