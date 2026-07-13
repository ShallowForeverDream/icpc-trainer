"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";
import { browserApiUrl } from "../lib/browser-api";

type VpProblem = { slot: string; code: string; contestId: number; index: string; title: string; rating: number; tags: string[] };
type Contest = { id: string; handle: string; mode: string; seed: string; durationMinutes: number; targetRating: number; sourceContestId: number | null; excludedSolved: number; createdAt: string; startedAt?: number; problems: VpProblem[]; accepted?: string[] };

const STORAGE_KEY = "icpc-trainer-active-vp";

export default function VpPage() {
  const [mode, setMode] = useState("随机组卷");
  const [duration, setDuration] = useState(180);
  const [count, setCount] = useState(10);
  const [targetRating, setTargetRating] = useState(1600);
  const [handle, setHandle] = useState("ShallowDream2");
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
    setStatus("loading");
    setMessage("");
    try {
      const response = await fetch(browserApiUrl("/vp/generate"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ handle, mode, count, targetRating, durationMinutes: duration, seed: seed || undefined }) });
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
    save({ ...contest, startedAt: Date.now(), accepted: [] });
    setNow(Date.now());
  }

  async function syncVerdicts() {
    if (!contest) return;
    setStatus("syncing");
    try {
      const response = await fetch(browserApiUrl(`/codeforces/submissions?handle=${encodeURIComponent(contest.handle)}`), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "同步失败");
      const accepted = new Set<string>(contest.accepted ?? []);
      for (const submission of data.submissions) if (submission.verdict === "OK" && contest.problems.some((problem) => problem.code === submission.code)) accepted.add(submission.code);
      save({ ...contest, accepted: [...accepted] });
      setMessage(`已检查最近提交，当前 AC ${accepted.size} 题`);
      setStatus("idle");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "同步失败");
      setStatus("error");
    }
  }

  if (contest) return <AppShell active="模拟赛">
    <section className="contest-room-head">
      <div><span className="eyebrow"><span className="live-dot" /> {contest.startedAt ? "CONTEST RUNNING" : "CONTEST READY"}</span><h1>{contest.mode} · {contest.problems.length} 题</h1><p>绑定 {contest.handle} · Seed <code>{contest.seed}</code> · 已排除 {contest.excludedSolved} 道历史 AC</p></div>
      <div className="contest-clock"><small>{contest.startedAt ? "剩余时间" : "比赛时长"}</small><b>{timeLabel}</b><span>{contest.accepted?.length ?? 0} / {contest.problems.length} AC</span></div>
    </section>
    <section className="contest-actions">
      {!contest.startedAt ? <button className="button button-primary" onClick={startContest}><Icon name="play" /> 开始比赛</button> : <button className="button button-primary" onClick={syncVerdicts} disabled={status === "syncing"}><Icon name="history" /> {status === "syncing" ? "检查中…" : "同步 Codeforces 判题"}</button>}
      <button className="button button-ghost" onClick={() => save(null)}>结束并重新组卷</button>
      {message && <span className={status === "error" ? "form-error" : ""}>{message}</span>}
    </section>
    <section className="contest-problem-grid">
      {contest.problems.map((problem) => {
        const accepted = contest.accepted?.includes(problem.code);
        return <article className={`contest-problem-card ${accepted ? "accepted" : ""}`} key={problem.code}><span>{problem.slot}</span><div><small>{contest.startedAt ? problem.code : "SOURCE HIDDEN UNTIL START"}</small><h2>{contest.startedAt ? problem.title : `Problem ${problem.slot}`}</h2>{contest.startedAt && <p>{problem.rating} · {problem.tags.slice(0, 3).join(" / ")}</p>}</div><strong>{accepted ? "AC" : "—"}</strong>{contest.startedAt && <a href={`/problem/${problem.contestId}${problem.index}`}>打开题目 →</a>}</article>;
      })}
    </section>
  </AppShell>;

  return <AppShell active="模拟赛">
    <section className="vp-hero"><div><span className="eyebrow"><span className="live-dot" /> REAL CODEFORCES POOL</span><h1>生成一场真正可做的 VP。</h1><p>实时读取 Codeforces 题库，排除 ShallowDream2 已 AC 的题目，并保存可复现随机种子。</p></div><div className="vp-rules"><span><b>−20</b>错误罚时</span><span><b>1h</b>最后封榜</span><span><b>0</b>重复题</span></div></section>
    <section className="vp-builder">
      <div className="builder-main">
        <div className="section-number"><span>01</span><div><h2>选择比赛模式</h2><p>随机组卷建立难度梯度，原场镜像选择一场真实历史比赛。</p></div></div>
        <div className="mode-grid">{[["随机组卷", "跨比赛按 Rating 生成", "✦"], ["原场镜像", "选择完整历史比赛", "◫"]].map(([name, desc, icon]) => <button key={name} className={mode === name ? "active" : ""} onClick={() => setMode(name)}><b>{icon}</b><span><strong>{name}</strong><small>{desc}</small></span><i>{mode === name ? "●" : "○"}</i></button>)}</div>
        <div className="section-number"><span>02</span><div><h2>比赛规模</h2><p>原场镜像会尽量选择题量接近的比赛。</p></div></div>
        <div className="setting-row"><label>比赛时长</label><div className="segmented">{[[120, "2 小时"], [180, "3 小时"], [300, "5 小时"]].map(([value, label]) => <button key={value} className={duration === value ? "active" : ""} onClick={() => setDuration(Number(value))}>{label}</button>)}</div></div>
        <div className="setting-row"><label>题目数量</label><div className="counter"><button onClick={() => setCount(Math.max(8, count - 1))}>−</button><strong>{count}</strong><button onClick={() => setCount(Math.min(13, count + 1))}>＋</button><span>8–13 道</span></div></div>
        <div className="section-number"><span>03</span><div><h2>题池与复现</h2><p>Handle 用于排除已 AC；同一 Seed 和条件可复现同一场比赛。</p></div></div>
        <div className="form-grid"><label>Codeforces Handle<input value={handle} onChange={(event) => setHandle(event.target.value)} /></label><label>目标 Rating<select value={targetRating} onChange={(event) => setTargetRating(Number(event.target.value))}>{[1200, 1400, 1600, 1800, 2000, 2200].map((value) => <option key={value}>{value}</option>)}</select></label><label>随机 Seed（可留空）<input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="自动生成" /></label><label>题目来源<select><option>Codeforces 公开题库</option></select></label></div>
      </div>
      <aside className="builder-summary"><span className="micro-label">CONTEST PREVIEW</span><h2>{mode}</h2><div className="summary-time"><b>{duration / 60}</b><span>小时</span><i>·</i><b>{count}</b><span>题</span></div><div className="difficulty-curve">{Array.from({ length: Math.min(10, count) }, (_, index) => <i key={index} style={{ height: `${25 + index * 7}%` }}><span>{String.fromCharCode(65 + index)}</span></i>)}</div><div className="summary-list"><p><Icon name="check" /> 排除 {handle || "绑定账号"} 最近 1000 条提交中的 AC</p><p><Icon name="check" /> 排除交互题与无 Rating 题目</p><p><Icon name="check" /> 保存随机种子和本机比赛进度</p><p><Icon name="check" /> 可同步 Codeforces 判题结果</p></div><div className="assurance"><Pill>LIVE POOL</Pill><span>生成时读取官方公开 API</span></div><button className="create-contest" onClick={generateContest} disabled={status === "loading"}>{status === "loading" ? "正在同步题库并组卷…" : "生成比赛 →"}</button>{message && <small className="summary-foot form-error">{message}</small>}</aside>
    </section>
  </AppShell>;
}
