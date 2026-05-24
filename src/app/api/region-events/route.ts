import { NextResponse } from "next/server";
import { queryRegionEvents } from "@/lib/hotspots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isDateString(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const regionKey = searchParams.get("regionKey")?.trim();
  const date = searchParams.get("date")?.trim();

  if (!regionKey) {
    return NextResponse.json({ error: "Missing regionKey" }, { status: 400 });
  }
  if (!date || !isDateString(date)) {
    return NextResponse.json({ error: "Invalid date" }, { status: 400 });
  }

  const limitParam = Number(searchParams.get("limit") ?? "30");
  const limit = Number.isFinite(limitParam) ? limitParam : 30;
  try {
    const payload = await queryRegionEvents(regionKey, date, limit);
    return NextResponse.json(payload);
  } catch (error) {
    return NextResponse.json(
      {
        events: [],
        status: {
          ok: false,
          message: error instanceof Error ? error.message : "地区事件时间线加载失败。",
        },
      },
      { status: 500 },
    );
  }
}
