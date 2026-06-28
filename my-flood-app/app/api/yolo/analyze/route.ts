import { NextRequest, NextResponse } from "next/server";

import { analyzeWaterLevelWithYolo } from "@/lib/ai/yolo-water-level";

export const runtime = "nodejs";

const MAX_IMAGES = 8;

function imageFiles(formData: FormData) {
  const values = [...formData.getAll("images"), ...formData.getAll("image")];
  const files = values.filter((value): value is File => value instanceof File && value.size > 0);

  return files.slice(0, MAX_IMAGES);
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    configured: Boolean(process.env.YOLO_API_URL),
    maxImages: MAX_IMAGES,
  });
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.includes("multipart/form-data")) {
      return NextResponse.json({ ok: false, message: "Use multipart/form-data with image or images." }, { status: 400 });
    }

    const formData = await request.formData();
    const files = imageFiles(formData);

    if (files.length === 0) {
      return NextResponse.json({ ok: false, message: "At least one image is required." }, { status: 400 });
    }

    const results = [];
    for (const image of files) {
      const yolo = await analyzeWaterLevelWithYolo(image);
      results.push({
        fileName: image.name || "image",
        size: image.size,
        yolo,
      });
    }

    return NextResponse.json({
      ok: true,
      configured: Boolean(process.env.YOLO_API_URL),
      count: results.length,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Failed to analyze images.",
      },
      { status: 500 },
    );
  }
}
