"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";
import { archiveContests, archiveProblemHref, type ArchiveContest } from "../data/archive-contests";
import { loadPersistentJson, savePersistentJson } from "../lib/persistent-state";

type SprintState = { date: string; tasks: Record<string, boolean> };

const sprintContestIds = [
  "2025-shenyang",
  "2024-shenyang",
  "2025-chengdu",
  "2025-xian",
  "2025-wuhan",
  "2025-ecfinal",
  "2026-wuhan-invitational",
];
const sprintContests = sprintContestIds.map((id) => archiveContests.find((contest) => contest.id === id)).filter((contest): contest is ArchiveContest => Boolean(contest));
const tasks = [
  { id: "vp", label: "完成一场 5 小时实战 VP", detail: "题面、提交、原场榜单都留在平台" },
  { id: "review", label: "补完 2 道未通过题", detail: "记录错误原因与关键观察" },
  { id: "template", label: "复习 1 份常用模板", detail: "只保留赛场能直接使用的版本" },
];

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function isSprintState(value: unknown): value is SprintState {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<SprintState>;
  return typeof state.date === "string" && Boolean(state.tasks) && typeof state.tasks === "object";
}

export default function ShenyangSprintPage() {
  const today = dateKey();
  const [state, setState] = useState<SprintState>({ date: today, tasks: {} });
  const target = new Date("2026-07-31T09:00:00+08:00");
  const daysLeft = Math.max(0, Math.ceil((target.getTime() - Date.now()) / 86_400_000));
  const dailyContest = useMemo(() => sprintContests[Math.abs(new Date().getDate() - 15) % sprintContests.length] || sprintContests[0], []);
  const directProblems = useMemo(() => Array.from({ length: Math.min(6, dailyContest.problemCount) }, (_, index) => String.fromCharCode(65 + index)), [dailyContest]);
  const completed = tasks.filter((task) => state.tasks[task.id]).length;

  useEffect(() => {
    void loadPersistentJson<SprintState>("shenyang-sprint", "icpc-trainer-shenyang-sprint", { date: today, tasks: {} }, isSprintState).then((saved) => {
      setState(saved.date === today ? saved : { date: today, tasks: {} });
    });
  }, [today]);

  function toggleTask(id: string) {
    const next = { date: today, tasks: { ...state.tasks, [id]: !state.tasks[id] } };
    setState(next);
    void savePersistentJson("shenyang-sprint", "icpc-trainer-shenyang-sprint", next);
  }

  return <AppShell active="沈阳冲刺">
    <section className="sprint-hero">
      <div><span className="eyebrow"><span className="live-dot" /> JULY SPRINT</span><h1>沈阳邀请赛冲刺</h1><p>按 7 月底倒排训练：历届真题、准确题面、站内提交、真实榜单与赛后复盘。</p><div className="hero-actions"><Link className="button button-primary" href={`/vp/archive?contest=${dailyContest.id}`}><Icon name="play" /> 开始今日 5 小时 VP</Link><Link className="button button-ghost" href="/templates">赛前模板</Link></div></div>
      <div className="sprint-countdown"><small>距 7 月底</small><b>{daysLeft}</b><span>天</span><em>暂按 7 月 31 日倒排</em></div>
    </section>

    <section className="sprint-grid">
      <article className="panel sprint-today-card">
        <div className="panel-head"><div><h2>今日主练 · {dailyContest.city}</h2><p>{dailyContest.name}</p></div><Pill>5 小时</Pill></div>
        <div className="sprint-problem-strip">{directProblems.map((slot) => <Link key={slot} href={archiveProblemHref(dailyContest, slot)}><b>{slot}</b><span>开始做题</span></Link>)}</div>
        <Link className="sprint-enter-vp" href={`/vp/archive?contest=${dailyContest.id}`}><span><b>进入整场 VP</b><small>题目 · 实时榜单 · 队伍提交</small></span><strong>→</strong></Link>
      </article>

      <article className="panel sprint-checklist">
        <div className="panel-head"><div><h2>今日闭环</h2><p>{completed}/{tasks.length} 已完成</p></div><strong>{Math.round(completed / tasks.length * 100)}%</strong></div>
        {tasks.map((task) => <button type="button" className={state.tasks[task.id] ? "done" : ""} onClick={() => toggleTask(task.id)} key={task.id}><i>{state.tasks[task.id] ? "✓" : ""}</i><span><b>{task.label}</b><small>{task.detail}</small></span></button>)}
      </article>
    </section>

    <section className="panel sprint-contest-pool">
      <div className="panel-head"><div><h2>冲刺 VP 池</h2><p>沈阳历届优先，穿插近年区域赛与邀请赛</p></div><Link href="/vp/archive">全部赛事 →</Link></div>
      <div>{sprintContests.map((contest, index) => <Link href={`/vp/archive?contest=${contest.id}`} key={contest.id}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{contest.name}</b><small>{contest.year} · {contest.type} · {contest.problemCount} 题</small></div><em>{index < 2 ? "沈阳专项" : "强度补充"}</em><strong>开始 VP →</strong></Link>)}</div>
    </section>
  </AppShell>;
}
