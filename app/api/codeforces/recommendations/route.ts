import { NextRequest, NextResponse } from "next/server";
import { getProblemset, getUserSubmissions, publicProblem } from "../../../lib/codeforces";

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function stableScore(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

export async function GET(request: NextRequest) {
  try {
    const backend = process.env.ICPC_API_BASE_URL?.replace(/\/$/, "");
    if (backend) {
      const upstream = await fetch(`${backend}/codeforces/recommendations?${request.nextUrl.searchParams}`, { headers: { "User-Agent": "icpc-trainer-sites/0.2" }, cache: "no-store" });
      return NextResponse.json(await upstream.json(), { status: upstream.status });
    }

    const handle = (request.nextUrl.searchParams.get("handle") ?? "ShallowDream2").trim();
    if (!/^[A-Za-z0-9_.-]{3,24}$/.test(handle)) return NextResponse.json({ error: "Codeforces Handle 无效" }, { status: 400 });
    const min = Math.max(800, Number(request.nextUrl.searchParams.get("min")) || 1200);
    const max = Math.min(3500, Math.max(min, Number(request.nextUrl.searchParams.get("max")) || 1800));
    const limit = Math.min(40, Math.max(6, Number(request.nextUrl.searchParams.get("limit")) || 20));
    const query = (request.nextUrl.searchParams.get("q") ?? "").trim().toLowerCase();
    const mode = request.nextUrl.searchParams.get("mode") ?? "balanced";
    const requestedTags = [...new Set((request.nextUrl.searchParams.get("tags") ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
    const [problemset, submissions] = await Promise.all([getProblemset(), getUserSubmissions(handle, 1000)]);
    const accepted = submissions.filter((item) => item.verdict === "OK" && item.problem.contestId);
    const solved = new Set(accepted.map((item) => `${item.problem.contestId}${item.problem.index}`));
    const attempted = new Map<string, { solved: boolean; wrong: number; tags: string[] }>();
    for (const item of submissions) {
      if (!item.problem.contestId) continue;
      const code = `${item.problem.contestId}${item.problem.index}`;
      const state = attempted.get(code) ?? { solved: false, wrong: 0, tags: item.problem.tags ?? [] };
      if (item.verdict === "OK") state.solved = true;
      else if (!["COMPILATION_ERROR", "SKIPPED", "TESTING"].includes(item.verdict ?? "")) state.wrong += 1;
      attempted.set(code, state);
    }
    const ratings = accepted.slice(0, 180).map((item) => Number(item.problem.rating) || 0).filter(Boolean);
    const estimatedRating = median(ratings) || Math.round((min + max) / 200) * 100;
    const offset = mode === "speed" ? -100 : mode === "boss" ? 400 : mode === "upsolve" ? 0 : 100;
    const targetRating = Math.max(min, Math.min(max, Math.round((estimatedRating + offset) / 100) * 100));
    const tagCounts = new Map<string, number>();
    for (const item of accepted.slice(0, 180)) for (const tag of item.problem.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    const familiarTags = [...tagCounts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tag]) => tag);
    const weakness = new Map<string, number>();
    for (const state of attempted.values()) for (const tag of state.tags) weakness.set(tag, (weakness.get(tag) ?? 0) + state.wrong + (state.solved ? 0 : 2));
    const weakTags = [...weakness].filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([tag]) => tag);
    const upsolveCodes = new Set([...attempted].filter(([, state]) => !state.solved).map(([code]) => code));
    const problems = problemset.filter((problem) => problem.type === "PROGRAMMING" && problem.contestId && problem.rating && problem.rating >= min && problem.rating <= max && !problem.tags.includes("interactive") && !solved.has(`${problem.contestId}${problem.index}`) && (mode !== "upsolve" || upsolveCodes.has(`${problem.contestId}${problem.index}`)) && (!requestedTags.length || requestedTags.some((tag) => problem.tags.includes(tag))) && (!query || `${problem.contestId}${problem.index} ${problem.name} ${problem.tags.join(" ")}`.toLowerCase().includes(query))).map((problem) => {
      const requested = problem.tags.filter((tag) => requestedTags.includes(tag));
      const weak = problem.tags.filter((tag) => weakTags.includes(tag));
      const score = Math.abs((problem.rating ?? targetRating) - targetRating) * 5 - requested.length * 450 - (mode === "weakness" ? weak.length * 650 : weak.length * 180) + stableScore(`${handle}:${problem.contestId}${problem.index}`) % 80;
      const reason = mode === "upsolve" ? "补回做错或未完成的题" : mode === "boss" ? `挑战题 · 高于近期舒适区约 ${Math.max(0, (problem.rating ?? 0) - estimatedRating)} Rating` : mode === "speed" ? "限时巩固 · 目标在 25 分钟内独立完成" : requested.length ? `匹配标签：${requested.slice(0, 2).join(" / ")}` : weak.length ? `${weak[0]} 弱项训练 · 接近挑战位 ${targetRating}` : `接近建议挑战位 ${targetRating}`;
      return { problem, score, reason };
    }).sort((a, b) => a.score - b.score || (b.problem.contestId ?? 0) - (a.problem.contestId ?? 0)).slice(0, limit).map(({ problem, reason }) => ({ ...publicProblem(problem), reason }));
    return NextResponse.json({ source: "codeforces", handle, profile: { solvedCount: solved.size, attemptedCount: attempted.size, estimatedRating, targetRating, familiarTags, weakTags, upsolveCount: upsolveCodes.size, dueReviewCount: 0, mode, methodology: "优先补题与弱项；普通训练选择近期舒适区上方约 100 Rating，Boss 题上移约 400。" }, total: problems.length, problems });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "推荐生成失败" }, { status: 502 });
  }
}
