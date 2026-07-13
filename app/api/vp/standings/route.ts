import { NextRequest, NextResponse } from "next/server";
import { getUserSubmissions } from "../../../lib/codeforces";

type StandingsProblem = { contestId: number; index: string };
type StandingsRequest = { participants?: string[]; handle?: string; startedAt?: number; durationMinutes?: number; problems?: StandingsProblem[] };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as StandingsRequest;
    const backend = process.env.ICPC_API_BASE_URL?.replace(/\/$/, "");
    if (backend) {
      const upstream = await fetch(`${backend}/vp/standings`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "icpc-trainer-sites/0.2" }, body: JSON.stringify(body) });
      return NextResponse.json(await upstream.json(), { status: upstream.status });
    }
    const participants = [...new Set((body.participants?.length ? body.participants : [body.handle ?? "ShallowDream2"]).map((item) => item.trim()).filter(Boolean))].slice(0, 12);
    if (!participants.length || participants.some((handle) => !/^[A-Za-z0-9_.-]{3,24}$/.test(handle))) return NextResponse.json({ error: "参赛 Handle 列表无效" }, { status: 400 });
    const startedAt = Number(body.startedAt);
    const durationMinutes = Math.max(60, Math.min(600, Number(body.durationMinutes) || 180));
    const problems = (body.problems ?? []).slice(0, 20);
    if (!Number.isFinite(startedAt) || startedAt <= 0 || !problems.length) return NextResponse.json({ error: "比赛尚未开始或题目为空" }, { status: 400 });
    const startSeconds = Math.floor(startedAt / 1000);
    const endSeconds = startSeconds + durationMinutes * 60;
    const problemKeys = new Set(problems.map((problem) => `${problem.contestId}${problem.index}`));
    const rows = [];
    for (const handle of participants) {
      const submissions = await getUserSubmissions(handle, 1000);
      const states = new Map(problems.map((problem) => [`${problem.contestId}${problem.index}`, { solved: false, wrongAttempts: 0, solvedMinutes: null as number | null, penalty: 0 }]));
      for (const submission of submissions.filter((item) => item.creationTimeSeconds >= startSeconds && item.creationTimeSeconds <= endSeconds && problemKeys.has(`${item.problem.contestId}${item.problem.index}`)).sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds)) {
        const state = states.get(`${submission.problem.contestId}${submission.problem.index}`);
        if (!state || state.solved) continue;
        if (submission.verdict === "OK") { state.solved = true; state.solvedMinutes = Math.floor((submission.creationTimeSeconds - startSeconds) / 60); state.penalty = state.solvedMinutes + state.wrongAttempts * 20; }
        else if (!["COMPILATION_ERROR", "SKIPPED", "TESTING"].includes(submission.verdict ?? "")) state.wrongAttempts += 1;
      }
      const solved = [...states.values()].filter((state) => state.solved).length;
      const penalty = [...states.values()].reduce((sum, state) => sum + state.penalty, 0);
      rows.push({ handle, solved, penalty, problems: Object.fromEntries(states), rank: 0 });
    }
    rows.sort((a, b) => b.solved - a.solved || a.penalty - b.penalty || a.handle.localeCompare(b.handle));
    rows.forEach((row, index) => { row.rank = index && rows[index - 1].solved === row.solved && rows[index - 1].penalty === row.penalty ? rows[index - 1].rank : index + 1; });
    return NextResponse.json({ updatedAt: new Date().toISOString(), startedAt, durationMinutes, rows });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "榜单同步失败" }, { status: 502 });
  }
}
