import { archiveContestIntegrated, findArchiveContest } from "../data/archive-contests";
import { savePersistentJson } from "./persistent-state";
import { readStoredJson, writeStoredJson } from "./storage";

export type ArchiveAttempt = { wrong: number; solvedAt?: number };
export type ArchiveSubmission = { id: string; slot: string; verdict: "WA" | "AC"; atSeconds: number };
export type ArchiveVpSession = {
  contestId: string;
  startedAt?: number;
  reveal: boolean;
  group: string;
  myTeam: string;
  attempts: Record<string, ArchiveAttempt>;
  submissions?: ArchiveSubmission[];
};

export const ARCHIVE_SESSION_KEY = "icpc-trainer-archive-vp";
export const ARCHIVE_SESSION_EVENT = "icpc-trainer-archive-session-changed";

export function isArchiveVpSession(value: unknown): value is ArchiveVpSession {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ArchiveVpSession>;
  const contest = typeof item.contestId === "string" ? findArchiveContest(item.contestId) : undefined;
  return Boolean(contest && archiveContestIntegrated(contest))
    && typeof item.reveal === "boolean" && typeof item.group === "string" && typeof item.myTeam === "string"
    && Boolean(item.attempts) && typeof item.attempts === "object";
}

export async function applyArchiveJudgeVerdict(input: { contestId: string; slot: string; verdict: "WA" | "AC"; requestId: string }) {
  const session = readStoredJson<ArchiveVpSession | null>(ARCHIVE_SESSION_KEY, null, (value): value is ArchiveVpSession | null => value === null || isArchiveVpSession(value));
  if (!session?.startedAt || session.contestId !== input.contestId || !/^[A-Z][0-9]?$/.test(input.slot)) return null;
  if (session.submissions?.some((submission) => submission.id === input.requestId)) return session;

  const current = session.attempts[input.slot] || { wrong: 0 };
  if (current.solvedAt !== undefined) return session;
  const atSeconds = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
  const attempts = { ...session.attempts };
  attempts[input.slot] = input.verdict === "AC" ? { ...current, solvedAt: atSeconds } : { ...current, wrong: current.wrong + 1 };
  const submissions = [...(session.submissions ?? []), { id: input.requestId, slot: input.slot, verdict: input.verdict, atSeconds }].slice(-500);
  const next = { ...session, attempts, submissions };
  writeStoredJson(ARCHIVE_SESSION_KEY, next);
  await savePersistentJson("archive-vp", ARCHIVE_SESSION_KEY, next);
  window.dispatchEvent(new CustomEvent(ARCHIVE_SESSION_EVENT, { detail: next }));
  return next;
}
