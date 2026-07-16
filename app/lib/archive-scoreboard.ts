import type { ArchiveContest } from "../data/archive-contests";

export function archiveScoreboardUrl(contest: ArchiveContest, elapsedSeconds: number, reveal: boolean, group = "all") {
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
  return `${backend}/archive/scoreboards?${params}`;
}
