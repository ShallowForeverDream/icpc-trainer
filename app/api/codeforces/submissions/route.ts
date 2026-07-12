import { NextRequest, NextResponse } from "next/server";
import { getUserSubmissions } from "../../../lib/codeforces";

export async function GET(request: NextRequest) {
  const handle = request.nextUrl.searchParams.get("handle")?.trim() ?? "";
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(handle)) return NextResponse.json({ error: "请输入有效的 Codeforces Handle" }, { status: 400 });
  try {
    const result = await getUserSubmissions(handle, 100);
    const submissions = result.map((item) => ({
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
