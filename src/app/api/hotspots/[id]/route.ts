import { NextResponse } from "next/server";
import { getHotspotDetail } from "@/lib/hotspots";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const params = await context.params;
  const id = Number(params.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "Invalid hotspot id" }, { status: 400 });
  }
  const hotspot = await getHotspotDetail(id);
  if (!hotspot) {
    return NextResponse.json({ error: "Hotspot not found" }, { status: 404 });
  }
  return NextResponse.json({ hotspot });
}
