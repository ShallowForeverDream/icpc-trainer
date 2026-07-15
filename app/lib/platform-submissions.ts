import { loadPersistentJson, savePersistentJson } from "./persistent-state";

export type PlatformJudge = "codeforces" | "ucup";
export type PlatformSubmissionStatus = "queued" | "submitted" | "accepted" | "rejected" | "failed" | "needs_login";

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
  message: string;
  createdAt: string;
  updatedAt: string;
};

const STATE_KEY = "platform-submissions";
const LOCAL_KEY = "icpc-trainer-platform-submissions";
const CHANGE_EVENT = "icpc-trainer-platform-submissions-changed";

function isSubmission(value: unknown): value is PlatformSubmission {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PlatformSubmission>;
  return typeof item.requestId === "string"
    && ["codeforces", "ucup"].includes(item.judge || "")
    && typeof item.problemCode === "string"
    && typeof item.problemTitle === "string"
    && typeof item.problemHref === "string"
    && Number.isInteger(item.contestId)
    && typeof item.problemIndex === "string"
    && typeof item.language === "string"
    && ["queued", "submitted", "accepted", "rejected", "failed", "needs_login"].includes(item.status || "")
    && typeof item.message === "string"
    && typeof item.createdAt === "string"
    && typeof item.updatedAt === "string";
}

function isSubmissionList(value: unknown): value is PlatformSubmission[] {
  return Array.isArray(value) && value.length <= 300 && value.every(isSubmission);
}

function publish(rows: PlatformSubmission[]) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(CHANGE_EVENT, { detail: rows }));
}

export function createSubmissionRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `submit-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function loadPlatformSubmissions() {
  return loadPersistentJson<PlatformSubmission[]>(STATE_KEY, LOCAL_KEY, [], isSubmissionList);
}

export async function recordPlatformSubmission(input: Omit<PlatformSubmission, "createdAt" | "updatedAt">) {
  const current = await loadPlatformSubmissions();
  const now = new Date().toISOString();
  const next = [{ ...input, createdAt: now, updatedAt: now }, ...current.filter((item) => item.requestId !== input.requestId)].slice(0, 250);
  await savePersistentJson(STATE_KEY, LOCAL_KEY, next);
  publish(next);
  return next[0];
}

export async function updatePlatformSubmission(requestId: string, status: PlatformSubmissionStatus, message: string) {
  const current = await loadPlatformSubmissions();
  const now = new Date().toISOString();
  const next = current.map((item) => item.requestId === requestId ? { ...item, status, message: message.slice(0, 240), updatedAt: now } : item);
  if (next.some((item, index) => item !== current[index])) {
    await savePersistentJson(STATE_KEY, LOCAL_KEY, next);
    publish(next);
  }
  return next;
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
