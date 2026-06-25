import { NextResponse } from "next/server";

import { listDroneOperations } from "@/lib/database/drones";

export const runtime = "nodejs";

export async function GET() {
  try {
    const result = await listDroneOperations();
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to load drone operations.",
      },
      { status: 500 },
    );
  }
}
