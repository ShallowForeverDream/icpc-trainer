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
  problem: { contestId?: number; index: string; name: string; rating?: number; tags?: string[] };
  programmingLanguage: string;
  verdict?: string;
  timeConsumedMillis: number;
  memoryConsumedBytes: number;
};

export type CodeforcesParty = {
  participantType?: string;
  teamId?: number;
  teamName?: string;
  members?: Array<{ handle: string }>;
};

export type CodeforcesProblemResult = {
  points?: number;
  rejectedAttemptCount?: number;
  bestSubmissionTimeSeconds?: number;
};

export type CodeforcesContestStandings = {
  contest: { id: number; name: string; durationSeconds: number };
  problems: CodeforcesProblem[];
  rows: Array<{ party: CodeforcesParty; problemResults: CodeforcesProblemResult[] }>;
};

type ApiPayload<T> = { status: "OK" | "FAILED"; comment?: string; result?: T };

const globalCache = globalThis as typeof globalThis & {
  __icpcProblems?: { expiresAt: number; staleUntil: number; value: CodeforcesProblem[] };
  __icpcSubmissions?: Map<string, { expiresAt: number; staleUntil: number; fetchedAt: number; count: number; value: CodeforcesSubmission[] }>;
  __icpcContestStandings?: Map<number, { expiresAt: number; staleUntil: number; value: CodeforcesContestStandings }>;
  __icpcQueue?: Promise<unknown>;
  __icpcLastCall?: number;
  __icpcQueueDepth?: number;
};

function backendBase() {
  return process.env.ICPC_API_BASE_URL?.replace(/\/$/, "") ?? "";
}

async function throttledFetch<T>(method: string, params: URLSearchParams) {
  if ((globalCache.__icpcQueueDepth ?? 0) >= 40) throw new Error("Codeforces 同步队列繁忙");
  globalCache.__icpcQueueDepth = (globalCache.__icpcQueueDepth ?? 0) + 1;
  const previous = globalCache.__icpcQueue ?? Promise.resolve();
  let resolveQueue!: () => void;
  globalCache.__icpcQueue = new Promise<void>((resolve) => { resolveQueue = resolve; });
  await previous.catch(() => undefined);
  try {
    const wait = Math.max(0, 2100 - (Date.now() - (globalCache.__icpcLastCall ?? 0)));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    globalCache.__icpcLastCall = Date.now();
    const response = await fetch(`https://codeforces.com/api/${method}?${params}`, { headers: { "User-Agent": "icpc-trainer/0.4", Accept: "application/json" }, signal: controller.signal }).finally(() => clearTimeout(timeout));
    const payload = await response.json().catch(() => null) as ApiPayload<T> | null;
    if (!response.ok || payload?.status !== "OK" || payload.result === undefined) throw new Error(payload?.comment ?? `Codeforces HTTP ${response.status}`);
    return payload.result;
  } finally {
    globalCache.__icpcQueueDepth = Math.max(0, (globalCache.__icpcQueueDepth ?? 1) - 1);
    resolveQueue();
  }
}

export async function getProblemset(preferDirect = false): Promise<CodeforcesProblem[]> {
  const cached = globalCache.__icpcProblems;
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const base = preferDirect ? "" : backendBase();
    let value: CodeforcesProblem[];
    if (base) {
      const response = await fetch(`${base}/problemset`, { headers: { "User-Agent": "icpc-trainer-sites/0.4", Accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as { problems?: CodeforcesProblem[]; error?: string };
      if (!response.ok) throw new Error(payload.error || `国内 API HTTP ${response.status}`);
      value = payload.problems ?? [];
    } else value = (await throttledFetch<{ problems: CodeforcesProblem[] }>("problemset.problems", new URLSearchParams({ lang: "en" }))).problems;
    if (!Array.isArray(value)) throw new Error("题库数据格式无效");
    globalCache.__icpcProblems = { expiresAt: Date.now() + 30 * 60 * 1000, staleUntil: Date.now() + 24 * 60 * 60 * 1000, value };
    return value;
  } catch (error) {
    if (cached && cached.staleUntil > Date.now()) return cached.value;
    throw error;
  }
}

export async function getUserSubmissions(handle: string, count = 1000, maxAgeMs = 60_000, preferDirect = false): Promise<CodeforcesSubmission[]> {
  const cache = globalCache.__icpcSubmissions ??= new Map();
  const key = handle.toLowerCase();
  const requestedCount = Math.max(1, Math.min(1000, Math.round(count) || 100));
  const cached = cache.get(key);
  const requestedMaxAge = Math.max(5_000, Math.min(60_000, Math.round(maxAgeMs) || 60_000));
  if (cached && Date.now() - cached.fetchedAt <= requestedMaxAge && cached.count >= requestedCount) return cached.value.slice(0, requestedCount);
  const fetchedCount = Math.max(requestedCount, cached?.count ?? 0);
  try {
    const base = preferDirect ? "" : backendBase();
    let value: CodeforcesSubmission[];
    if (base) {
      const response = await fetch(`${base}/submissions/raw?handle=${encodeURIComponent(handle)}&count=${fetchedCount}`, { headers: { "User-Agent": "icpc-trainer-sites/0.4", Accept: "application/json" } });
      const payload = await response.json().catch(() => ({})) as { submissions?: CodeforcesSubmission[]; error?: string };
      if (!response.ok) throw new Error(payload.error || `国内 API HTTP ${response.status}`);
      value = payload.submissions ?? [];
    } else value = await throttledFetch<CodeforcesSubmission[]>("user.status", new URLSearchParams({ handle, from: "1", count: String(fetchedCount) }));
    if (!Array.isArray(value)) throw new Error("提交数据格式无效");
    const fetchedAt = Date.now();
    cache.set(key, { expiresAt: fetchedAt + 60 * 1000, staleUntil: fetchedAt + 10 * 60 * 1000, fetchedAt, count: fetchedCount, value });
    while (cache.size > 128) cache.delete(cache.keys().next().value!);
    return value.slice(0, requestedCount);
  } catch (error) {
    if (cached && cached.staleUntil > Date.now() && cached.count >= requestedCount) return cached.value.slice(0, requestedCount);
    throw error;
  }
}

export async function getContestStandings(contestId: number): Promise<CodeforcesContestStandings> {
  const normalizedId = Math.max(1, Math.floor(contestId));
  const cache = globalCache.__icpcContestStandings ??= new Map();
  const cached = cache.get(normalizedId);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const value = await throttledFetch<CodeforcesContestStandings>("contest.standings", new URLSearchParams({ contestId: String(normalizedId) }));
    if (!value?.contest || !Array.isArray(value.problems) || !Array.isArray(value.rows)) throw new Error("原比赛榜单数据格式无效");
    value.rows = value.rows.slice(0, 500);
    const now = Date.now();
    cache.set(normalizedId, { expiresAt: now + 6 * 60 * 60 * 1000, staleUntil: now + 7 * 24 * 60 * 60 * 1000, value });
    while (cache.size > 64) cache.delete(cache.keys().next().value!);
    return value;
  } catch (error) {
    if (cached && cached.staleUntil > Date.now()) return cached.value;
    throw error;
  }
}

export function publicProblem(problem: CodeforcesProblem): { code: string; contestId?: number; index: string; title: string; rating: number; tags: string[]; status: string } {
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
