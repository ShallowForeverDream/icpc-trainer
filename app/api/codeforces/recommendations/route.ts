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
    const requestedTags = [...new Set((request.nextUrl.searchParams.get("tags") ?? "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
    const [problemset, submissions] = await Promise.all([getProblemset(), getUserSubmissions(handle, 1000)]);
    const accepted = submissions.filter((item) => item.verdict === "OK" && item.problem.contestId);
    const solved = new Set(accepted.map((item) => `${item.problem.contestId}${item.problem.index}`));
    const ratings = accepted.slice(0, 180).map((item) => Number(item.problem.rating) || 0).filter(Boolean);
    const estimatedRating = median(ratings) || Math.round((min + max) / 200) * 100;
    const targetRating = Math.max(min, Math.min(max, Math.round((estimatedRating + 100) / 100) * 100));
    const tagCounts = new Map<string, number>();
    for (const item of accepted.slice(0, 180)) for (const tag of item.problem.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    const familiarTags = [...tagCounts].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tag]) => tag);
    const problems = problemset.filter((problem) => problem.type === "PROGRAMMING" && problem.contestId && problem.rating && problem.rating >= min && problem.rating <= max && !problem.tags.includes("interactive") && !solved.has(`${problem.contestId}${problem.index}`) && (!requestedTags.length || requestedTags.some((tag) => problem.tags.includes(tag))) && (!query || `${problem.contestId}${problem.index} ${problem.name} ${problem.tags.join(" ")}`.toLowerCase().includes(query))).map((problem) => {
      const requested = problem.tags.filter((tag) => requestedTags.includes(tag));
      const familiar = problem.tags.filter((tag) => familiarTags.includes(tag));
      const score = Math.abs((problem.rating ?? targetRating) - targetRating) * 5 - requested.length * 450 - familiar.length * 70 + stableScore(`${handle}:${problem.contestId}${problem.index}`) % 80;
      const reason = requested.length ? `匹配标签：${requested.slice(0, 2).join(" / ")}` : familiar.length ? `${familiar[0]} 延伸训练 · 接近目标 ${targetRating}` : `接近目标 Rating ${targetRating}`;
      return { problem, score, reason };
    }).sort((a, b) => a.score - b.score || (b.problem.contestId ?? 0) - (a.problem.contestId ?? 0)).slice(0, limit).map(({ problem, reason }) => ({ ...publicProblem(problem), reason }));
    return NextResponse.json({ source: "codeforces", handle, profile: { solvedCount: solved.size, estimatedRating, targetRating, familiarTags }, total: problems.length, problems });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "推荐生成失败" }, { status: 502 });
  }
}
