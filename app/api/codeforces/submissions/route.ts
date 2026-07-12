import { NextRequest, NextResponse } from "next/server";

type Member = { handle: string };
type Submission = {
  id: number;
  creationTimeSeconds: number;
  relativeTimeSeconds: number;
  problem: { contestId?: number; index: string; name: string };
  author: { members: Member[] };
  programmingLanguage: string;
  verdict?: string;
  timeConsumedMillis: number;
  memoryConsumedBytes: number;
};

export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get("handle")?.trim() ?? "";
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(handle)) return NextResponse.json({ error: "请输入有效的 Codeforces Handle" }, { status: 400 });
  try {
    const response = await fetch(`https://codeforces.com/api/user.status?handle=${encodeURIComponent(handle)}&from=1&count=50`, { headers: { "User-Agent": "icpc-trainer/0.2" } });
    const payload = await response.json() as { status: string; comment?: string; result?: Submission[] };
    if (!response.ok || payload.status !== "OK" || !payload.result) throw new Error(payload.comment ?? `Codeforces HTTP ${response.status}`);
    const submissions = payload.result.map((item) => ({
      id: item.id,
      createdAt: new Date(item.creationTimeSeconds * 1000).toISOString(),
      code: item.problem.contestId ? `CF ${item.problem.contestId}${item.problem.index}` : item.problem.index,
      contestId: item.problem.contestId,
      index: item.problem.index,
      title: item.problem.name,
      language: item.programmingLanguage,
      verdict: item.verdict ?? "TESTING",
      timeMs: item.timeConsumedMillis,
      memoryBytes: item.memoryConsumedBytes,
    }));
    return NextResponse.json({ source: "codeforces", handle, syncedAt: new Date().toISOString(), submissions }, { headers: { "Cache-Control": "private, max-age=0" } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Codeforces 同步失败" }, { status: 502 });
  }
}
