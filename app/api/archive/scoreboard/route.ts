import { NextRequest, NextResponse } from "next/server";
import { findArchiveContest } from "../../../data/archive-contests";
import { archiveScoreboardUrl } from "../../../lib/archive-scoreboard";

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") || "";
    const contest = findArchiveContest(id);
    if (!contest) return NextResponse.json({ error: "历届赛事不存在" }, { status: 404 });
    const rawElapsed = Number(request.nextUrl.searchParams.get("elapsed"));
    const elapsed = Number.isFinite(rawElapsed) ? Math.min(24 * 60 * 60, Math.max(0, Math.floor(rawElapsed))) : 0;
    const reveal = request.nextUrl.searchParams.get("reveal") === "1";
    const group = (request.nextUrl.searchParams.get("group") || "all").slice(0, 100);
    // Sites edge cannot reliably proxy a bare-IP HTTPS origin. Redirecting lets
    // the browser call the API directly with the backend's existing CORS rules.
    return NextResponse.redirect(archiveScoreboardUrl(contest, elapsed, reveal, group), 307);
  } catch (error) {
    const message = error instanceof Error && /^(XCPCIO|Codeforces|真实榜单)/.test(error.message)
      ? error.message
      : "真实榜单暂时不可用，请稍后重试";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
