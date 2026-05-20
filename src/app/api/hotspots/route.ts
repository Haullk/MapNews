import { NextResponse } from "next/server";
import { queryMapHotspots } from "@/lib/hotspots";

function numberParam(url: URL, key: string) {
  const value = url.searchParams.get(key);
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const west = numberParam(url, "west");
  const south = numberParam(url, "south");
  const east = numberParam(url, "east");
  const north = numberParam(url, "north");

  try {
    const result = await queryMapHotspots({
      date: url.searchParams.get("date") || undefined,
      channel: url.searchParams.get("channel") || undefined,
      region: url.searchParams.get("region") || undefined,
      bbox:
        west === undefined || south === undefined || east === undefined || north === undefined
          ? undefined
          : { west, south, east, north },
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        hotspots: [],
        status: { ok: false, message: error instanceof Error ? error.message : "热点查询失败" },
      },
      { status: 500 },
    );
  }
}
