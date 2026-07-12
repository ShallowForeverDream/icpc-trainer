import { NextRequest, NextResponse } from "next/server";
import { getProblemset, getUserSubmissions, publicProblem, type CodeforcesProblem } from "../../../lib/codeforces";

type GenerateRequest = { handle?: string; mode?: string; count?: number; targetRating?: number; durationMinutes?: number; seed?: string };

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as GenerateRequest;
    const handle = (body.handle ?? "ShallowDream2").trim();
    if (!/^[A-Za-z0-9_.-]{3,24}$/.test(handle)) return NextResponse.json({ error: "Codeforces Handle 无效" }, { status: 400 });
    const count = Math.max(5, Math.min(13, Number(body.count) || 10));
    const targetRating = Math.max(800, Math.min(3000, Number(body.targetRating) || 1600));
    const durationMinutes = Math.max(60, Math.min(300, Number(body.durationMinutes) || 180));
    const seed = (body.seed ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`).slice(0, 64);
    const random = randomFromSeed(seed);

    const [problemset, submissions] = await Promise.all([getProblemset(), getUserSubmissions(handle, 1000)]);
    const solved = new Set(submissions.filter((item) => item.verdict === "OK" && item.problem.contestId).map((item) => `${item.problem.contestId}${item.problem.index}`));
    const pool = problemset.filter((problem) => problem.type === "PROGRAMMING" && problem.contestId && problem.rating && problem.rating >= Math.max(800, targetRating - 800) && problem.rating <= targetRating + 900 && !problem.tags.includes("interactive") && !solved.has(`${problem.contestId}${problem.index}`));

    let selected: CodeforcesProblem[] = [];
    let sourceContestId: number | null = null;
    if (body.mode === "原场镜像") {
      const mirror = pickMirror(pool, count, targetRating, random);
      if (!mirror) return NextResponse.json({ error: "没有找到符合条件的历史比赛，请调整目标 Rating" }, { status: 422 });
      selected = mirror.problems;
      sourceContestId = mirror.contestId;
    } else {
      selected = pickRandomSet(pool, count, targetRating, random);
    }
    if (selected.length < 5) return NextResponse.json({ error: "可用题目不足，请调整组卷条件" }, { status: 422 });

    return NextResponse.json({
      id: `vp-${hashSeed(`${seed}:${handle}`).toString(16)}`,
      handle,
      mode: body.mode === "原场镜像" ? "原场镜像" : "随机组卷",
      seed,
      durationMinutes,
      targetRating,
      sourceContestId,
      excludedSolved: solved.size,
      createdAt: new Date().toISOString(),
      problems: selected.map((problem, index) => ({ slot: String.fromCharCode(65 + index), ...publicProblem(problem) })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "VP 生成失败" }, { status: 502 });
  }
}
