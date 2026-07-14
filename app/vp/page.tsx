"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AppShell, Icon } from "../components/AppShell";
import { authFetch } from "../lib/auth-client";
import { getDeviceId } from "../lib/device-id";
import { readTrainerPreferences, saveTrainerPreferences, validCodeforcesHandle } from "../lib/preferences";
import { readStoredJson, removeStoredValue, writeStoredJson } from "../lib/storage";

type VpProblem = { slot: string; code: string; contestId: number; index: string; title: string; rating: number; tags: string[]; thinking?: boolean };
type SourceContest = { contestId: number; problemCount: number; averageRating: number; url: string };
type ProblemStanding = { solved: boolean; wrongAttempts: number; pendingAttempts?: number; solvedMinutes: number | null; penalty: number };
type StandingRow = { id: string; rank: number; handle: string; solved: number; penalty: number; problems: Record<string, ProblemStanding>; mine?: boolean; origin?: "original" | "mine"; sourceCount?: number };
type Standings = { updatedAt: string; elapsedSeconds?: number; pollAfterSeconds?: number; totalRows?: number; originalTeams?: number; unavailableContestIds?: number[]; sourceBoards?: Array<{ contestId: number; name: string; selectedProblems: string[]; sampledTeams: number }>; rows: StandingRow[] };
type Contest = { id: string; handle: string; participants?: string[]; mode: string; seed: string; durationMinutes: number; targetRating: number; thinkingRatio?: number; thinkingCount?: number; sourceContestId: number | null; sourceContests?: SourceContest[]; excludedSolved: number; createdAt: string; startedAt?: number; problems: VpProblem[]; standings?: Standings };

const STORAGE_KEY = "icpc-trainer-active-vp";
const modeOptions = [
  ["自由组卷", "跨比赛形成难度梯度，默认提高思维题占比", "✦"],
  ["原场镜像", "完整复现一场历史比赛", "◫"],
  ["多场组合", "从 2–4 场历史比赛组合", "⊞"],
];

async function vpJson<T>(path: string, init: RequestInit = {}, timeoutMs = 30_000) {
  const response = await authFetch(path, init, timeoutMs);
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}

function isContest(value: unknown): value is Contest {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Contest>;
  return typeof item.id === "string" && typeof item.handle === "string" && validCodeforcesHandle(item.handle)
    && Number.isFinite(item.durationMinutes) && Number(item.durationMinutes) >= 60 && Number(item.durationMinutes) <= 600
    && Array.isArray(item.problems) && item.problems.length >= 5 && item.problems.length <= 20
    && item.problems.every((problem) => Number.isInteger(problem?.contestId) && /^[A-Z][0-9]?$/.test(String(problem?.index || "")));
}

export default function VpPage() {
  const [mode, setMode] = useState("自由组卷");
  const [duration, setDuration] = useState(180);
  const [count, setCount] = useState(10);
  const [targetRating, setTargetRating] = useState(1600);
  const [thinkingRatio, setThinkingRatio] = useState(0.6);
  const [participantText, setParticipantText] = useState("ShallowDream2");
  const [seed, setSeed] = useState("");
  const [contest, setContest] = useState<Contest | null>(null);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "syncing">("idle");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const generateRequest = useRef<AbortController | null>(null);
  const standingsRequest = useRef<AbortController | null>(null);

  useEffect(() => {
    const preferences = readTrainerPreferences();
    setParticipantText(preferences.codeforcesHandle);
    const saved = readStoredJson<Contest | null>(STORAGE_KEY, null, (value): value is Contest | null => value === null || isContest(value));
    if (saved) { setContest(saved); setParticipantText((saved.participants ?? [saved.handle]).join(", ")); }
    void vpJson<{ session: Contest | null }>(`/vp/sessions/active?clientId=${encodeURIComponent(getDeviceId())}`, { cache: "no-store" }).then(({ session }) => {
      if (session && isContest(session)) { save(session); setParticipantText((session.participants ?? [session.handle]).join(", ")); }
    }).catch(() => undefined);
    return () => { generateRequest.current?.abort(); standingsRequest.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!contest?.startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [contest?.startedAt]);
  useEffect(() => {
    if (!contest?.startedAt) return;
    void syncStandings(true);
    const pollMs = Math.max(15, contest.standings?.pollAfterSeconds ?? Math.ceil((contest.participants?.length ?? 1) * 2.5)) * 1000;
    const timer = window.setInterval(() => {
      if (Date.now() < contest.startedAt! + contest.durationMinutes * 60_000) void syncStandings(true);
    }, pollMs);
    return () => window.clearInterval(timer);
  }, [contest?.id, contest?.startedAt, contest?.participants?.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const participants = useMemo(() => [...new Set(participantText.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean))], [participantText]);
  const remaining = useMemo(() => {
    if (!contest?.startedAt) return contest ? contest.durationMinutes * 60 : duration * 60;
    return Math.max(0, contest.durationMinutes * 60 - Math.floor((now - contest.startedAt) / 1000));
  }, [contest, duration, now]);
  const timeLabel = `${String(Math.floor(remaining / 3600)).padStart(2, "0")}:${String(Math.floor(remaining % 3600 / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;

  function save(next: Contest | null) {
    setContest(next);
    if (next) {
      if (!writeStoredJson(STORAGE_KEY, next)) setMessage("浏览器无法保存本场 VP，刷新页面后进度可能丢失");
    } else removeStoredValue(STORAGE_KEY);
  }

  async function generateContest() {
    if (!participants.length || participants.length > 12 || participants.some((item) => !validCodeforcesHandle(item))) { setStatus("error"); setMessage("请输入 1–12 个有效的 Codeforces Handle"); return; }
    generateRequest.current?.abort();
    const controller = new AbortController();
    generateRequest.current = controller;
    setStatus("loading");
    setMessage("");
    try {
      const data = await vpJson<Contest>("/vp/generate", { method: "POST", body: JSON.stringify({ clientId: getDeviceId(), participants, handle: participants[0], mode, count, targetRating, thinkingRatio, durationMinutes: duration, seed: seed || undefined }), signal: controller.signal }, 30_000);
      if (!isContest(data)) throw new Error("组卷服务返回了无效比赛");
      save(data);
      setSeed(data.seed);
      const preferences = readTrainerPreferences();
      saveTrainerPreferences({ ...preferences, codeforcesHandle: participants[0] });
      setStatus("idle");
    } catch (error) {
      if (controller.signal.aborted) return;
      setMessage(error instanceof Error ? error.message : "组卷失败");
      setStatus("error");
    }
  }

  function startContest() {
    if (!contest || contest.startedAt) return;
    const startedAt = Date.now();
    save({ ...contest, startedAt });
    setNow(startedAt);
    void vpJson<{ session: Contest }>("/vp/sessions/start", { method: "POST", body: JSON.stringify({ clientId: getDeviceId(), id: contest.id, startedAt }) }).then(({ session }) => { if (isContest(session)) save(session); }).catch(() => setMessage("比赛已在本机开始，但服务器暂时未能保存开始时间"));
  }

  function finishContest() {
    if (!contest) return;
    void vpJson("/vp/sessions/finish", { method: "POST", body: JSON.stringify({ clientId: getDeviceId(), id: contest.id }) }).catch(() => undefined);
    save(null);
  }

  async function syncStandings(silent = false) {
    if (!contest?.startedAt) return;
    if (standingsRequest.current) return;
    const controller = new AbortController();
    standingsRequest.current = controller;
    if (!silent) setStatus("syncing");
    if (!contest.standings) setMessage("正在加载并合并各题原比赛榜单；首次完成后会写入服务器数据库…");
    try {
      const data = await vpJson<Standings>("/vp/standings", { method: "POST", body: JSON.stringify({ clientId: getDeviceId(), vpId: contest.id, participants: contest.participants?.length ? contest.participants : [contest.handle], startedAt: contest.startedAt, durationMinutes: contest.durationMinutes, problems: contest.problems.map(({ contestId, index, slot }) => ({ contestId, index, slot })) }), signal: controller.signal }, 120_000);
      if (!Array.isArray(data.rows)) throw new Error("榜单服务返回了无效数据");
      save({ ...contest, standings: data });
      setMessage(`已合并 ${data.sourceBoards?.length ?? 0} 场原榜、${data.originalTeams ?? 0} 支原参赛队`);
      setStatus("idle");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!silent) { setMessage(error instanceof Error ? error.message : "榜单同步失败"); setStatus("error"); }
      else setMessage("自动刷新失败，已保留上次榜单；可点击“立即刷新榜单”重试");
    } finally { if (standingsRequest.current === controller) standingsRequest.current = null; }
  }

  if (contest) {
    const participantHandles = new Set((contest.participants ?? [contest.handle]).map((handle) => handle.toLowerCase()));
    const rows: StandingRow[] = contest.standings?.rows?.map((row, index) => ({ ...row, id: row.id || `legacy:${row.handle.toLowerCase()}:${index}`, mine: row.mine ?? participantHandles.has(row.handle.toLowerCase()) })) ?? (contest.participants ?? [contest.handle]).map((handle, index) => ({ id: `mine:${handle.toLowerCase()}`, rank: index + 1, handle, solved: 0, penalty: 0, problems: {} as Record<string, ProblemStanding>, mine: true, origin: "mine" }));
    const myRow = rows.find((row) => row.mine && row.handle.toLowerCase() === contest.handle.toLowerCase()) ?? rows.find((row) => row.mine) ?? rows[0];
    const pollSeconds = contest.standings?.pollAfterSeconds ?? Math.max(15, Math.ceil((contest.participants?.length ?? 1) * 2.5));
    return <AppShell active="模拟赛">
      <section className="contest-room-head">
        <div><span className="eyebrow"><span className="live-dot" /> {contest.startedAt ? "原比赛榜单回放中" : "比赛已生成"}</span><h1>{contest.mode} · {contest.problems.length} 题</h1><p>{(contest.participants ?? [contest.handle]).join(" / ")} · {contest.thinkingCount ?? contest.problems.filter((problem) => problem.thinking).length} 道思维题 · 已排除 {contest.excludedSolved} 道历史 AC · Seed <code>{contest.seed}</code></p></div>
        <div className="contest-clock"><small>{contest.startedAt ? "剩余时间" : "比赛时长"}</small><b>{timeLabel}</b><span>{rows[0]?.solved ?? 0} AC · {rows.length} 位参赛者</span></div>
      </section>
      <section className="contest-actions">
        {!contest.startedAt ? <button className="button button-primary" onClick={startContest}><Icon name="play" /> 开始比赛</button> : <button className="button button-primary" onClick={() => void syncStandings(false)} disabled={status === "syncing"}><Icon name="history" /> {status === "syncing" ? "同步中…" : "立即刷新榜单"}</button>}
        <button className="button button-ghost" onClick={finishContest}>结束并重新组卷</button>
        {message ? <span className={status === "error" ? "form-error" : ""}>{message}</span> : null}
      </section>
      <section className="vp-rule-strip"><b>榜单规则</b><span>按原比赛同时间回放</span><span>只计算本次题目</span><span>当前队伍实时插榜</span></section>
      {contest.startedAt && contest.sourceContests?.length ? <section className="contest-sources"><span>来源参考</span>{contest.sourceContests.map((source) => <a key={source.contestId} href={source.url} target="_blank" rel="noreferrer">CF {source.contestId} · {source.problemCount} 题 · 均分 {source.averageRating} ↗</a>)}</section> : null}
      <section className="contest-live-layout">
        <div className="contest-problem-grid">{contest.problems.map((problem) => {
          const myState = myRow?.problems?.[`${problem.contestId}${problem.index}`];
          return <article className={`contest-problem-card ${myState?.solved ? "accepted" : ""}`} key={problem.code}><span>{problem.slot}</span><div><small>{contest.startedAt ? problem.code : "START 后显示来源"}</small><h2>{contest.startedAt ? problem.title : `Problem ${problem.slot}`}</h2>{contest.startedAt ? <p>{problem.rating} · {problem.thinking ? "思维题" : "综合题"} · {problem.tags.slice(0, 3).join(" / ")}</p> : null}</div><strong>{myState?.solved ? `+${myState.wrongAttempts}` : myState?.pendingAttempts ? `?${myState.pendingAttempts}` : myState?.wrongAttempts ? `-${myState.wrongAttempts}` : "—"}</strong>{contest.startedAt ? <a href={`/problem/${problem.contestId}${problem.index}`}>打开 →</a> : null}</article>;
        })}</div>
        <article className="panel live-standings" style={{ "--problem-count": contest.problems.length } as CSSProperties}><div className="panel-head"><div><h2>原比赛组合实时榜单</h2><p>{contest.standings ? `${new Date(contest.standings.updatedAt).toLocaleTimeString("zh-CN")} 已同步 · ${contest.standings.sourceBoards?.length ?? 0} 场 · ${contest.standings.originalTeams ?? 0} 支原队伍 · ${pollSeconds} 秒刷新` : "首次开始会读取每道题所属比赛的原榜，完成后持久写入数据库"}</p></div><span className="live-dot" /></div>{contest.standings?.sourceBoards?.length ? <div className="combined-board-sources">{contest.standings.sourceBoards.map((source) => <span key={source.contestId}><b>CF {source.contestId}</b> · {source.selectedProblems.join("/")} · {source.sampledTeams} 队</span>)}</div> : null}<div className="standings-table"><div className="standings-row standings-header"><span>#</span><span>参赛者 / 原队伍</span><span>AC</span><span>罚时</span>{contest.problems.map((problem) => <span key={problem.code}>{problem.slot}</span>)}</div>{rows.map((row) => <div className={`standings-row${row.mine ? " mine" : ""}`} key={row.id}><strong>{row.rank}</strong><span className="standing-party"><b>{row.handle}</b><small>{row.mine ? "当前 VP" : `原比赛${row.sourceCount && row.sourceCount > 1 ? ` · 合并 ${row.sourceCount} 场` : ""}`}</small></span><strong>{row.solved}</strong><span>{row.penalty}</span>{contest.problems.map((problem) => { const state = row.problems?.[`${problem.contestId}${problem.index}`]; return <span className={state?.solved ? "solved" : state?.pendingAttempts ? "pending" : state?.wrongAttempts ? "attempted" : ""} key={problem.code}>{state?.solved ? `+${state.wrongAttempts || ""}` : state?.pendingAttempts ? `?${state.pendingAttempts}` : state?.wrongAttempts ? `-${state.wrongAttempts}` : "·"}</span>; })}</div>)}</div></article>
      </section>
    </AppShell>;
  }

  return <AppShell active="模拟赛">
    <section className="vp-builder-head"><div><h1>创建 VP</h1><p>自由组卷或复现历史比赛</p></div><div><b>{duration / 60}h</b><span>{count} 题</span><span>{participants.length || 0} 人</span></div></section>
    <Link className="archive-vp-entry" href="/vp/archive"><span>ICPC</span><div><h2>历届补题</h2><p>邀请赛、区域赛与 EC-Final 原榜回放</p></div><b>选择赛事 →</b></Link>
    <section className="vp-builder simplified-vp-builder">
      <div className="builder-main">
        <div className="builder-section"><div><h2>模式</h2></div><div className="mode-grid three-modes">{modeOptions.map(([name, description, icon]) => <button key={name} className={mode === name ? "active" : ""} onClick={() => setMode(name)}><b>{icon}</b><span><strong>{name}</strong><small>{description}</small></span><i>{mode === name ? "●" : "○"}</i></button>)}</div></div>
        <div className="builder-section"><div><h2>设置</h2></div><div className="vp-inline-settings"><label>时长<div className="segmented">{[[120, "2 小时"], [180, "3 小时"], [300, "5 小时"]].map(([value, label]) => <button type="button" key={value} className={duration === value ? "active" : ""} onClick={() => setDuration(Number(value))}>{label}</button>)}</div></label><label>题数<div className="counter"><button type="button" onClick={() => setCount(Math.max(5, count - 1))}>−</button><strong>{count}</strong><button type="button" onClick={() => setCount(Math.min(13, count + 1))}>＋</button></div></label><label>Rating<select value={targetRating} onChange={(event) => setTargetRating(Number(event.target.value))}>{[1200, 1400, 1600, 1800, 2000, 2200].map((value) => <option key={value}>{value}</option>)}</select></label><label>思维题<select value={thinkingRatio} disabled={mode !== "自由组卷"} onChange={(event) => setThinkingRatio(Number(event.target.value))}><option value={0.4}>40%</option><option value={0.6}>60%</option><option value={0.8}>80%</option></select></label></div></div>
        <div className="builder-section"><div><h2>参赛者</h2></div><div className="form-grid vp-participant-form"><label>Codeforces Handles<textarea value={participantText} onChange={(event) => setParticipantText(event.target.value)} placeholder="ShallowDream2, teammate" /></label><label>Seed<input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="自动生成" /></label></div></div>
      </div>
      <aside className="builder-summary"><h2>{mode}</h2><div className="summary-time"><b>{duration / 60}</b><span>小时</span><i>·</i><b>{count}</b><span>题</span></div><p className="builder-handle">{participants[0] || "未填写 Handle"}</p><button className="create-contest" onClick={() => void generateContest()} disabled={status === "loading"}>{status === "loading" ? "正在组卷…" : "生成比赛"}</button>{message ? <small className="summary-foot form-error">{message}</small> : null}</aside>
    </section>
  </AppShell>;
}
