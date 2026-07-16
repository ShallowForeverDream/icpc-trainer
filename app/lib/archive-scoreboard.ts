import type { ArchiveContest } from "../data/archive-contests";

export async function archiveScoreboard(contest: ArchiveContest, elapsedSeconds: number, reveal: boolean, group = "all") {
  const backend = process.env.ICPC_API_BASE_URL?.replace(/\/$/, "");
  if (!backend) throw new Error("国内 API 尚未配置");
  const params = new URLSearchParams({
    id: contest.id,
    name: contest.name,
    elapsed: String(elapsedSeconds),
    reveal: reveal ? "1" : "0",
    group,
  });
  if (contest.boardSource === "codeforces") {
    params.set("source", "codeforces");
    if (contest.codeforcesContestId) params.set("contestId", String(contest.codeforcesContestId));
    else if (contest.gymId) params.set("gymId", String(contest.gymId));
  } else if (contest.boardPath) {
    params.set("boardPath", contest.boardPath);
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${backend}/archive/scoreboards?${params}`, {
      cache: "no-store",
      headers: { Accept: "application/json", "User-Agent": "icpc-trainer-sites/0.5" },
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => ({})) as { error?: string };
    if (!response.ok) throw new Error(payload.error || `真实榜单服务 HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}
