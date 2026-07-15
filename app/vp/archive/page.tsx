"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { archiveContests, archivePracticeProblem, archiveProblemHref, findArchiveContest } from "../../data/archive-contests";
import { ARCHIVE_SESSION_EVENT } from "../../lib/archive-vp-session";
import { clearPersistentJson, loadPersistentJson, savePersistentJson } from "../../lib/persistent-state";
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
type Session = { contestId: string; startedAt?: number; reveal: boolean; group: string; myTeam: string; attempts: Record<string, MyAttempt>; submissions?: ArchiveSubmission[] };

const STORAGE_KEY = "icpc-trainer-archive-vp";

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Session>;
  if (typeof item.contestId !== "string" || !findArchiveContest(item.contestId) || typeof item.reveal !== "boolean" || typeof item.group !== "string" || item.group.length > 100 || typeof item.myTeam !== "string" || item.myTeam.length > 80 || !item.attempts || typeof item.attempts !== "object") return false;
  if (item.startedAt !== undefined && (!Number.isFinite(item.startedAt) || Number(item.startedAt) <= 0)) return false;
  if (item.submissions !== undefined && (!Array.isArray(item.submissions) || item.submissions.length > 500 || !item.submissions.every((submission) => typeof submission?.id === "string" && /^[A-Z]$/.test(submission.slot) && ["WA", "AC"].includes(submission.verdict) && Number.isFinite(submission.atSeconds) && submission.atSeconds >= 0))) return false;
  return Object.entries(item.attempts).length <= 26 && Object.entries(item.attempts).every(([slot, attempt]) => /^[A-Z]$/.test(slot) && Number.isInteger(attempt?.wrong) && attempt.wrong >= 0 && attempt.wrong <= 100 && (attempt.solvedAt === undefined || Number.isFinite(attempt.solvedAt)));
}

function clock(seconds: number) {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 3600)).padStart(2, "0")}:${String(Math.floor(value % 3600 / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}

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
  const scoreboardRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    setNow(Date.now());
    const saved = readStoredJson<Session | null>(STORAGE_KEY, null, (value): value is Session | null => value === null || isSession(value));
    const requestedId = new URLSearchParams(window.location.search).get("contest");
    const requestedContest = requestedId ? findArchiveContest(requestedId) : undefined;
    if (requestedContest) {
      const next: Session = { contestId: requestedContest.id, reveal: false, group: "all", myTeam: readTrainerPreferences().codeforcesHandle, attempts: {}, submissions: [] };
      setSession(next);
      void savePersistentJson("archive-vp", STORAGE_KEY, next).then((savedOk) => { if (!savedOk) setMessage("本场补题进度未能持久保存"); });
      window.history.replaceState({}, "", window.location.pathname);
    } else {
      if (saved) setSession(saved);
      void loadPersistentJson<Session | null>("archive-vp", STORAGE_KEY, saved, (value): value is Session | null => value === null || isSession(value)).then((remote) => { if (remote) setSession(remote); });
    }
    return () => scoreboardRequest.current?.abort();
  }, []);

  useEffect(() => {
    const receive = (event: Event) => {
      const next = (event as CustomEvent<Session>).detail;
      if (isSession(next)) setSession(next);
    };
    window.addEventListener(ARCHIVE_SESSION_EVENT, receive);
    return () => window.removeEventListener(ARCHIVE_SESSION_EVENT, receive);
  }, []);

  const saveSession = useCallback((next: Session | null) => {
    setSession(next);
    if (next) {
      void savePersistentJson("archive-vp", STORAGE_KEY, next).then((savedOk) => { if (!savedOk) setMessage("本场补题进度未能持久保存"); });
    } else void clearPersistentJson("archive-vp", STORAGE_KEY);
  }, []);

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
    const wrongBySlot: Record<string, number> = {};
    return [...(session?.submissions ?? [])].sort((left, right) => left.atSeconds - right.atSeconds).map((submission) => {
      const wrongBefore = wrongBySlot[submission.slot] ?? 0;
      if (submission.verdict === "WA") wrongBySlot[submission.slot] = wrongBefore + 1;
      return { ...submission, wrongBefore };
    }).reverse();
  }, [session?.submissions]);

  function chooseContest(contestId: string) {
    saveSession({ contestId, reveal: false, group: "all", myTeam: readTrainerPreferences().codeforcesHandle, attempts: {}, submissions: [] });
    setRoomTab("problems");
    setScoreboard(null);
  }

  function updateAttempt(slot: string, action: "wrong" | "solve" | "reset") {
    if (!session?.startedAt || finished) return;
    const current = session.attempts[slot] || { wrong: 0 };
    const next = { ...session.attempts };
    let submissions = [...(session.submissions ?? [])];
    if (action === "reset") {
      delete next[slot];
      submissions = submissions.filter((submission) => submission.slot !== slot);
    } else if (action === "wrong" && current.solvedAt === undefined) {
      next[slot] = { ...current, wrong: current.wrong + 1 };
      submissions.push({ id: `${Date.now()}-${slot}-WA`, slot, verdict: "WA", atSeconds: elapsed });
    } else if (action === "solve" && current.solvedAt === undefined) {
      next[slot] = { ...current, solvedAt: elapsed };
      submissions.push({ id: `${Date.now()}-${slot}-AC`, slot, verdict: "AC", atSeconds: elapsed });
    }
    saveSession({ ...session, attempts: next, submissions: submissions.slice(-500) });
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
    <section className="archive-grid">{filteredContests.map((contest) => <article key={contest.id} className="archive-card">
      <div><span>{contest.year}</span><i>{contest.type}</i></div><h2>{contest.name}</h2><p>{contest.city} · {contest.problemCount} 题 · ICPC 赛制</p>
      <button className="button button-primary" onClick={() => chooseContest(contest.id)}>开始准备</button>
    </article>)}</section>
    {!filteredContests.length ? <p className="archive-empty">当前筛选下没有赛事，请更换年份、类型或搜索词。</p> : null}
  </AppShell>;

  const contest = findArchiveContest(session.contestId);
  const mine = combinedRows.find((row) => row.mine);
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
      <a className="button button-ghost" href={scoreboard?.contest.boardUrl} target="_blank" rel="noreferrer">核对 XCPCIO 原榜 ↗</a>
      <span className={status === "error" ? "form-error" : ""}>{message}</span>
    </section>
    <section className={`archive-freeze-state ${scoreboard?.frozen ? "active" : ""}`}><b>{scoreboard?.frozen ? "榜单已进入原场封榜时段" : "榜单按原场时间推进"}</b><span>{scoreboard?.frozen ? "封榜后的提交显示为待定，不提前泄露结果；比赛结束后可手动揭榜。" : `当前重放至 ${clock(elapsed)}，下一次自动同步不超过 10 秒。`}</span></section>

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
        const title = practice?.title || contest?.problemTitles?.[slot.charCodeAt(0) - 65] || `Problem ${slot}`;
        return <article className={`archive-vp-problem-row${solved ? " solved" : attempt.wrong ? " attempted" : ""}`} key={slot}>
          <Link href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}><span className="archive-problem-letter">{slot}</span><span><b>{title}</b><small>题面、中文翻译与提交</small></span></Link>
          <span className={`archive-vp-problem-state${solved ? " solved" : attempt.wrong ? " attempted" : ""}`}>{solved ? `AC · ${clock(attempt.solvedAt || 0)}` : attempt.wrong ? `${attempt.wrong} 次 WA` : "未尝试"}</span>
          <div><button disabled={!session.startedAt || solved || finished} onClick={() => updateAttempt(slot, "wrong")}>+ WA</button><button disabled={!session.startedAt || solved || finished} onClick={() => updateAttempt(slot, "solve")}>标记 AC</button>{attempt.wrong || solved ? <button onClick={() => updateAttempt(slot, "reset")}>重置</button> : null}</div>
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
      <header className="vp-tab-heading"><div><h2>队伍提交记录</h2><p>由本场的“+ WA”和“标记 AC”实时生成并持久保存</p></div><div><span>{session.myTeam || "我的队伍"}</span><span>{submissionRows.length} 条</span></div></header>
      <div className="archive-submission-list"><div className="archive-submission-head"><span>比赛时间</span><span>队伍</span><span>题目</span><span>结果</span><span>罚时影响</span></div>{submissionRows.map((submission) => {
        const href = contest ? archiveProblemHref(contest, submission.slot) : "#";
        const practice = contest ? archivePracticeProblem(contest, submission.slot) : null;
        const title = practice?.title || contest?.problemTitles?.[submission.slot.charCodeAt(0) - 65] || `Problem ${submission.slot}`;
        const penalty = submission.verdict === "AC" ? Math.floor(submission.atSeconds / 60) + submission.wrongBefore * 20 : null;
        return <Link className="archive-submission-row" href={href} key={submission.id}><time>+{clock(submission.atSeconds)}</time><b>{session.myTeam || "我的队伍"}</b><span><strong>{submission.slot}</strong>{title}</span><em className={submission.verdict === "AC" ? "accepted" : "rejected"}>{submission.verdict === "AC" ? "Accepted" : "Wrong Answer"}</em><small>{penalty === null ? "通过后计入 +20" : `${penalty} 分钟`}</small></Link>;
      })}</div>
      {!submissionRows.length ? <div className="vp-tab-empty"><b>还没有提交记录</b><span>从“题目”标签记录 WA 或 AC 后会立即显示</span><button type="button" onClick={() => setRoomTab("problems")}>去做题 →</button></div> : null}
    </section> : null}
  </AppShell>;
}
