import { NextResponse } from "next/server";
import { getDataStatus } from "@/lib/hotspots";

export async function GET() {
  const status = await getDataStatus();
  return NextResponse.json({ status });
}
