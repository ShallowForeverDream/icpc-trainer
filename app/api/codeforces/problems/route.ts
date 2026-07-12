import { NextResponse } from "next/server";
import { curatedProblems } from "../../../data/problems";

type CodeforcesProblem = { contestId?: number; index: string; name: string; rating?: number; tags: string[] };

export async function GET() {
  try {
    const response = await fetch("https://codeforces.com/api/problemset.problems?lang=en", { headers: { "User-Agent": "icpc-trainer/0.2" } });
    if (!response.ok) throw new Error(`Codeforces HTTP ${response.status}`);
    const payload = await response.json() as { status: string; comment?: string; result?: { problems: CodeforcesProblem[] } };
    if (payload.status !== "OK" || !payload.result) throw new Error(payload.comment ?? "Codeforces API failed");
    const byCode = new Map(payload.result.problems.map((problem) => [`${problem.contestId}${problem.index}`, problem]));
    const problems = curatedProblems.map((problem) => {
      const live = byCode.get(`${problem.contestId}${problem.index}`);
      return live ? { ...problem, title: live.name, rating: live.rating ?? problem.rating } : problem;
    });
    return NextResponse.json({ source: "codeforces", syncedAt: new Date().toISOString(), problems }, { headers: { "Cache-Control": "public, max-age=0, s-maxage=1800" } });
  } catch (error) {
    return NextResponse.json({ source: "fallback", syncedAt: null, warning: error instanceof Error ? error.message : "同步失败", problems: curatedProblems });
  }
}
