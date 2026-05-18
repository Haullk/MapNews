import { NextResponse } from "next/server";
import { queryMapEvents } from "@/lib/events";

function numberParam(url: URL, key: string) {
  const value = url.searchParams.get(key);
  if (!value) {
    return undefined;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const west = numberParam(url, "west");
  const south = numberParam(url, "south");
  const east = numberParam(url, "east");
  const north = numberParam(url, "north");
  const zoom = numberParam(url, "zoom");

  try {
    const events = await queryMapEvents({
      date: url.searchParams.get("date") || undefined,
      eventCode: url.searchParams.get("eventCode") || undefined,
      country: url.searchParams.get("country") || undefined,
      zoom,
      bbox:
        west === undefined || south === undefined || east === undefined || north === undefined
          ? undefined
          : { west, south, east, north },
    });

    return NextResponse.json({ events });
  } catch (error) {
    return NextResponse.json(
      {
        events: [],
        error: error instanceof Error ? error.message : "Unknown map query error",
      },
      { status: 500 },
    );
  }
}
