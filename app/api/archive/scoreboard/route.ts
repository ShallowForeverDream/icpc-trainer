import { NextRequest, NextResponse } from "next/server";
import { findArchiveContest } from "../../../data/archive-contests";
import { archiveScoreboard } from "../../../lib/archive-scoreboard";

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") || "";
    const contest = findArchiveContest(id);
    if (!contest) return NextResponse.json({ error: "历届赛事不存在" }, { status: 404 });
    const elapsed = Math.max(0, Number(request.nextUrl.searchParams.get("elapsed")) || 0);
    const reveal = request.nextUrl.searchParams.get("reveal") === "1";
    const group = request.nextUrl.searchParams.get("group") || "all";
    return NextResponse.json(await archiveScoreboard(contest, elapsed, reveal, group), {
      headers: { "Cache-Control": "public, max-age=5, s-maxage=15, stale-while-revalidate=120" },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "真实榜单读取失败" }, { status: 502 });
  }
}
