import { NextResponse } from "next/server";
import { getDailyBrief } from "@/lib/hotspots";

export async function GET(request: Request) {
  const url = new URL(request.url);
  try {
    const brief = await getDailyBrief(url.searchParams.get("date") || undefined);
    return NextResponse.json({ brief });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "简报查询失败" }, { status: 500 });
  }
}
