"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, Icon } from "../components/AppShell";
import { browserApiUrl } from "../lib/browser-api";

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

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) try { setContest(JSON.parse(saved)); } catch { localStorage.removeItem(STORAGE_KEY); }
  }, []);
  useEffect(() => {
    if (!contest?.startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [contest?.startedAt]);
  useEffect(() => {
    if (!contest?.startedAt) return;
    void syncStandings(true);
    const timer = window.setInterval(() => void syncStandings(true), 30_000);
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
    if (next) localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); else localStorage.removeItem(STORAGE_KEY);
  }

  async function generateContest() {
    if (!participants.length) { setStatus("error"); setMessage("至少输入一个 Codeforces Handle"); return; }
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch(browserApiUrl("/vp/generate"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participants, handle: participants[0], mode, count, targetRating, durationMinutes: duration, seed: seed || undefined }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "组卷失败");
      save(data);
      setSeed(data.seed);
      setStatus("idle");
    } catch (error) {
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
    if (!silent) setStatus("syncing");
    try {
      const response = await fetch(browserApiUrl("/vp/standings"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ participants: contest.participants?.length ? contest.participants : [contest.handle], startedAt: contest.startedAt, durationMinutes: contest.durationMinutes, problems: contest.problems.map(({ contestId, index }) => ({ contestId, index })) }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "榜单同步失败");
      save({ ...contest, standings: data });
      setMessage(`榜单更新于 ${new Date(data.updatedAt).toLocaleTimeString("zh-CN")}`);
      setStatus("idle");
    } catch (error) {
      if (!silent) { setMessage(error instanceof Error ? error.message : "榜单同步失败"); setStatus("error"); }
    }
  }

  if (contest) {
    const rows = contest.standings?.rows ?? (contest.participants ?? [contest.handle]).map((handle, index) => ({ rank: index + 1, handle, solved: 0, penalty: 0, problems: {} }));
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
    <section className="vp-builder-head"><div><h1>创建 VP</h1><p>支持个性化组卷、原场镜像和多场组合；比赛开始后自动生成多人实时榜单。</p></div><div><b>{duration / 60}h</b><span>{count} 题</span><span>{participants.length || 0} 人</span></div></section>
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
