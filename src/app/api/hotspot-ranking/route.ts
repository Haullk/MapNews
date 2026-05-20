import { NextResponse } from "next/server";
import { queryHotspotRanking } from "@/lib/hotspots";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const limitValue = Number(url.searchParams.get("limit") ?? "20");
  try {
    const items = await queryHotspotRanking({
      date: url.searchParams.get("date") || undefined,
      channel: url.searchParams.get("channel") || undefined,
      region: url.searchParams.get("region") || undefined,
      limit: Number.isFinite(limitValue) ? limitValue : 20,
    });
    return NextResponse.json({ items });
  } catch (error) {
    return NextResponse.json({ items: [], error: error instanceof Error ? error.message : "排行查询失败" }, { status: 500 });
  }
}
