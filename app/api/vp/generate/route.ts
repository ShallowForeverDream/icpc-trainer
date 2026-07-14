import { NextRequest, NextResponse } from "next/server";
import { getProblemset, getUserSubmissions, publicProblem, type CodeforcesProblem } from "../../../lib/codeforces";

type GenerateRequest = { handle?: string; participants?: string[]; mode?: string; count?: number; targetRating?: number; thinkingRatio?: number; durationMinutes?: number; seed?: string };

const THINKING_TAGS = new Set(["constructive algorithms", "greedy", "math", "number theory", "combinatorics", "games", "bitmasks", "two pointers", "binary search", "brute force", "probabilities", "meet-in-the-middle", "ternary search"]);

function isThinkingProblem(problem: CodeforcesProblem) {
  return problem.tags.some((tag) => THINKING_TAGS.has(tag));
}

function hashSeed(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function randomFromSeed(seed: string) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function pickRandomSet(pool: CodeforcesProblem[], count: number, target: number, random: () => number) {
  const selected: CodeforcesProblem[] = [];
  const used = new Set<string>();
  for (let index = 0; index < count; index++) {
    const desired = Math.round((target - 500 + (count === 1 ? 0 : index * 1000 / (count - 1))) / 100) * 100;
    const candidates = pool.filter((problem) => !used.has(`${problem.contestId}${problem.index}`)).sort((a, b) => Math.abs((a.rating ?? target) - desired) - Math.abs((b.rating ?? target) - desired));
    const window = candidates.slice(0, Math.min(24, candidates.length));
    const chosen = window[Math.floor(random() * window.length)];
    if (!chosen) break;
    selected.push(chosen);
    used.add(`${chosen.contestId}${chosen.index}`);
  }
  return selected;
}

function pickThinkingSet(pool: CodeforcesProblem[], count: number, target: number, thinkingRatio: number, random: () => number) {
  const selected: CodeforcesProblem[] = [];
  const used = new Set<string>();
  const contestUsage = new Map<number, number>();
  const tagUsage = new Map<string, number>();
  const thinkingTarget = Math.min(count, Math.max(0, Math.round(count * thinkingRatio)));
  let thinkingPicked = 0;
  for (let index = 0; index < count; index++) {
    const desired = Math.round((target - 500 + (count === 1 ? 0 : index * 1000 / (count - 1))) / 100) * 100;
    const remaining = count - index;
    const scheduledThinking = Math.floor((index + 1) * thinkingTarget / count) > Math.floor(index * thinkingTarget / count);
    const mustPickThinking = thinkingPicked < thinkingTarget && (scheduledThinking || thinkingTarget - thinkingPicked >= remaining);
    const candidates = pool.filter((problem) => !used.has(`${problem.contestId}${problem.index}`));
    const thinkingCandidates = mustPickThinking ? candidates.filter(isThinkingProblem) : [];
    const candidatePool = thinkingCandidates.length ? thinkingCandidates : candidates;
    candidatePool.sort((left, right) => {
      const score = (problem: CodeforcesProblem) => Math.abs((problem.rating ?? target) - desired)
        + (contestUsage.get(problem.contestId ?? 0) ?? 0) * 90
        + problem.tags.reduce((sum, tag) => sum + (tagUsage.get(tag) ?? 0) * 14, 0)
        - (thinkingPicked < thinkingTarget && isThinkingProblem(problem) ? 24 : 0);
      return score(left) - score(right);
    });
    const window = candidatePool.slice(0, Math.min(16, candidatePool.length));
    const chosen = window[Math.floor(random() * window.length)];
    if (!chosen) break;
    selected.push(chosen);
    used.add(`${chosen.contestId}${chosen.index}`);
    if (chosen.contestId) contestUsage.set(chosen.contestId, (contestUsage.get(chosen.contestId) ?? 0) + 1);
    for (const tag of chosen.tags) tagUsage.set(tag, (tagUsage.get(tag) ?? 0) + 1);
    if (isThinkingProblem(chosen)) thinkingPicked += 1;
  }
  return selected;
}

function pickMirror(pool: CodeforcesProblem[], desiredCount: number, target: number, random: () => number) {
  const groups = new Map<number, CodeforcesProblem[]>();
  for (const problem of pool) {
    if (!problem.contestId) continue;
    const group = groups.get(problem.contestId) ?? [];
    group.push(problem);
    groups.set(problem.contestId, group);
  }
  const candidates = [...groups.entries()].map(([contestId, problems]) => ({ contestId, problems: problems.sort((a, b) => a.index.localeCompare(b.index)), average: problems.reduce((sum, item) => sum + (item.rating ?? target), 0) / problems.length })).filter((item) => item.problems.length >= 5 && item.problems.length <= 13).sort((a, b) => (Math.abs(a.problems.length - desiredCount) * 200 + Math.abs(a.average - target)) - (Math.abs(b.problems.length - desiredCount) * 200 + Math.abs(b.average - target)));
  return candidates[Math.floor(random() * Math.min(12, candidates.length))] ?? null;
}

function pickCombined(pool: CodeforcesProblem[], desiredCount: number, target: number, random: () => number) {
  const groups = new Map<number, CodeforcesProblem[]>();
  for (const problem of pool) {
    if (!problem.contestId) continue;
    const group = groups.get(problem.contestId) ?? [];
    group.push(problem);
    groups.set(problem.contestId, group);
  }
  const candidates = [...groups].map(([contestId, problems]) => ({ contestId, problems, average: problems.reduce((sum, item) => sum + (item.rating ?? target), 0) / problems.length })).filter((item) => item.problems.length >= 2).sort((a, b) => Math.abs(a.average - target) - Math.abs(b.average - target));
  const chosen = [];
  const window = candidates.slice(0, 24);
  const sourceCount = Math.min(4, Math.max(2, Math.ceil(desiredCount / 4)));
  while (chosen.length < sourceCount && window.length) chosen.push(window.splice(Math.floor(random() * window.length), 1)[0]);
  if (chosen.length < 2) return null;
  return { selected: pickRandomSet(chosen.flatMap((item) => item.problems), desiredCount, target, random), contestIds: chosen.map((item) => item.contestId) };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as GenerateRequest;
    const backend = process.env.ICPC_API_BASE_URL?.replace(/\/$/, "");
    if (backend) {
      try {
        const upstream = await fetch(`${backend}/vp/generate`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "icpc-trainer-sites/0.1" }, body: JSON.stringify(body) });
        const data = await upstream.json().catch(() => null);
        if (data) return NextResponse.json(data, { status: upstream.status });
      } catch { /* Cloudflare cannot always reach an HTTPS IP; fall back to Codeforces directly. */ }
    }
    const participants = [...new Set((body.participants?.length ? body.participants : [body.handle ?? "ShallowDream2"]).map((item) => item.trim()).filter(Boolean))].slice(0, 12);
    if (!participants.length || participants.some((item) => !/^[A-Za-z0-9_.-]{3,24}$/.test(item))) return NextResponse.json({ error: "参赛 Handle 列表无效" }, { status: 400 });
    const handle = participants[0];
    const count = Math.max(5, Math.min(13, Number(body.count) || 10));
    const targetRating = Math.max(800, Math.min(3000, Number(body.targetRating) || 1600));
    const thinkingRatio = Math.max(0.4, Math.min(0.8, Number(body.thinkingRatio) || 0.6));
    const durationMinutes = Math.max(60, Math.min(300, Number(body.durationMinutes) || 180));
    const seed = (body.seed ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`).slice(0, 64);
    const random = randomFromSeed(seed);

    const [problemset, submissions] = await Promise.all([getProblemset(true), getUserSubmissions(handle, 1000, 60_000, true)]);
    const solved = new Set(submissions.filter((item) => item.verdict === "OK" && item.problem.contestId).map((item) => `${item.problem.contestId}${item.problem.index}`));
    const pool = problemset.filter((problem) => problem.type === "PROGRAMMING" && problem.contestId && problem.rating && problem.rating >= Math.max(800, targetRating - 800) && problem.rating <= targetRating + 900 && !problem.tags.includes("interactive") && !solved.has(`${problem.contestId}${problem.index}`));

    let selected: CodeforcesProblem[] = [];
    let sourceContestId: number | null = null;
    let sourceContestIds: number[] = [];
    if (body.mode === "原场镜像") {
      const mirror = pickMirror(pool, count, targetRating, random);
      if (!mirror) return NextResponse.json({ error: "没有找到符合条件的历史比赛，请调整目标 Rating" }, { status: 422 });
      selected = mirror.problems;
      sourceContestId = mirror.contestId;
      sourceContestIds = [mirror.contestId];
    } else if (body.mode === "多场组合") {
      const combined = pickCombined(pool, count, targetRating, random);
      if (!combined) return NextResponse.json({ error: "没有找到足够的历史比赛用于组合" }, { status: 422 });
      selected = combined.selected;
      sourceContestIds = combined.contestIds;
    } else {
      selected = pickThinkingSet(pool, count, targetRating, thinkingRatio, random);
    }
    if (selected.length < 5) return NextResponse.json({ error: "可用题目不足，请调整组卷条件" }, { status: 422 });

    if (!sourceContestIds.length) sourceContestIds = [...new Set(selected.map((problem) => problem.contestId).filter((value): value is number => Boolean(value)))];
    const sourceContests = sourceContestIds.map((contestId) => {
      const sourceProblems = selected.filter((problem) => problem.contestId === contestId);
      return { contestId, problemCount: sourceProblems.length, averageRating: Math.round(sourceProblems.reduce((sum, item) => sum + (item.rating ?? targetRating), 0) / Math.max(1, sourceProblems.length)), url: `https://codeforces.com/contest/${contestId}/standings` };
    });
    return NextResponse.json({
      id: `vp-${hashSeed(`${seed}:${handle}`).toString(16)}`,
      handle,
      participants,
      mode: body.mode === "原场镜像" ? "原场镜像" : body.mode === "多场组合" ? "多场组合" : "自由组卷",
      seed,
      durationMinutes,
      targetRating,
      thinkingRatio,
      thinkingCount: selected.filter(isThinkingProblem).length,
      sourceContestId,
      sourceContests,
      excludedSolved: solved.size,
      createdAt: new Date().toISOString(),
      problems: selected.map((problem, index) => ({ slot: String.fromCharCode(65 + index), ...publicProblem(problem), thinking: isThinkingProblem(problem) })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "VP 生成失败" }, { status: 502 });
  }
}
