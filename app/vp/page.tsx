"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AppShell, Icon } from "../components/AppShell";
import { apiJson } from "../lib/api-client";
import { readTrainerPreferences, saveTrainerPreferences, validCodeforcesHandle } from "../lib/preferences";
import { readStoredJson, removeStoredValue, writeStoredJson } from "../lib/storage";

type VpProblem = { slot: string; code: string; contestId: number; index: string; title: string; rating: number; tags: string[] };
type SourceContest = { contestId: number; problemCount: number; averageRating: number; url: string };
type ProblemStanding = { solved: boolean; wrongAttempts: number; solvedMinutes: number | null; penalty: number };
type StandingRow = { rank: number; handle: string; solved: number; penalty: number; problems: Record<string, ProblemStanding> };
type Standings = { updatedAt: string; rows: StandingRow[] };
type Contest = { id: string; handle: string; participants?: string[]; mode: string; seed: string; durationMinutes: number; targetRating: number; sourceContestId: number | null; sourceContests?: SourceContest[]; excludedSolved: number; createdAt: string; startedAt?: number; problems: VpProblem[]; standings?: Standings };

const STORAGE_KEY = "icpc-trainer-active-vp";
const modeOptions = [
  ["个性化组卷", "跨比赛按 Rating 形成难度梯度", "✦"],
  ["原场镜像", "完整复现一场历史比赛", "◫"],
  ["多场组合", "从 2–4 场历史比赛组合", "⊞"],
];

function isContest(value: unknown): value is Contest {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Contest>;
  return typeof item.id === "string" && typeof item.handle === "string" && validCodeforcesHandle(item.handle)
    && Number.isFinite(item.durationMinutes) && Number(item.durationMinutes) >= 60 && Number(item.durationMinutes) <= 600
    && Array.isArray(item.problems) && item.problems.length >= 5 && item.problems.length <= 20
    && item.problems.every((problem) => Number.isInteger(problem?.contestId) && /^[A-Z][0-9]?$/.test(String(problem?.index || "")));
}

export default function VpPage() {
  const [mode, setMode] = useState("个性化组卷");
  const [duration, setDuration] = useState(180);
  const [count, setCount] = useState(10);
  const [targetRating, setTargetRating] = useState(1600);
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
    const timer = window.setInterval(() => {
      if (Date.now() < contest.startedAt! + contest.durationMinutes * 60_000) void syncStandings(true);
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [contest?.id, contest?.startedAt]); // eslint-disable-line react-hooks/exhaustive-deps

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
      const data = await apiJson<Contest>("/vp/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participants, handle: participants[0], mode, count, targetRating, durationMinutes: duration, seed: seed || undefined }), signal: controller.signal }, 30_000);
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
    save({ ...contest, startedAt: Date.now() });
    setNow(Date.now());
  }

  async function syncStandings(silent = false) {
    if (!contest?.startedAt) return;
    standingsRequest.current?.abort();
    const controller = new AbortController();
    standingsRequest.current = controller;
    if (!silent) setStatus("syncing");
    try {
      const data = await apiJson<Standings>("/vp/standings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participants: contest.participants?.length ? contest.participants : [contest.handle], startedAt: contest.startedAt, durationMinutes: contest.durationMinutes, problems: contest.problems.map(({ contestId, index }) => ({ contestId, index })) }), signal: controller.signal }, 45_000);
      if (!Array.isArray(data.rows)) throw new Error("榜单服务返回了无效数据");
      save({ ...contest, standings: data });
      setMessage(`榜单更新于 ${new Date(data.updatedAt).toLocaleTimeString("zh-CN")}`);
      setStatus("idle");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!silent) { setMessage(error instanceof Error ? error.message : "榜单同步失败"); setStatus("error"); }
      else setMessage("自动刷新失败，已保留上次榜单；可点击“立即刷新榜单”重试");
    }
  }

  if (contest) {
    const rows: StandingRow[] = contest.standings?.rows ?? (contest.participants ?? [contest.handle]).map((handle, index) => ({ rank: index + 1, handle, solved: 0, penalty: 0, problems: {} as Record<string, ProblemStanding> }));
    return <AppShell active="模拟赛">
      <section className="contest-room-head">
        <div><span className="eyebrow"><span className="live-dot" /> {contest.startedAt ? "实时比赛" : "比赛已生成"}</span><h1>{contest.mode} · {contest.problems.length} 题</h1><p>{(contest.participants ?? [contest.handle]).join(" / ")} · Seed <code>{contest.seed}</code> · 已排除 {contest.excludedSolved} 道历史 AC</p></div>
        <div className="contest-clock"><small>{contest.startedAt ? "剩余时间" : "比赛时长"}</small><b>{timeLabel}</b><span>{rows[0]?.solved ?? 0} AC · {rows.length} 位参赛者</span></div>
      </section>
      <section className="contest-actions">
        {!contest.startedAt ? <button className="button button-primary" onClick={startContest}><Icon name="play" /> 开始比赛</button> : <button className="button button-primary" onClick={() => void syncStandings(false)} disabled={status === "syncing"}><Icon name="history" /> {status === "syncing" ? "同步中…" : "立即刷新榜单"}</button>}
        <button className="button button-ghost" onClick={() => save(null)}>结束并重新组卷</button>
        {message ? <span className={status === "error" ? "form-error" : ""}>{message}</span> : null}
      </section>
      {contest.startedAt && contest.sourceContests?.length ? <section className="contest-sources"><span>来源参考</span>{contest.sourceContests.map((source) => <a key={source.contestId} href={source.url} target="_blank" rel="noreferrer">CF {source.contestId} · {source.problemCount} 题 · 均分 {source.averageRating} ↗</a>)}</section> : null}
      <section className="contest-live-layout">
        <div className="contest-problem-grid">{contest.problems.map((problem) => {
          const leaderState = rows[0]?.problems?.[`${problem.contestId}${problem.index}`];
          return <article className={`contest-problem-card ${leaderState?.solved ? "accepted" : ""}`} key={problem.code}><span>{problem.slot}</span><div><small>{contest.startedAt ? problem.code : "START 后显示来源"}</small><h2>{contest.startedAt ? problem.title : `Problem ${problem.slot}`}</h2>{contest.startedAt ? <p>{problem.rating} · {problem.tags.slice(0, 3).join(" / ")}</p> : null}</div><strong>{leaderState?.solved ? `+${leaderState.wrongAttempts}` : leaderState?.wrongAttempts ? `-${leaderState.wrongAttempts}` : "—"}</strong>{contest.startedAt ? <a href={`/problem/${problem.contestId}${problem.index}`}>打开 →</a> : null}</article>;
        })}</div>
        <article className="panel live-standings"><div className="panel-head"><div><h2>实时榜单</h2><p>每 30 秒读取 Codeforces 公开提交</p></div><span className="live-dot" /></div><div className="standings-table"><div className="standings-row standings-header"><span>#</span><span>参赛者</span><span>AC</span><span>罚时</span>{contest.problems.map((problem) => <span key={problem.code}>{problem.slot}</span>)}</div>{rows.map((row) => <div className="standings-row" key={row.handle}><strong>{row.rank}</strong><b>{row.handle}</b><strong>{row.solved}</strong><span>{row.penalty}</span>{contest.problems.map((problem) => { const state = row.problems?.[`${problem.contestId}${problem.index}`]; return <span className={state?.solved ? "solved" : state?.wrongAttempts ? "attempted" : ""} key={problem.code}>{state?.solved ? `+${state.wrongAttempts || ""}` : state?.wrongAttempts ? `-${state.wrongAttempts}` : "·"}</span>; })}</div>)}</div></article>
      </section>
    </AppShell>;
  }

  return <AppShell active="模拟赛">
    <section className="vp-builder-head"><div><h1>创建 VP</h1><p>常规组卷用于 Codeforces 训练；历届补题可按原场时间轴重放 ICPC 真实榜单。</p></div><div><b>{duration / 60}h</b><span>{count} 题</span><span>{participants.length || 0} 人</span></div></section>
    <Link className="archive-vp-entry" href="/vp/archive"><span>ICPC</span><div><small>新增模式</small><h2>历届补题 · 跟原场榜走</h2><p>2026 / 2025 / 2024 邀请赛、区域赛与 EC-Final；真实队伍和逐提交时间线同步重放。</p></div><b>选择赛事 →</b></Link>
    <section className="vp-builder simplified-vp-builder">
      <div className="builder-main">
        <div className="builder-section"><div><h2>比赛模式</h2><p>不同模式都会排除主 Handle 已 AC 的题目。</p></div><div className="mode-grid three-modes">{modeOptions.map(([name, description, icon]) => <button key={name} className={mode === name ? "active" : ""} onClick={() => setMode(name)}><b>{icon}</b><span><strong>{name}</strong><small>{description}</small></span><i>{mode === name ? "●" : "○"}</i></button>)}</div></div>
        <div className="builder-section"><div><h2>规模与难度</h2><p>原场镜像会优先匹配接近题量和目标 Rating 的历史比赛。</p></div><div className="vp-inline-settings"><label>比赛时长<div className="segmented">{[[120, "2 小时"], [180, "3 小时"], [300, "5 小时"]].map(([value, label]) => <button type="button" key={value} className={duration === value ? "active" : ""} onClick={() => setDuration(Number(value))}>{label}</button>)}</div></label><label>题目数量<div className="counter"><button type="button" onClick={() => setCount(Math.max(5, count - 1))}>−</button><strong>{count}</strong><button type="button" onClick={() => setCount(Math.min(13, count + 1))}>＋</button></div></label><label>目标 Rating<select value={targetRating} onChange={(event) => setTargetRating(Number(event.target.value))}>{[1200, 1400, 1600, 1800, 2000, 2200].map((value) => <option key={value}>{value}</option>)}</select></label></div></div>
        <div className="builder-section"><div><h2>参赛者与复现</h2><p>第一位 Handle 用于排除已完成题目；所有 Handle 都会进入实时榜单。</p></div><div className="form-grid vp-participant-form"><label>Codeforces Handles（逗号分隔）<textarea value={participantText} onChange={(event) => setParticipantText(event.target.value)} placeholder="ShallowDream2, teammate" /></label><label>随机 Seed（可留空）<input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="自动生成" /></label></div></div>
      </div>
      <aside className="builder-summary"><h2>{mode}</h2><div className="summary-time"><b>{duration / 60}</b><span>小时</span><i>·</i><b>{count}</b><span>题</span></div><div className="difficulty-curve">{Array.from({ length: Math.min(10, count) }, (_, index) => <i key={index} style={{ height: `${25 + index * 7}%` }}><span>{String.fromCharCode(65 + index)}</span></i>)}</div><div className="summary-list"><p><Icon name="check" /> 主账号：{participants[0] || "未填写"}</p><p><Icon name="check" /> {participants.length} 位参赛者进入实时榜单</p><p><Icon name="check" /> 20 分钟错误罚时</p><p><Icon name="check" /> 提供历史比赛来源参考</p></div><button className="create-contest" onClick={() => void generateContest()} disabled={status === "loading"}>{status === "loading" ? "正在同步并组卷…" : "生成比赛 →"}</button>{message ? <small className="summary-foot form-error">{message}</small> : null}</aside>
    </section>
  </AppShell>;
}
