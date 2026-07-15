import { authFetch } from "./auth-client";
import { getDeviceId } from "./device-id";
import { readStoredJson, writeStoredJson } from "./storage";

export type PlatformJudge = "codeforces" | "ucup" | "luogu";
export type PlatformSubmissionStatus = "queued" | "submitted" | "accepted" | "rejected" | "failed" | "needs_login";
export type PlatformVerdict = "AC" | "WA";

export type PlatformSubmission = {
  requestId: string;
  judge: PlatformJudge;
  problemCode: string;
  problemTitle: string;
  problemHref: string;
  contestId: number;
  problemIndex: string;
  language: string;
  status: PlatformSubmissionStatus;
  verdict?: PlatformVerdict | null;
  message: string;
  judgeSubmissionId?: number | null;
  archiveContestId?: string | null;
  slot?: string | null;
  sourceBytes?: number;
  createdAt: string;
  updatedAt: string;
};

export type PlatformSubmissionDetail = PlatformSubmission & { sourceCode: string };
export type PlatformSubmissionCreate = Omit<PlatformSubmission, "createdAt" | "updatedAt" | "verdict" | "judgeSubmissionId" | "sourceBytes"> & { sourceCode: string };

const LOCAL_KEY = "icpc-trainer-platform-submissions";
const CHANGE_EVENT = "icpc-trainer-platform-submissions-changed";
const STATUSES: PlatformSubmissionStatus[] = ["queued", "submitted", "accepted", "rejected", "failed", "needs_login"];
const TERMINAL = new Set<PlatformSubmissionStatus>(["accepted", "rejected", "failed", "needs_login"]);
const remoteMutationQueues = new Map<string, Promise<unknown>>();

function isSubmission(value: unknown): value is PlatformSubmission {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PlatformSubmission>;
  return typeof item.requestId === "string"
    && ["codeforces", "ucup", "luogu"].includes(item.judge || "")
    && typeof item.problemCode === "string"
    && typeof item.problemTitle === "string"
    && typeof item.problemHref === "string"
    && Number.isInteger(item.contestId)
    && typeof item.problemIndex === "string"
    && typeof item.language === "string"
    && STATUSES.includes(item.status as PlatformSubmissionStatus)
    && (item.verdict === undefined || item.verdict === null || ["AC", "WA"].includes(item.verdict))
    && typeof item.message === "string"
    && (item.judgeSubmissionId === undefined || item.judgeSubmissionId === null || Number.isInteger(item.judgeSubmissionId))
    && (item.archiveContestId === undefined || item.archiveContestId === null || typeof item.archiveContestId === "string")
    && (item.slot === undefined || item.slot === null || typeof item.slot === "string")
    && (item.sourceBytes === undefined || Number.isInteger(item.sourceBytes))
    && typeof item.createdAt === "string"
    && typeof item.updatedAt === "string";
}

function isSubmissionList(value: unknown): value is PlatformSubmission[] {
  return Array.isArray(value) && value.length <= 300 && value.every(isSubmission);
}

function isSubmissionDetail(value: unknown): value is PlatformSubmissionDetail {
  return isSubmission(value) && typeof (value as PlatformSubmissionDetail).sourceCode === "string";
}

function localRows() {
  return readStoredJson<PlatformSubmission[]>(LOCAL_KEY, [], isSubmissionList);
}

function publish(rows: PlatformSubmission[]) {
  writeStoredJson(LOCAL_KEY, rows);
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: rows }));
}

function mergedRows(...groups: PlatformSubmission[][]) {
  const rows = new Map<string, PlatformSubmission>();
  for (const group of groups) for (const row of group) {
    const current = rows.get(row.requestId);
    if (!current || Date.parse(row.updatedAt) >= Date.parse(current.updatedAt)) rows.set(row.requestId, row);
  }
  return [...rows.values()].sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt)).slice(0, 250);
}

function upsertLocal(row: PlatformSubmission) {
  const next = mergedRows([row], localRows());
  publish(next);
  return row;
}

function queueRemote<T>(requestId: string, task: () => Promise<T>) {
  const previous = remoteMutationQueues.get(requestId) || Promise.resolve();
  const next = previous.then(task, task);
  const settled = next.catch(() => undefined);
  remoteMutationQueues.set(requestId, settled);
  void settled.finally(() => { if (remoteMutationQueues.get(requestId) === settled) remoteMutationQueues.delete(requestId); });
  return next;
}

async function responseSubmission(response: Response, includeSource: true): Promise<PlatformSubmissionDetail>;
async function responseSubmission(response: Response, includeSource?: false): Promise<PlatformSubmission>;
async function responseSubmission(response: Response, includeSource = false): Promise<PlatformSubmission | PlatformSubmissionDetail> {
  const payload = await response.json().catch(() => ({})) as { submission?: unknown; error?: string };
  if (!response.ok) throw new Error(payload.error || `提交记录服务暂时不可用（${response.status}）`);
  if (includeSource) {
    if (!isSubmissionDetail(payload.submission)) throw new Error("提交记录格式错误");
    return payload.submission;
  }
  if (!isSubmission(payload.submission)) throw new Error("提交记录格式错误");
  return payload.submission;
}

export function createSubmissionRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `submit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadPlatformSubmissions(problemCode = "") {
  const local = localRows();
  try {
    const query = new URLSearchParams({ clientId: getDeviceId(), limit: "250" });
    if (problemCode) query.set("problem", problemCode);
    const response = await authFetch(`/platform-submissions?${query}`, { cache: "no-store" });
    const payload = await response.json() as { submissions?: unknown; error?: string };
    if (!response.ok || !isSubmissionList(payload.submissions)) throw new Error(payload.error || "提交记录读取失败");
    const rows = problemCode ? mergedRows(payload.submissions, local.filter((row) => row.problemCode === problemCode)) : mergedRows(payload.submissions, local);
    if (!problemCode) publish(rows);
    return rows;
  } catch {
    return problemCode ? local.filter((row) => row.problemCode === problemCode) : local;
  }
}

export async function loadPlatformSubmissionDetail(requestId: string) {
  try {
    const query = new URLSearchParams({ clientId: getDeviceId() });
    const response = await authFetch(`/platform-submissions/${encodeURIComponent(requestId)}?${query}`, { cache: "no-store" });
    return await responseSubmission(response, true);
  } catch {
    const local = localRows().find((row) => row.requestId === requestId);
    return local ? { ...local, sourceCode: "" } : null;
  }
}

export async function recordPlatformSubmission(input: PlatformSubmissionCreate) {
  const timestamp = new Date().toISOString();
  const { sourceCode, ...metadata } = input;
  const local = upsertLocal({ ...metadata, sourceBytes: new Blob([sourceCode]).size, createdAt: timestamp, updatedAt: timestamp });
  try {
    const remote = await queueRemote(input.requestId, async () => responseSubmission(await authFetch("/platform-submissions", {
      method: "POST",
      body: JSON.stringify({ ...input, clientId: getDeviceId() }),
    }, 8_000), true));
    upsertLocal(remote);
    return remote;
  } catch {
    return local;
  }
}

export async function updatePlatformSubmission(requestId: string, status: PlatformSubmissionStatus, message: string, details: { verdict?: PlatformVerdict; judgeSubmissionId?: number } = {}) {
  const current = localRows();
  const timestamp = new Date().toISOString();
  const next = current.map((item) => {
    if (item.requestId !== requestId) return item;
    if ((TERMINAL.has(item.status) && !TERMINAL.has(status)) || (item.status === "submitted" && status === "queued")) return item;
    return { ...item, status, message: message.slice(0, 240), ...details, updatedAt: timestamp };
  });
  if (next.some((item, index) => item !== current[index])) publish(next);
  try {
    const remote = await queueRemote(requestId, async () => responseSubmission(await authFetch("/platform-submissions/status", {
      method: "POST",
      body: JSON.stringify({ clientId: getDeviceId(), requestId, status, message, ...details }),
    })));
    upsertLocal(remote);
    return remote;
  } catch {
    return next.find((item) => item.requestId === requestId) || null;
  }
}

export function subscribePlatformSubmissions(listener: (rows: PlatformSubmission[]) => void) {
  if (typeof window === "undefined") return () => undefined;
  const receive = (event: Event) => {
    const rows = (event as CustomEvent<PlatformSubmission[]>).detail;
    if (isSubmissionList(rows)) listener(rows);
  };
  window.addEventListener(CHANGE_EVENT, receive);
  return () => window.removeEventListener(CHANGE_EVENT, receive);
}
