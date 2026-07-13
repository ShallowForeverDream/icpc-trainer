import { NextRequest, NextResponse } from "next/server";
import { curatedProblems } from "../../../data/problems";
import { getProblemset, publicProblem } from "../../../lib/codeforces";

export async function GET(request: NextRequest) {
  try {
    const all = await getProblemset();
    const scope = request.nextUrl.searchParams.get("scope") ?? "curated";
    const byCode = new Map(all.map((problem) => [`${problem.contestId}${problem.index}`.toLowerCase(), problem]));

    if (scope === "single") {
      const code = (request.nextUrl.searchParams.get("code") ?? "").replace(/^CF\s*/i, "").toLowerCase();
      const problem = byCode.get(code);
      return problem ? NextResponse.json({ source: "codeforces", problem: publicProblem(problem) }) : NextResponse.json({ error: "题目不存在" }, { status: 404 });
    }

    if (scope === "all") {
      const min = Math.max(800, Number(request.nextUrl.searchParams.get("min")) || 800);
      const max = Math.min(3500, Number(request.nextUrl.searchParams.get("max")) || 3500);
      const page = Math.max(1, Number(request.nextUrl.searchParams.get("page")) || 1);
      const limit = Math.min(100, Math.max(20, Number(request.nextUrl.searchParams.get("limit")) || 60));
      const query = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
      const tags = [...new Set((request.nextUrl.searchParams.get("tags") ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))];
      const filtered = all.filter((problem) => problem.type === "PROGRAMMING" && problem.contestId && problem.rating && problem.rating >= min && problem.rating <= max && !problem.tags.includes("interactive") && (!tags.length || tags.some((tag) => problem.tags.includes(tag))) && (!query || `${problem.contestId}${problem.index} ${problem.name} ${problem.tags.join(" ")}`.toLowerCase().includes(query)));
      filtered.sort((a, b) => (a.rating ?? 0) - (b.rating ?? 0) || (b.contestId ?? 0) - (a.contestId ?? 0) || a.index.localeCompare(b.index));
      const offset = (page - 1) * limit;
      return NextResponse.json({ source: "codeforces", page, total: filtered.length, problems: filtered.slice(offset, offset + limit).map(publicProblem) }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=600" } });
    }

    const problems = curatedProblems.map((problem) => {
      const live = byCode.get(`${problem.contestId}${problem.index}`.toLowerCase());
      return live ? { ...problem, title: live.name, rating: live.rating ?? problem.rating } : problem;
    });
    return NextResponse.json({ source: "codeforces", syncedAt: new Date().toISOString(), problems }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=1800" } });
  } catch (error) {
    return NextResponse.json({ source: "fallback", warning: error instanceof Error ? error.message : "同步失败", problems: curatedProblems });
  }
}
