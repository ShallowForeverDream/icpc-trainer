"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";
import {
  archiveContestIntegrated,
  archiveContests,
  archiveProblemHref,
  type ArchiveContest,
} from "../data/archive-contests";
import { loadArchivePrewarm, startArchivePrewarm, type ArchivePrewarmProgress } from "../lib/archive-statement-client";
import {
  ARCHIVE_SESSION_EVENT,
  ARCHIVE_SESSION_KEY,
  isArchiveVpSession,
  type ArchiveVpSession,
} from "../lib/archive-vp-session";
import { loadPersistentJson, savePersistentJson } from "../lib/persistent-state";
import {
  loadPlatformSubmissions,
  subscribePlatformSubmissions,
  type PlatformSubmission,
} from "../lib/platform-submissions";
import { readStoredJson } from "../lib/storage";

type SprintPlan = {
  date: string;
  contestId: string;
  slots: string[];
  reflection: string;
};

type ProblemProgress = "accepted" | "judging" | "attempted" | "blocked" | "new";

const SPRINT_STATE_KEY = "shenyang-sprint";
const SPRINT_LOCAL_KEY = "icpc-trainer-shenyang-sprint";
const sprintContestIds = [
  "2025-shenyang",
  "2024-shenyang",
  "2023-shenyang",
  "2022-shenyang",
  "2025-chengdu",
  "2025-nanjing",
  "2025-wuhan",
  "2025-xian",
  "2025-ecfinal",
  "2026-wuhan-invitational",
];
const sprintContests = sprintContestIds
  .map((id) => archiveContests.find((contest) => contest.id === id))
  .filter((contest): contest is ArchiveContest => Boolean(contest && archiveContestIntegrated(contest)));
const contestCycle = ["2025-shenyang", "2024-shenyang", "2023-shenyang", "2025-shenyang", "2022-shenyang", "2025-chengdu", "2024-shenyang", "2025-nanjing"];

function dateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dayNumber(value: string) {
  return Math.floor(new Date(`${value}T00:00:00+08:00`).getTime() / 86_400_000);
}

function planForDate(date: string): SprintPlan {
  const start = dayNumber("2026-07-15");
  const index = Math.max(0, dayNumber(date) - start);
  const requestedId = contestCycle[index % contestCycle.length];
  const contest = sprintContests.find((item) => item.id === requestedId) || sprintContests[0];
  const size = Math.min(6, contest.problemCount);
  const round = Math.floor(index / contestCycle.length);
  const offset = (round * size) % contest.problemCount;
  const slots = Array.from({ length: size }, (_, item) => String.fromCharCode(65 + (offset + item) % contest.problemCount));
  return { date, contestId: contest.id, slots, reflection: "" };
}

function isSprintPlan(value: unknown): value is SprintPlan {
  if (!value || typeof value !== "object") return false;
  const plan = value as Partial<SprintPlan>;
  const contest = typeof plan.contestId === "string" ? sprintContests.find((item) => item.id === plan.contestId) : undefined;
  return /^\d{4}-\d{2}-\d{2}$/.test(plan.date || "")
    && Boolean(contest)
    && Array.isArray(plan.slots)
    && plan.slots.length > 0
    && plan.slots.length <= 8
    && plan.slots.every((slot) => typeof slot === "string" && /^[A-Z]$/.test(slot) && slot.charCodeAt(0) - 65 < (contest?.problemCount || 0))
    && typeof plan.reflection === "string"
    && plan.reflection.length <= 2000;
}

function progressFor(contestId: string, slot: string, submissions: PlatformSubmission[], session: ArchiveVpSession | null): ProblemProgress {
  if (session?.contestId === contestId && session.attempts[slot]?.solvedAt !== undefined) return "accepted";
  const rows = submissions.filter((item) => item.archiveContestId === contestId && item.slot === slot);
  if (rows.some((item) => item.status === "accepted" || item.verdict === "AC")) return "accepted";
  if (rows.some((item) => item.status === "queued" || item.status === "submitted")) return "judging";
  if (rows.some((item) => item.status === "needs_login" || item.status === "failed")) return "blocked";
  if (rows.some((item) => item.status === "rejected" || item.verdict === "WA") || (session?.contestId === contestId && (session.attempts[slot]?.wrong || 0) > 0)) return "attempted";
  return "new";
}

function progressText(progress: ProblemProgress) {
  if (progress === "accepted") return "已 AC";
  if (progress === "judging") return "评测中";
  if (progress === "attempted") return "待补题";
  if (progress === "blocked") return "提交需处理";
  return "未开始";
}

export default function ShenyangSprintPage() {
  const today = dateKey();
  const defaultPlan = useMemo(() => planForDate(today), [today]);
  const [plan, setPlan] = useState<SprintPlan>(defaultPlan);
  const [submissions, setSubmissions] = useState<PlatformSubmission[]>([]);
  const [session, setSession] = useState<ArchiveVpSession | null>(null);
  const [prewarm, setPrewarm] = useState<ArchivePrewarmProgress | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const target = new Date("2026-07-31T09:00:00+08:00");
  const daysLeft = Math.max(0, Math.ceil((target.getTime() - Date.now()) / 86_400_000));
  const contest = sprintContests.find((item) => item.id === plan.contestId) || sprintContests[0];

  useEffect(() => {
    void loadPersistentJson<SprintPlan>(SPRINT_STATE_KEY, SPRINT_LOCAL_KEY, defaultPlan, isSprintPlan).then((saved) => {
      const next = saved.date === today ? saved : defaultPlan;
      setPlan(next);
      void savePersistentJson(SPRINT_STATE_KEY, SPRINT_LOCAL_KEY, next);
    });

    const localSession = readStoredJson<ArchiveVpSession | null>(ARCHIVE_SESSION_KEY, null, (value): value is ArchiveVpSession | null => value === null || isArchiveVpSession(value));
    setSession(localSession);
    void loadPersistentJson<ArchiveVpSession | null>("archive-vp", ARCHIVE_SESSION_KEY, localSession, (value): value is ArchiveVpSession | null => value === null || isArchiveVpSession(value)).then(setSession);

    void loadPlatformSubmissions().then(setSubmissions);
    const unsubscribe = subscribePlatformSubmissions(setSubmissions);
    const receiveSession = (event: Event) => {
      const next = (event as CustomEvent<ArchiveVpSession>).detail;
      if (isArchiveVpSession(next)) setSession(next);
    };
    window.addEventListener(ARCHIVE_SESSION_EVENT, receiveSession);
    return () => {
      unsubscribe();
      window.removeEventListener(ARCHIVE_SESSION_EVENT, receiveSession);
    };
  }, [defaultPlan, today]);

  useEffect(() => {
    if (!contest.qojContestId || !contest.qojProblemIds?.length) {
      setPrewarm(null);
      return;
    }
    let active = true;
    const request = {
      contestId: contest.id,
      contestName: contest.name,
      problems: contest.qojProblemIds.slice(0, contest.problemCount).map((problemId, index) => ({
        slot: String.fromCharCode(65 + index),
        qojContestId: contest.qojContestId as number,
        problemId,
        gymId: contest.gymId,
        title: contest.problemTitles?.[index] || `Problem ${String.fromCharCode(65 + index)}`,
      })),
    };
    const sync = async (start = false) => {
      try {
        const next = start ? await startArchivePrewarm(request) : await loadArchivePrewarm(contest.id);
        if (active) setPrewarm(next);
      } catch { /* Older backends still allow each statement to import on first open. */ }
    };
    void sync(true);
    const timer = window.setInterval(() => void sync(false), 12_000);
    return () => { active = false; window.clearInterval(timer); };
  }, [contest]);

  const problemRows = useMemo(() => plan.slots.map((slot) => {
    const progress = progressFor(contest.id, slot, submissions, session);
    const latest = submissions.find((item) => item.archiveContestId === contest.id && item.slot === slot);
    const index = slot.charCodeAt(0) - 65;
    return {
      slot,
      progress,
      latest,
      title: contest.problemTitles?.[index] || `${contest.year} ${contest.city} · Problem ${slot}`,
      href: archiveProblemHref(contest, slot),
    };
  }), [contest, plan.slots, session, submissions]);
  const accepted = problemRows.filter((item) => item.progress === "accepted").length;
  const attempted = problemRows.filter((item) => item.progress === "attempted" || item.progress === "blocked").length;
  const nextProblem = problemRows.find((item) => item.progress !== "accepted") || problemRows[0];
  const vpStartedToday = Boolean(session?.contestId === contest.id && session.startedAt && dateKey(new Date(session.startedAt)) === today);
  const reviewRows = submissions
    .filter((item) => item.archiveContestId === contest.id && plan.slots.includes(item.slot || "") && ["rejected", "failed", "needs_login"].includes(item.status))
    .filter((item, index, rows) => rows.findIndex((candidate) => candidate.slot === item.slot) === index)
    .slice(0, 4);
  const completedSteps = Number(vpStartedToday) + Number(accepted === plan.slots.length) + Number(Boolean(plan.reflection.trim()));

  async function saveReflection() {
    setSaveState("saving");
    const ok = await savePersistentJson(SPRINT_STATE_KEY, SPRINT_LOCAL_KEY, plan);
    setSaveState(ok ? "saved" : "error");
  }

  return <AppShell active="沈阳冲刺">
    <section className="sprint-hero sprint-command-hero">
      <div>
        <span className="eyebrow"><span className="live-dot" /> SHENYANG SPRINT</span>
        <h1>沈阳邀请赛冲刺</h1>
        <p>今日题目、中文题面、代码提交、评测记录、VP 榜单与复盘全部在本站完成。</p>
        <div className="hero-actions">
          <Link className="button button-primary" href={nextProblem.href}><Icon name="play" /> {accepted ? "继续今日计划" : "开始今日训练"}</Link>
          <Link className="button button-ghost" href={`/vp/archive?contest=${contest.id}`}><Icon name="trophy" /> 进入整场 VP</Link>
        </div>
      </div>
      <div className="sprint-countdown"><small>距 7 月底</small><b>{daysLeft}</b><span>天</span><em>{accepted}/{plan.slots.length} 题已 AC</em></div>
    </section>

    <div className="sprint-loop-bar" aria-label="站内训练闭环">
      {["题面", "准确中文", "提交", "评测记录", "VP 榜单", "复盘"].map((label, index) => <span key={label}><i>{index + 1}</i>{label}</span>)}
    </div>

    <section className="sprint-grid sprint-work-grid">
      <article className="panel sprint-today-card sprint-plan-card">
        <div className="panel-head">
          <div><h2>今日计划 · {contest.city}</h2><p>{contest.name}</p></div>
          <div className="sprint-plan-meta"><Pill>{accepted}/{plan.slots.length} AC</Pill>{prewarm ? <small>{prewarm.readyChinese}/{prewarm.total} 中文就绪</small> : <small>首次打开自动导入</small>}</div>
        </div>
        <div className="sprint-problem-list">
          {problemRows.map((item) => <article className={`sprint-problem-row ${item.progress}`} key={item.slot}>
            <Link href={item.href} className="sprint-problem-main"><span>{item.slot}</span><div><b>{item.title}</b><small>站内题面 · 中文切换 · 直接提交</small></div></Link>
            <strong>{progressText(item.progress)}</strong>
            <div>{item.latest ? <Link href={`/submissions/${item.latest.requestId}`}>提交记录</Link> : null}<Link href={item.href}>{item.progress === "accepted" ? "查看题面" : "开始做题"} →</Link></div>
          </article>)}
        </div>
        <Link className="sprint-enter-vp" href={`/vp/archive?contest=${contest.id}`}><span><b>{vpStartedToday ? "继续今日整场 VP" : "开启 5 小时整场 VP"}</b><small>题目列表 · 原场实时榜单 · 队伍提交</small></span><strong>→</strong></Link>
      </article>

      <aside className="sprint-side-stack">
        <article className="panel sprint-auto-progress">
          <div className="panel-head"><div><h2>今日闭环</h2><p>由平台自动记录</p></div><strong>{completedSteps}/3</strong></div>
          <div><span className={vpStartedToday ? "done" : ""}><i>{vpStartedToday ? "✓" : "1"}</i><b>实战 VP</b><small>{vpStartedToday ? "已开始" : "待开始"}</small></span><span className={accepted === plan.slots.length ? "done" : ""}><i>{accepted === plan.slots.length ? "✓" : "2"}</i><b>完成计划题</b><small>{accepted}/{plan.slots.length} AC</small></span><span className={plan.reflection.trim() ? "done" : ""}><i>{plan.reflection.trim() ? "✓" : "3"}</i><b>赛后复盘</b><small>{plan.reflection.trim() ? "已保存" : "待记录"}</small></span></div>
        </article>

        <article className="panel sprint-review-card">
          <div className="panel-head"><div><h2>今日复盘</h2><p>{attempted ? `${attempted} 题需要回看` : "写下一个关键失误"}</p></div></div>
          {reviewRows.length ? <div className="sprint-review-links">{reviewRows.map((item) => <Link href={`/submissions/${item.requestId}`} key={item.requestId}><b>{item.slot} · {item.verdict || progressText(item.status === "rejected" ? "attempted" : "blocked")}</b><span>查看代码与评测记录 →</span></Link>)}</div> : null}
          <textarea value={plan.reflection} maxLength={2000} onChange={(event) => { setPlan({ ...plan, reflection: event.target.value }); setSaveState("idle"); }} placeholder="例：D 题漏看单调性；下次先写出状态转移再动手。" aria-label="今日复盘内容" />
          <div className="sprint-review-actions"><span>{saveState === "saving" ? "正在保存…" : saveState === "saved" ? "已保存到账号" : saveState === "error" ? "保存失败，请重试" : ""}</span><button type="button" onClick={saveReflection}>保存复盘</button></div>
        </article>
      </aside>
    </section>

    <section className="panel sprint-contest-pool">
      <div className="panel-head"><div><h2>下一场训练</h2><p>沈阳专项优先，穿插同强度区域赛</p></div><Link href="/vp/archive">全部赛事 →</Link></div>
      <div>{sprintContests.map((item, index) => {
        const solved = new Set(submissions.filter((submission) => submission.archiveContestId === item.id && (submission.status === "accepted" || submission.verdict === "AC")).map((submission) => submission.slot)).size;
        return <Link href={`/vp/archive?contest=${item.id}`} key={item.id}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{item.name}</b><small>{item.problemCount} 题 · 已 AC {solved}</small></div><em>{item.city === "沈阳" ? "沈阳专项" : "强度补充"}</em><strong>{solved ? "继续 VP →" : "开始 VP →"}</strong></Link>;
      })}</div>
    </section>
  </AppShell>;
}
