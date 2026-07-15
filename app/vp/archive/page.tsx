"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { archiveContestIntegrated, archiveContests, archivePracticeProblem, archiveProblemHref, findArchiveContest } from "../../data/archive-contests";
import { type ArchivePrewarmProgress, loadArchivePrewarm, startArchivePrewarm } from "../../lib/archive-statement-client";
import { ARCHIVE_SESSION_EVENT } from "../../lib/archive-vp-session";
import { clearPersistentJson, loadPersistentJson, savePersistentJson } from "../../lib/persistent-state";
import { loadPlatformSubmissions, subscribePlatformSubmissions, type PlatformSubmission } from "../../lib/platform-submissions";
import { readTrainerPreferences } from "../../lib/preferences";
import { readStoredJson } from "../../lib/storage";

type ProblemState = { solved: boolean; wrongAttempts: number; pendingAttempts: number; solvedMinutes: number | null };
type StandingRow = { rank: number; teamId: string; name: string; organization: string; groups: string[]; solved: number; penalty: number; lastSolvedMinutes: number | null; problems: Record<string, ProblemState>; mine?: boolean };
type ScoreboardPayload = {
  contest: { id: string; officialName: string; name: string; startTime: string; endTime: string; boardUrl: string; groups: Record<string, string>; teamCount: number; runCount: number };
  rows: StandingRow[];
  slots: string[];
  elapsedSeconds: number;
  durationSeconds: number;
  freezeAtSeconds: number;
  frozen: boolean;
  generatedAt: string;
  error?: string;
};
type MyAttempt = { wrong: number; solvedAt?: number };
type ArchiveSubmission = { id: string; slot: string; verdict: "WA" | "AC"; atSeconds: number };
type ArchiveRoomTab = "problems" | "standings" | "submissions";
type VpMedal = "gold" | "silver" | "bronze" | null;
type ArchiveFinalResult = { rank: number; teamCount: number; solved: number; penalty: number; lastSolvedMinutes: number | null; medal: VpMedal };
type Session = { id?: string; contestId: string; startedAt?: number; finishedAt?: number; reveal: boolean; group: string; myTeam: string; attempts: Record<string, MyAttempt>; submissions?: ArchiveSubmission[]; finalResult?: ArchiveFinalResult };
type ArchiveHistoryEntry = Session & { id: string; updatedAt: number };
type ArchiveHistory = { sessions: ArchiveHistoryEntry[] };

const STORAGE_KEY = "icpc-trainer-archive-vp";
const HISTORY_KEY = "icpc-trainer-archive-vp-history";

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Session>;
  const contest = typeof item.contestId === "string" ? findArchiveContest(item.contestId) : undefined;
  if (!contest || !archiveContestIntegrated(contest) || typeof item.reveal !== "boolean" || typeof item.group !== "string" || item.group.length > 100 || typeof item.myTeam !== "string" || item.myTeam.length > 80 || !item.attempts || typeof item.attempts !== "object") return false;
  if (item.id !== undefined && !/^[A-Za-z0-9-]{8,100}$/.test(item.id)) return false;
  if (item.startedAt !== undefined && (!Number.isFinite(item.startedAt) || Number(item.startedAt) <= 0)) return false;
  if (item.finishedAt !== undefined && (!Number.isFinite(item.finishedAt) || Number(item.finishedAt) <= 0)) return false;
  if (item.finalResult !== undefined) {
    const result = item.finalResult;
    if (!Number.isInteger(result?.rank) || result.rank <= 0 || !Number.isInteger(result.teamCount) || result.teamCount <= 0 || !Number.isInteger(result.solved) || result.solved < 0 || !Number.isInteger(result.penalty) || result.penalty < 0 || (result.lastSolvedMinutes !== null && (!Number.isInteger(result.lastSolvedMinutes) || result.lastSolvedMinutes < 0)) || ![null, "gold", "silver", "bronze"].includes(result.medal)) return false;
  }
  if (item.submissions !== undefined && (!Array.isArray(item.submissions) || item.submissions.length > 500 || !item.submissions.every((submission) => typeof submission?.id === "string" && /^[A-Z]$/.test(submission.slot) && ["WA", "AC"].includes(submission.verdict) && Number.isFinite(submission.atSeconds) && submission.atSeconds >= 0))) return false;
  return Object.entries(item.attempts).length <= 26 && Object.entries(item.attempts).every(([slot, attempt]) => /^[A-Z]$/.test(slot) && Number.isInteger(attempt?.wrong) && attempt.wrong >= 0 && attempt.wrong <= 100 && (attempt.solvedAt === undefined || Number.isFinite(attempt.solvedAt)));
}

function isArchiveHistory(value: unknown): value is ArchiveHistory {
  if (!value || typeof value !== "object") return false;
  const history = value as Partial<ArchiveHistory>;
  return Array.isArray(history.sessions) && history.sessions.length <= 30 && history.sessions.every((session) => isSession(session) && typeof session.id === "string" && Number.isFinite(session.updatedAt) && session.updatedAt > 0);
}

function sessionId(contestId: string) {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return `archive-${crypto.randomUUID()}`;
  return `archive-${contestId}-${Date.now()}`;
}

function normalizeSession(session: Session): Session & { id: string } {
  return { ...session, id: session.id || sessionId(session.contestId) };
}

function newSession(contestId: string): Session & { id: string } {
  return { id: sessionId(contestId), contestId, reveal: false, group: "all", myTeam: readTrainerPreferences().codeforcesHandle, attempts: {}, submissions: [] };
}

function mergeHistory(...sources: ArchiveHistory[]): ArchiveHistory {
  const rows = new Map<string, ArchiveHistoryEntry>();
  for (const source of sources) for (const row of source.sessions) {
    const current = rows.get(row.id);
    if (!current || row.updatedAt >= current.updatedAt) rows.set(row.id, row);
  }
  return { sessions: [...rows.values()].sort((left, right) => right.updatedAt - left.updatedAt).slice(0, 30) };
}

function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 3600)).padStart(2, "0")}:${String(Math.floor(value % 3600 / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

function usedTimeLabel(minutes: number | null) {
  if (minutes === null) return "—";
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function medalForRank(rank: number, teamCount: number): VpMedal {
  if (!rank || !teamCount) return null;
  if (rank <= Math.max(1, Math.ceil(teamCount * .1))) return "gold";
  if (rank <= Math.max(1, Math.ceil(teamCount * .3))) return "silver";
  if (rank <= Math.max(1, Math.ceil(teamCount * .6))) return "bronze";
  return null;
}

const medalText: Record<Exclude<VpMedal, null>, string> = { gold: "金奖", silver: "银奖", bronze: "铜奖" };

export default function ArchiveVpPage() {
  const [year, setYear] = useState<2024 | 2025 | 2026>(2026);
  const [type, setType] = useState("全部");
  const [query, setQuery] = useState("");
  const [session, setSession] = useState<Session | null>(null);
  const [scoreboard, setScoreboard] = useState<ScoreboardPayload | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(0);
  const [teamQuery, setTeamQuery] = useState("");
  const [roomTab, setRoomTab] = useState<ArchiveRoomTab>("problems");
  const [prewarm, setPrewarm] = useState<ArchivePrewarmProgress | null>(null);
  const [prewarmError, setPrewarmError] = useState("");
  const [platformSubmissions, setPlatformSubmissions] = useState<PlatformSubmission[]>([]);
  const [history, setHistory] = useState<ArchiveHistory>({ sessions: [] });
  const scoreboardRequest = useRef<AbortController | null>(null);

  const prewarmContestId = session?.contestId || "";
  const persistHistory = useCallback((nextSession: Session) => {
    const normalized = normalizeSession(nextSession);
    setHistory((current) => {
      const next = mergeHistory(current, { sessions: [{ ...normalized, updatedAt: Date.now() }] });
      void savePersistentJson("archive-vp-history", HISTORY_KEY, next);
      return next;
    });
    return normalized;
  }, []);

  const saveSession = useCallback((next: Session | null) => {
    if (next) {
      const normalized = persistHistory(next);
      setSession(normalized);
      void savePersistentJson("archive-vp", STORAGE_KEY, normalized).then((savedOk) => { if (!savedOk) setMessage("本场补题进度未能持久保存"); });
    } else {
      setSession(null);
      void clearPersistentJson("archive-vp", STORAGE_KEY);
    }
  }, [persistHistory]);

  useEffect(() => {
    setNow(Date.now());
    let active = true;
    const restore = async () => {
      const localHistory = readStoredJson<ArchiveHistory>(HISTORY_KEY, { sessions: [] }, isArchiveHistory);
      const localSession = readStoredJson<Session | null>(STORAGE_KEY, null, (value): value is Session | null => value === null || isSession(value));
      const requestedId = new URLSearchParams(window.location.search).get("contest");
      const requestedContest = requestedId ? findArchiveContest(requestedId) : undefined;
      const [remoteHistory, remoteSession] = await Promise.all([
        loadPersistentJson<ArchiveHistory>("archive-vp-history", HISTORY_KEY, localHistory, isArchiveHistory),
        requestedContest ? Promise.resolve(localSession) : loadPersistentJson<Session | null>("archive-vp", STORAGE_KEY, localSession, (value): value is Session | null => value === null || isSession(value)),
      ]);
      if (!active) return;
      const remembered = requestedContest ? remoteHistory.sessions.find((item) => item.contestId === requestedContest.id && !item.finalResult) : undefined;
      const selected = requestedContest && archiveContestIntegrated(requestedContest)
        ? localSession?.contestId === requestedContest.id ? normalizeSession(localSession) : remembered ? normalizeSession(remembered) : newSession(requestedContest.id)
        : remoteSession ? normalizeSession(remoteSession) : null;
      const merged = selected ? mergeHistory(localHistory, remoteHistory, { sessions: [{ ...selected, updatedAt: Date.now() }] }) : mergeHistory(localHistory, remoteHistory);
      setHistory(merged);
      setSession(selected);
      void savePersistentJson("archive-vp-history", HISTORY_KEY, merged);
      if (selected) void savePersistentJson("archive-vp", STORAGE_KEY, selected);
      if (requestedContest) window.history.replaceState({}, "", window.location.pathname);
    };
    void restore();
    return () => { active = false; scoreboardRequest.current?.abort(); };
  }, []);

  useEffect(() => {
    const receive = (event: Event) => {
      const next = (event as CustomEvent<Session>).detail;
      if (isSession(next)) saveSession(next);
    };
    window.addEventListener(ARCHIVE_SESSION_EVENT, receive);
    return () => window.removeEventListener(ARCHIVE_SESSION_EVENT, receive);
  }, [saveSession]);

  const duration = scoreboard?.durationSeconds ?? 5 * 60 * 60;
  const elapsed = session?.startedAt ? Math.min(duration, Math.max(0, Math.floor((now - session.startedAt) / 1000))) : 0;
  const finished = elapsed >= duration;

  const refresh = useCallback(async (silent = false) => {
    if (!session) return;
    scoreboardRequest.current?.abort();
    const controller = new AbortController();
    scoreboardRequest.current = controller;
    if (!silent) setStatus("loading");
    try {
      const knownDuration = scoreboard?.durationSeconds ?? 5 * 60 * 60;
      const currentElapsed = session.startedAt ? Math.min(knownDuration, Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000))) : 0;
      const params = new URLSearchParams({ id: session.contestId, elapsed: String(currentElapsed), group: session.group, reveal: session.reveal ? "1" : "0" });
      const timeout = window.setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), 25_000);
      const response = await fetch(`/api/archive/scoreboard?${params}`, { cache: "no-store", signal: controller.signal }).finally(() => window.clearTimeout(timeout));
      const data = await response.json() as ScoreboardPayload;
      if (!response.ok) throw new Error(data.error || "真实榜单读取失败");
      setScoreboard(data);
      setStatus("idle");
      setMessage(`已同步 ${data.rows.length} 支队伍、${data.contest.runCount} 条原场提交`);
    } catch (error) {
      if (controller.signal.aborted && scoreboardRequest.current !== controller) return;
      if (!silent) setStatus("error");
      setMessage(silent ? "自动同步失败，已保留上次榜单；可手动重试" : error instanceof Error ? error.message : "真实榜单读取失败");
    }
  }, [scoreboard, session]);

  useEffect(() => {
    if (!session) { setScoreboard(null); return; }
    void refresh();
  }, [session?.contestId, session?.group, session?.reveal]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!session?.startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [session?.startedAt]);

  useEffect(() => {
    if (!session?.startedAt || finished) return;
    const timer = window.setInterval(() => void refresh(true), 10_000);
    return () => window.clearInterval(timer);
  }, [finished, refresh, session?.startedAt]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    const contest = prewarmContestId ? findArchiveContest(prewarmContestId) : undefined;
    if (contest?.staticStatements) {
      const officialChinese = contest.staticStatements === "official-chinese";
      setPrewarm({
        contestId: contest.id,
        total: contest.problemCount,
        readyOriginal: contest.problemCount,
        readyChinese: contest.problemCount,
        officialChinese: officialChinese ? contest.problemCount : 0,
        failed: 0,
        status: "ready",
        progress: 100,
        items: Array.from({ length: contest.problemCount }, (_, index) => ({
          slot: String.fromCharCode(65 + index), originalReady: true, chineseReady: true,
          officialChinese, status: "ready", message: null,
        })),
        updatedAt: null,
      });
      setPrewarmError("");
      return;
    }
    const problemIds = contest?.qojProblemIds?.slice(0, contest.problemCount) || [];
    if (!contest?.qojContestId || problemIds.length !== contest.problemCount) {
      setPrewarm(null);
      setPrewarmError("");
      return;
    }
    const request = {
      contestId: contest.id,
      contestName: contest.name,
      problems: problemIds.map((problemId, index) => ({
        slot: String.fromCharCode(65 + index),
        qojContestId: contest.qojContestId!,
        problemId,
        title: contest.problemTitles?.[index] || `Problem ${String.fromCharCode(65 + index)}`,
      })),
    };
    const refreshPrewarm = async (start = false) => {
      try {
        let value = await loadArchivePrewarm(contest.id);
        if (start && value.total !== request.problems.length) value = await startArchivePrewarm(request);
        if (cancelled) return;
        setPrewarm(value);
        setPrewarmError("");
        if (value.status !== "ready") timer = window.setTimeout(() => void refreshPrewarm(), 4_000);
      } catch (error) {
        if (cancelled) return;
        setPrewarmError(error instanceof Error ? error.message : "整场题面准备暂时不可用");
        timer = window.setTimeout(() => void refreshPrewarm(true), 12_000);
      }
    };
    void refreshPrewarm(true);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [prewarmContestId]);

  useEffect(() => {
    let active = true;
    void loadPlatformSubmissions().then((rows) => { if (active) setPlatformSubmissions(rows); });
    const unsubscribe = subscribePlatformSubmissions(setPlatformSubmissions);
    return () => { active = false; unsubscribe(); };
  }, []);

  const filteredContests = useMemo(() => archiveContests.filter((contest) => contest.year === year && (type === "全部" || contest.type === type) && (!query.trim() || `${contest.name}${contest.city}`.toLowerCase().includes(query.trim().toLowerCase()))), [query, type, year]);

  const combinedRows = useMemo(() => {
    if (!scoreboard || !session) return [];
    const problems = Object.fromEntries(scoreboard.slots.map((slot) => {
      const attempt = session.attempts[slot] || { wrong: 0 };
      const solved = attempt.solvedAt !== undefined && attempt.solvedAt <= elapsed;
      return [slot, { solved, wrongAttempts: attempt.wrong, pendingAttempts: 0, solvedMinutes: solved ? Math.floor((attempt.solvedAt || 0) / 60) : null }];
    }));
    const solvedStates = Object.values(problems).filter((problem) => problem.solved);
    const mine: StandingRow = {
      rank: 0,
      teamId: "__my_team__",
      name: session.myTeam || "我的队伍",
      organization: "本次 VP",
      groups: [],
      solved: solvedStates.length,
      penalty: solvedStates.reduce((sum, problem) => sum + (problem.solvedMinutes || 0) + problem.wrongAttempts * 20, 0),
      lastSolvedMinutes: solvedStates.length ? Math.max(...solvedStates.map((problem) => problem.solvedMinutes || 0)) : null,
      problems,
      mine: true,
    };
    const rows = [...scoreboard.rows, mine].sort((left, right) => right.solved - left.solved || left.penalty - right.penalty || (left.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) - (right.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, "zh-CN"));
    let previous: StandingRow | undefined;
    rows.forEach((row, index) => {
      row.rank = previous && previous.solved === row.solved && previous.penalty === row.penalty && previous.lastSolvedMinutes === row.lastSolvedMinutes ? previous.rank : index + 1;
      previous = row;
    });
    return rows;
  }, [elapsed, scoreboard, session]);

  const visibleRows = useMemo(() => {
    const normalized = teamQuery.trim().toLowerCase();
    if (normalized) return combinedRows.filter((row) => `${row.name} ${row.organization} ${row.teamId}`.toLowerCase().includes(normalized)).slice(0, 120);
    const mine = combinedRows.findIndex((row) => row.mine);
    const indices = new Set(Array.from({ length: Math.min(60, combinedRows.length) }, (_, index) => index));
    for (let index = mine - 2; index <= mine + 2; index += 1) if (index >= 0) indices.add(index);
    return [...indices].sort((a, b) => a - b).map((index) => combinedRows[index]).filter(Boolean);
  }, [combinedRows, teamQuery]);

  const submissionRows = useMemo(() => {
    const records = new Map<string, { id: string; slot: string; verdict: "WA" | "AC" | "PENDING" | "FAILED"; atSeconds: number; detailHref?: string }>();
    for (const row of platformSubmissions) {
      if (!session?.startedAt || row.archiveContestId !== session.contestId || !row.slot) continue;
      const verdict = row.status === "accepted" ? "AC" : row.status === "rejected" ? "WA" : ["failed", "needs_login"].includes(row.status) ? "FAILED" : "PENDING";
      records.set(row.requestId, { id: row.requestId, slot: row.slot, verdict, atSeconds: Math.max(0, Math.floor((Date.parse(row.createdAt) - session.startedAt) / 1000)), detailHref: `/submissions/${row.requestId}` });
    }
    for (const submission of session?.submissions ?? []) records.set(submission.id, { ...records.get(submission.id), ...submission });
    const wrongBySlot: Record<string, number> = {};
    return [...records.values()].sort((left, right) => left.atSeconds - right.atSeconds).map((submission) => {
      const wrongBefore = wrongBySlot[submission.slot] ?? 0;
      if (submission.verdict === "WA") wrongBySlot[submission.slot] = wrongBefore + 1;
      return { ...submission, wrongBefore };
    }).reverse();
  }, [platformSubmissions, session]);
  const prewarmBySlot = useMemo(() => new Map((prewarm?.items || []).map((item) => [item.slot, item])), [prewarm]);
  const mine = combinedRows.find((row) => row.mine);
  const formalTeamCount = scoreboard?.contest.teamCount || scoreboard?.rows.length || 0;
  const liveFinalResult = finished && session?.reveal && mine && formalTeamCount ? {
    rank: mine.rank,
    teamCount: formalTeamCount,
    solved: mine.solved,
    penalty: mine.penalty,
    lastSolvedMinutes: mine.lastSolvedMinutes,
    medal: medalForRank(mine.rank, formalTeamCount),
  } satisfies ArchiveFinalResult : null;
  const finalResult = session?.finalResult || liveFinalResult;

  useEffect(() => {
    if (!session?.startedAt || !finished || session.reveal) return;
    saveSession({ ...session, reveal: true });
  }, [finished, saveSession, session]);

  useEffect(() => {
    if (!session || !liveFinalResult || session.finalResult) return;
    saveSession({ ...session, finishedAt: Date.now(), finalResult: liveFinalResult });
  }, [liveFinalResult, saveSession, session]);

  function chooseContest(contestId: string) {
    const selected = findArchiveContest(contestId);
    if (!selected || !archiveContestIntegrated(selected)) return;
    saveSession(newSession(contestId));
    setRoomTab("problems");
    setScoreboard(null);
  }

  if (!session) return <AppShell active="模拟赛">
    <section className="archive-hero">
      <div><h1>历届补题</h1><p>选择赛事，按原场时间轴 VP</p></div>
      <Link className="button button-ghost" href="/vp">返回常规 VP</Link>
    </section>
    <section className="archive-filters">
      <div className="segmented">{([2026, 2025, 2024] as const).map((value) => <button key={value} className={year === value ? "active" : ""} onClick={() => setYear(value)}>{value}</button>)}</div>
      <div className="segmented">{["全部", "邀请赛", "省赛", "区域赛", "东亚决赛"].map((value) => <button key={value} className={type === value ? "active" : ""} onClick={() => setType(value)}>{value}</button>)}</div>
      <input aria-label="搜索赛事" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索城市或赛事" />
    </section>
    <section className="archive-grid">{filteredContests.map((contest) => {
      const integrated = archiveContestIntegrated(contest);
      return <article key={contest.id} className={`archive-card${integrated ? "" : " pending"}`}>
        <div><span>{contest.year}</span><i>{contest.type}</i></div><h2>{contest.name}</h2><p>{contest.city} · {contest.problemCount} 题 · {integrated ? "题面与提交已接入" : "题面接入中"}</p>
        <button className="button button-primary" disabled={!integrated} onClick={() => chooseContest(contest.id)}>{integrated ? "开始准备" : "即将开放"}</button>
      </article>;
    })}</section>
    {!filteredContests.length ? <p className="archive-empty">当前筛选下没有赛事，请更换年份、类型或搜索词。</p> : null}
    {history.sessions.length ? <section className="panel archive-vp-history"><header><div><h2>我的历届 VP</h2><p>进度、提交与最终成绩均已保存，可跨设备继续。</p></div><strong>{history.sessions.length} 场</strong></header><div>{history.sessions.map((entry) => {
      const contest = findArchiveContest(entry.contestId);
      const solved = entry.finalResult?.solved ?? Object.values(entry.attempts).filter((attempt) => attempt.solvedAt !== undefined).length;
      return <article key={entry.id}><span className={entry.finalResult ? "finished" : entry.startedAt ? "running" : "ready"}>{entry.finalResult ? entry.finalResult.medal ? medalText[entry.finalResult.medal] : "已完成" : entry.startedAt ? "进行中" : "未开始"}</span><div><b>{contest?.name || entry.contestId}</b><small>{entry.startedAt ? new Date(entry.startedAt).toLocaleString("zh-CN") : "赛前准备"} · {solved} 题</small></div>{entry.finalResult ? <em>第 {entry.finalResult.rank} 名 · {entry.finalResult.penalty} 罚时</em> : <em>{Object.keys(entry.attempts).length ? "已有作答" : "等待开赛"}</em>}<button type="button" onClick={() => saveSession(entry)}>{entry.finalResult ? "查看结果" : "继续 VP"} →</button></article>;
    })}</div></section> : null}
  </AppShell>;

  const contest = findArchiveContest(session.contestId);
  const remaining = Math.max(0, duration - elapsed);
  const groupOptions = Object.entries(scoreboard?.contest.groups || {});
  const progress = Math.min(100, elapsed / Math.max(1, duration) * 100);
  const slots = scoreboard?.slots || Array.from({ length: contest?.problemCount || 13 }, (_, index) => String.fromCharCode(65 + index));

  return <AppShell active="模拟赛">
    <section className="archive-room-head">
      <div><button className="archive-back" onClick={() => saveSession(null)}>← 更换赛事</button><span className="eyebrow"><span className="live-dot" /> {session.startedAt ? finished ? "比赛结束" : "原场榜单同步中" : "赛前准备"}</span><h1>{scoreboard?.contest.officialName || contest?.name || "历届补题"}</h1><p>{scoreboard ? `${new Date(scoreboard.contest.startTime).toLocaleDateString("zh-CN")} · ${scoreboard.contest.teamCount} 支真实队伍 · ${scoreboard.contest.runCount} 条提交` : "正在读取原场数据…"}</p></div>
      <div className="archive-clock"><small>{session.startedAt ? "剩余时间" : "原场时长"}</small><b>{clock(session.startedAt ? remaining : duration)}</b><span>我的队伍：{!session.startedAt ? "等待开赛" : mine ? `第 ${mine.rank} 名 · ${mine.solved} 题` : "等待榜单"}</span></div>
    </section>
    <div className="archive-timeline"><i style={{ width: `${progress}%` }} /><span className="freeze-marker" style={{ left: `${(scoreboard?.freezeAtSeconds || duration * .8) / duration * 100}%` }}>封榜</span></div>
    <section className="contest-actions archive-actions">
      {!session.startedAt ? <button className="button button-primary" onClick={() => { const startedAt = Date.now(); saveSession({ ...session, startedAt }); setNow(startedAt); }}>开始 VP</button> : <button className="button button-primary" onClick={() => void refresh()} disabled={status === "loading"}>{status === "loading" ? "同步中…" : "立即同步原场榜"}</button>}
      {finished && !session.reveal ? <button className="button button-primary reveal-button" onClick={() => saveSession({ ...session, reveal: true })}>比赛结束 · 揭榜</button> : null}
      {session.reveal ? <button className="button button-ghost" onClick={() => saveSession({ ...session, reveal: false })}>恢复封榜视图</button> : null}
      <span className={status === "error" ? "form-error" : ""}>{message}</span>
    </section>
    {finished && finalResult ? <section className={`vp-final-result archive-final-result medal-${finalResult.medal || "none"}`}><div><span>{finalResult.medal ? medalText[finalResult.medal] : "本场完成"}</span><h2>第 {finalResult.rank} 名</h2><p>按 {finalResult.teamCount} 支正式队伍计算</p></div><dl><div><dt>解题</dt><dd>{finalResult.solved}</dd></div><div><dt>总罚时</dt><dd>{finalResult.penalty}</dd></div><div><dt>总用时</dt><dd>{usedTimeLabel(finalResult.lastSolvedMinutes)}</dd></div></dl><small>比赛结束后自动揭榜；金奖前 10%，银奖随后 20%，铜奖随后 30%，同分并列同奖。</small></section> : null}
    <section className={`archive-freeze-state ${scoreboard?.frozen ? "active" : ""}`}><b>{scoreboard?.frozen ? "榜单已进入原场封榜时段" : "榜单按原场时间推进"}</b><span>{scoreboard?.frozen ? "封榜后的提交显示为待定，不提前泄露结果；比赛结束后可手动揭榜。" : `当前重放至 ${clock(elapsed)}，下一次自动同步不超过 10 秒。`}</span></section>
    {prewarm ? <section className={`archive-prewarm${prewarm.status === "ready" ? " ready" : ""}`}><div><b>{prewarm.status === "ready" ? "整场题面已就绪" : "正在准备整场题面"}</b><span>{prewarm.readyOriginal}/{prewarm.total} 原题 · {prewarm.readyChinese}/{prewarm.total} 中文 · {prewarm.officialChinese} 题官方中文</span></div><strong>{prewarm.progress}%</strong><i><span style={{ width: `${prewarm.progress}%` }} /></i></section> : prewarmError ? <section className="archive-prewarm error"><div><b>题面预热稍后重试</b><span>{prewarmError}</span></div></section> : null}

    <nav className="vp-room-tabs archive-room-tabs" aria-label="历届补题模拟赛内容" role="tablist">
      <button type="button" role="tab" aria-selected={roomTab === "problems"} className={roomTab === "problems" ? "active" : ""} onClick={() => setRoomTab("problems")}><span>题目</span><b>{mine?.solved ?? 0}/{slots.length}</b></button>
      <button type="button" role="tab" aria-selected={roomTab === "standings"} className={roomTab === "standings" ? "active" : ""} onClick={() => setRoomTab("standings")}><span>实时榜单</span><b>{mine?.rank ? `#${mine.rank}` : "LIVE"}</b></button>
      <button type="button" role="tab" aria-selected={roomTab === "submissions"} className={roomTab === "submissions" ? "active" : ""} onClick={() => setRoomTab("submissions")}><span>队伍提交</span><b>{submissionRows.length}</b></button>
    </nav>

    {roomTab === "problems" ? <section className="panel vp-room-panel archive-vp-problem-panel" role="tabpanel">
      <header className="vp-tab-heading"><div><h2>题目列表</h2><p>点击题目进入本站题面；WA 与 AC 会自动写入队伍提交记录</p></div><div><span>题面 · 翻译 · 提交</span></div></header>
      <div className="archive-vp-problem-list"><div className="archive-vp-problem-list-head"><span>题号</span><span>题目</span><span>状态</span><span>操作</span></div>{slots.map((slot) => {
        const attempt = session.attempts[slot] || { wrong: 0 };
        const solved = attempt.solvedAt !== undefined;
        const href = contest ? archiveProblemHref(contest, slot) : "#";
        const practice = contest ? archivePracticeProblem(contest, slot) : null;
        const prepared = prewarmBySlot.get(slot);
        const title = practice?.title || contest?.problemTitles?.[slot.charCodeAt(0) - 65] || `Problem ${slot}`;
        return <article className={`archive-vp-problem-row${solved ? " solved" : attempt.wrong ? " attempted" : ""}`} key={slot}>
          <Link href={href}><span className="archive-problem-letter">{slot}</span><span><b>{title}</b><small>{prepared ? prepared.chineseReady ? prepared.officialChinese ? "官方中文已就绪 · 可直接提交" : "中文题面已就绪 · 可直接提交" : prepared.originalReady ? "原题已就绪 · 中文准备中" : "题面预热中" : "题面、中文翻译与提交"}</small></span></Link>
          <span className={`archive-vp-problem-state${solved ? " solved" : attempt.wrong ? " attempted" : ""}`}>{solved ? `AC · ${clock(attempt.solvedAt || 0)}` : attempt.wrong ? `${attempt.wrong} 次 WA` : "未尝试"}</span>
          <div><Link href={href}>{session.startedAt ? "开始做题 →" : "查看题面 →"}</Link></div>
        </article>;
      })}</div>
    </section> : null}

    {roomTab === "standings" ? <article className="panel archive-standings vp-room-panel" role="tabpanel">
      <div className="panel-head"><div><h2>同时间轴真实榜单</h2><p>原场提交按当前 VP 用时重放；紫色行是你的实时相对名次。</p></div><div className="archive-board-tools">{groupOptions.length ? <select value={session.group} onChange={(event) => saveSession({ ...session, group: event.target.value })}><option value="all">全部组别</option>{groupOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : null}<input value={teamQuery} onChange={(event) => setTeamQuery(event.target.value)} placeholder="搜索队伍 / 学校" /><button type="button" onClick={() => void refresh()} disabled={status === "loading"}>{status === "loading" ? "同步中…" : "刷新"}</button></div></div>
      <div className="archive-table" style={{ "--archive-problem-count": slots.length } as CSSProperties}>
        <div className="archive-row archive-header"><span>#</span><span>队伍</span><span>AC</span><span>罚时</span>{slots.map((slot) => <span key={slot}>{slot}</span>)}</div>
        {visibleRows.map((row) => <div className={`archive-row${row.mine ? " mine" : ""}`} key={row.teamId}><strong>{row.rank}</strong><span className="archive-team"><b>{row.name}</b><small>{row.organization || row.teamId}</small></span><strong>{row.solved}</strong><span>{row.penalty}</span>{slots.map((slot) => { const problem = row.problems[slot]; return <span key={slot} className={problem?.solved ? "solved" : problem?.pendingAttempts ? "pending" : problem?.wrongAttempts ? "attempted" : ""}>{problem?.solved ? `+${problem.wrongAttempts || ""}` : problem?.pendingAttempts ? `?${problem.pendingAttempts}` : problem?.wrongAttempts ? `-${problem.wrongAttempts}` : "·"}</span>; })}</div>)}
      </div>
      {!teamQuery && combinedRows.length > visibleRows.length ? <p className="archive-table-note">默认显示前 60 名及你的名次附近；可搜索任意真实队伍。</p> : null}
    </article> : null}

    {roomTab === "submissions" ? <section className="panel vp-room-panel archive-submission-panel" role="tabpanel">
      <header className="vp-tab-heading"><div><h2>队伍提交记录</h2><p>站内提交后自动同步判题结果、比赛用时与罚时</p></div><div><span>{session.myTeam || "我的队伍"}</span><span>{submissionRows.length} 条</span></div></header>
      <div className="archive-submission-list"><div className="archive-submission-head"><span>比赛时间</span><span>队伍</span><span>题目</span><span>结果</span><span>罚时影响</span></div>{submissionRows.map((submission) => {
        const href = submission.detailHref || (contest ? archiveProblemHref(contest, submission.slot) : "#");
        const practice = contest ? archivePracticeProblem(contest, submission.slot) : null;
        const title = practice?.title || contest?.problemTitles?.[submission.slot.charCodeAt(0) - 65] || `Problem ${submission.slot}`;
        const penalty = submission.verdict === "AC" ? Math.floor(submission.atSeconds / 60) + submission.wrongBefore * 20 : null;
        const result = submission.verdict === "AC" ? "Accepted" : submission.verdict === "WA" ? "Wrong Answer" : submission.verdict === "FAILED" ? "提交未送达" : "评测中";
        const impact = penalty !== null ? `${penalty} 分钟` : submission.verdict === "WA" ? "通过后计入 +20" : submission.verdict === "PENDING" ? "判题后自动计算" : "不计罚时";
        return <Link className="archive-submission-row" href={href} key={submission.id}><time>+{clock(submission.atSeconds)}</time><b>{session.myTeam || "我的队伍"}</b><span><strong>{submission.slot}</strong>{title}</span><em className={submission.verdict === "AC" ? "accepted" : submission.verdict === "PENDING" ? "pending" : "rejected"}>{result}</em><small>{impact}</small></Link>;
      })}</div>
      {!submissionRows.length ? <div className="vp-tab-empty"><b>还没有提交记录</b><span>从“题目”标签进入题面并直接提交，判题完成后会自动显示</span><button type="button" onClick={() => setRoomTab("problems")}>去做题 →</button></div> : null}
    </section> : null}
  </AppShell>;
}
