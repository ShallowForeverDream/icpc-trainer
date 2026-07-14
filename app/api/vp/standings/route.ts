import { NextRequest, NextResponse } from "next/server";
import { getContestStandings, getUserSubmissions } from "../../../lib/codeforces";
import { buildOriginalVpRows, buildParticipantVpRows, rankVpRows, type VpStandingProblem } from "../../../lib/vp-original-standings";

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
    const durationSeconds = durationMinutes * 60;
    const elapsedSeconds = Math.max(0, Math.min(durationSeconds, Math.floor((Date.now() - startedAt) / 1000)));
    const freezeAtSeconds = Math.max(0, durationSeconds - 60 * 60);
    const finished = elapsedSeconds >= durationSeconds;
    const frozen = !finished && elapsedSeconds >= freezeAtSeconds;
    const boardElapsedSeconds = frozen ? freezeAtSeconds : elapsedSeconds;
    const contestIds = [...new Set(problems.map((problem) => problem.contestId))];
    const [sourceResults, submissionSets] = await Promise.all([
      Promise.allSettled(contestIds.map((contestId) => getContestStandings(contestId))),
      Promise.all(participants.map((handle) => getUserSubmissions(handle, 1000, 15_000, true))),
    ]);
    const sourceBoards = sourceResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
    const originalRows = buildOriginalVpRows(problems, sourceBoards, boardElapsedSeconds);
    const participantRows = buildParticipantVpRows(participants, problems, startedAt, submissionSets, elapsedSeconds);
    const boardParticipantRows = frozen ? buildParticipantVpRows(participants, problems, startedAt, submissionSets, freezeAtSeconds) : participantRows;
    const ranked = rankVpRows(originalRows, boardParticipantRows);
    const rows = ranked.rows;
    const rankedById = new Map(rows.map((row) => [row.id, row]));
    const liveParticipantRows = participantRows.map((row) => ({ ...row, rank: rankedById.get(row.id)?.rank || rows.length, medal: rankedById.get(row.id)?.medal || null }));
    const visible = rows.slice(0, 120);
    for (const row of boardParticipantRows) if (!visible.some((item) => item.id === row.id)) visible.push(rankedById.get(row.id) || row);
    return NextResponse.json({
      updatedAt: new Date().toISOString(), startedAt, durationMinutes, elapsedSeconds, freezeAtSeconds, frozen, finished,
      pollAfterSeconds: Math.max(15, Math.ceil(participants.length * 2.5)), totalRows: rows.length, originalTeams: originalRows.length,
      unavailableContestIds: contestIds.filter((_, index) => sourceResults[index].status === "rejected"),
      sourceBoards: sourceBoards.map((source) => ({ contestId: source.contest.id, name: source.contest.name, selectedProblems: problems.filter((problem) => problem.contestId === source.contest.id).map((problem) => problem.slot), sampledTeams: source.rows.length })),
      medalCutoffs: ranked.cutoffs,
      participantRows: liveParticipantRows,
      rows: visible,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "榜单同步失败" }, { status: 502 });
  }
}
