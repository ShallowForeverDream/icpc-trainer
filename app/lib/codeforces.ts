export type CodeforcesProblem = {
  contestId?: number;
  problemsetName?: string;
  index: string;
  name: string;
  type: "PROGRAMMING" | "QUESTION";
  rating?: number;
  tags: string[];
};

export type CodeforcesSubmission = {
  id: number;
  creationTimeSeconds: number;
  problem: { contestId?: number; index: string; name: string };
  programmingLanguage: string;
  verdict?: string;
  timeConsumedMillis: number;
  memoryConsumedBytes: number;
};

type ApiPayload<T> = { status: "OK" | "FAILED"; comment?: string; result?: T };

const globalCache = globalThis as typeof globalThis & {
  __icpcProblems?: { expiresAt: number; value: CodeforcesProblem[] };
  __icpcSubmissions?: Map<string, { expiresAt: number; value: CodeforcesSubmission[] }>;
  __icpcQueue?: Promise<unknown>;
  __icpcLastCall?: number;
};

function backendBase() {
  return process.env.ICPC_API_BASE_URL?.replace(/\/$/, "") ?? "";
}

async function throttledFetch<T>(method: string, params: URLSearchParams) {
  const previous = globalCache.__icpcQueue ?? Promise.resolve();
  let resolveQueue!: () => void;
  globalCache.__icpcQueue = new Promise<void>((resolve) => { resolveQueue = resolve; });
  await previous.catch(() => undefined);
  try {
    const wait = Math.max(0, 2100 - (Date.now() - (globalCache.__icpcLastCall ?? 0)));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    const response = await fetch(`https://codeforces.com/api/${method}?${params}`, { headers: { "User-Agent": "icpc-trainer/0.3" } });
    const payload = await response.json() as ApiPayload<T>;
    globalCache.__icpcLastCall = Date.now();
    if (!response.ok || payload.status !== "OK" || payload.result === undefined) throw new Error(payload.comment ?? `Codeforces HTTP ${response.status}`);
    return payload.result;
  } finally {
    resolveQueue();
  }
}

export async function getProblemset() {
  const cached = globalCache.__icpcProblems;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const base = backendBase();
  const value = base
    ? ((await (await fetch(`${base}/problemset`, { headers: { "User-Agent": "icpc-trainer-sites/0.1" } })).json()) as { problems: CodeforcesProblem[] }).problems
    : (await throttledFetch<{ problems: CodeforcesProblem[] }>("problemset.problems", new URLSearchParams({ lang: "en" }))).problems;
  if (!Array.isArray(value)) throw new Error("国内 API 返回了无效题库数据");
  globalCache.__icpcProblems = { expiresAt: Date.now() + 30 * 60 * 1000, value };
  return value;
}

export async function getUserSubmissions(handle: string, count = 1000) {
  const cache = globalCache.__icpcSubmissions ??= new Map();
  const key = `${handle.toLowerCase()}:${count}`;
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const base = backendBase();
  const value = base
    ? ((await (await fetch(`${base}/submissions/raw?handle=${encodeURIComponent(handle)}&count=${count}`, { headers: { "User-Agent": "icpc-trainer-sites/0.1" } })).json()) as { submissions: CodeforcesSubmission[] }).submissions
    : await throttledFetch<CodeforcesSubmission[]>("user.status", new URLSearchParams({ handle, from: "1", count: String(count) }));
  if (!Array.isArray(value)) throw new Error("国内 API 返回了无效提交数据");
  cache.set(key, { expiresAt: Date.now() + 60 * 1000, value });
  return value;
}

export function publicProblem(problem: CodeforcesProblem) {
  return {
    code: problem.contestId ? `CF ${problem.contestId}${problem.index}` : `${problem.problemsetName ?? "CF"} ${problem.index}`,
    contestId: problem.contestId,
    index: problem.index,
    title: problem.name,
    rating: problem.rating ?? 0,
    tags: problem.tags,
    status: "未尝试",
  };
}
