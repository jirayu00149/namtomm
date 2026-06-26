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

async function countReportUsers() {
  const supabase = getSupabaseAdmin();
  if (!supabase) return 0;

  const { data, error } = await supabase
    .from("flood_reports")
    .select("user_id,reporter_name")
    .order("created_at", { ascending: false })
    .limit(1000);

  if (error) return 0;

  const uniqueUsers = new Set<string>();
  let hasAnonymousReport = false;

  for (const row of data || []) {
    const userId = typeof row.user_id === "string" ? row.user_id.trim() : "";
    const reporterName = typeof row.reporter_name === "string" ? row.reporter_name.trim() : "";

    if (userId) {
      uniqueUsers.add(`user:${userId}`);
    } else if (reporterName) {
      uniqueUsers.add(`reporter:${reporterName}`);
    } else {
      hasAnonymousReport = true;
    }
  }

  return uniqueUsers.size + (hasAnonymousReport ? 1 : 0);
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
        authUserCount: null,
        reportUserCount: 0,
        reportCount: 0,
        droneCount: 0,
        missionCount: 0,
        waterEventCount: 0,
      },
      config,
    });
  }

  const [authUserCount, reportUserCount, reportCount, droneCount, missionCount, waterEventCount] = await Promise.all([
    countAuthUsers(),
    countReportUsers(),
    countTable("flood_reports"),
    countTable("drones"),
    countTable("drone_missions"),
    countTable("drone_water_events"),
  ]);
  const userCount = Math.max(authUserCount || 0, reportUserCount);

  return json({
    ok: true,
    configured: true,
    stats: {
      userCount,
      authUserCount,
      reportUserCount,
      reportCount,
      droneCount,
      missionCount,
      waterEventCount,
    },
    config,
  });
}
