import { NextResponse } from "next/server";
import { queryRegionTrend } from "@/lib/hotspots";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const regionKey = searchParams.get("regionKey")?.trim();
  if (!regionKey) {
    return NextResponse.json({ error: "Missing regionKey" }, { status: 400 });
  }

  const daysParam = Number(searchParams.get("days") ?? "90");
  const days = Number.isFinite(daysParam) ? daysParam : 90;
  const date = searchParams.get("date") ?? undefined;
  const scoreVersion = searchParams.get("scoreVersion") ?? undefined;
  const trend = await queryRegionTrend(regionKey, date, days, scoreVersion);
  return NextResponse.json({ trend });
}
