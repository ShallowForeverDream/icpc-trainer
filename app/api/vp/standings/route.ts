import { NextRequest, NextResponse } from "next/server";
import { getContestStandings, getUserSubmissions } from "../../../lib/codeforces";
import { buildOriginalVpRows, emptyVpStates, vpProblemKey, type VpStandingProblem, type VpStandingRow } from "../../../lib/vp-original-standings";

type StandingsRequest = { participants?: string[]; handle?: string; startedAt?: number; durationMinutes?: number; problems?: Array<Partial<VpStandingProblem>> };

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as StandingsRequest;
    const backend = process.env.ICPC_API_BASE_URL?.replace(/\/$/, "");
    if (backend) {
      try {
        const upstream = await fetch(`${backend}/vp/standings`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "icpc-trainer-sites/0.2" }, body: JSON.stringify(body) });
        const data = await upstream.json().catch(() => null);
        if (data) return NextResponse.json(data, { status: upstream.status });
      } catch { /* Cloudflare cannot always reach an HTTPS IP; fall back to Codeforces directly. */ }
    }
    const participants = [...new Set((body.participants?.length ? body.participants : [body.handle ?? "ShallowDream2"]).map((item) => item.trim()).filter(Boolean))].slice(0, 12);
    if (!participants.length || participants.some((handle) => !/^[A-Za-z0-9_.-]{3,24}$/.test(handle))) return NextResponse.json({ error: "参赛 Handle 列表无效" }, { status: 400 });
    const startedAt = Number(body.startedAt);
    const durationMinutes = Math.max(60, Math.min(600, Number(body.durationMinutes) || 180));
    const problems = (body.problems ?? []).slice(0, 20).filter((item) => Number(item.contestId) && /^[A-Z][0-9]?$/.test(String(item.index ?? ""))).map((item, index) => ({ contestId: Number(item.contestId), index: String(item.index), slot: String(item.slot || String.fromCharCode(65 + index)) }));
    if (!Number.isFinite(startedAt) || startedAt <= 0 || !problems.length) return NextResponse.json({ error: "比赛尚未开始或题目为空" }, { status: 400 });
    const startSeconds = Math.floor(startedAt / 1000);
    const endSeconds = startSeconds + durationMinutes * 60;
    const elapsedSeconds = Math.max(0, Math.min(durationMinutes * 60, Math.floor((Date.now() - startedAt) / 1000)));
    const problemKeys = new Set(problems.map(vpProblemKey));
    const contestIds = [...new Set(problems.map((problem) => problem.contestId))];
    const [sourceResults, submissionSets] = await Promise.all([
      Promise.allSettled(contestIds.map((contestId) => getContestStandings(contestId))),
      Promise.all(participants.map((handle) => getUserSubmissions(handle, 1000, 15_000, true))),
    ]);
    const sourceBoards = sourceResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const originalRows = buildOriginalVpRows(problems, sourceBoards, elapsedSeconds);
    const currentRows: VpStandingRow[] = [];
    for (let participantIndex = 0; participantIndex < participants.length; participantIndex++) {
      const handle = participants[participantIndex];
      const states = emptyVpStates(problems);
      const submissions = submissionSets[participantIndex];
      for (const submission of submissions.filter((item) => item.creationTimeSeconds >= startSeconds && item.creationTimeSeconds <= endSeconds && problemKeys.has(`${item.problem.contestId}${item.problem.index}`)).sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds)) {
        const state = states[`${submission.problem.contestId}${submission.problem.index}`];
        if (!state || state.solved) continue;
        if (submission.verdict === "OK") { state.solved = true; state.pendingAttempts = 0; state.solvedMinutes = Math.floor((submission.creationTimeSeconds - startSeconds) / 60); state.penalty = state.solvedMinutes + state.wrongAttempts * 20; }
        else if (submission.verdict === "TESTING") state.pendingAttempts += 1;
        else if (!["COMPILATION_ERROR", "SKIPPED"].includes(submission.verdict ?? "")) state.wrongAttempts += 1;
      }
      const values = Object.values(states);
      currentRows.push({ id: `mine:${handle.toLowerCase()}`, handle, solved: values.filter((state) => state.solved).length, penalty: values.reduce((sum, state) => sum + state.penalty, 0), problems: states, sourceCount: 0, sourceContests: [], origin: "mine", mine: true });
    }
    const rows = [...originalRows, ...currentRows].sort((left, right) => right.solved - left.solved || left.penalty - right.penalty || Number(left.mine) - Number(right.mine) || left.handle.localeCompare(right.handle));
    rows.forEach((row, index) => { row.rank = index && rows[index - 1].solved === row.solved && rows[index - 1].penalty === row.penalty ? rows[index - 1].rank : index + 1; });
    const visible = rows.slice(0, 120);
    for (const row of currentRows) if (!visible.some((item) => item.id === row.id)) visible.push(row);
    return NextResponse.json({
      updatedAt: new Date().toISOString(), startedAt, durationMinutes, elapsedSeconds,
      pollAfterSeconds: Math.max(15, Math.ceil(participants.length * 2.5)), totalRows: rows.length, originalTeams: originalRows.length,
      unavailableContestIds: contestIds.filter((_, index) => sourceResults[index].status === "rejected"),
      sourceBoards: sourceBoards.map((source) => ({ contestId: source.contest.id, name: source.contest.name, selectedProblems: problems.filter((problem) => problem.contestId === source.contest.id).map((problem) => problem.slot), sampledTeams: source.rows.length })),
      rows: visible,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "榜单同步失败" }, { status: 502 });
  }
}
