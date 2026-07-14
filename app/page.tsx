"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AppShell, Icon, ProblemRow } from "./components/AppShell";
import { archiveContests } from "./data/archive-contests";
import { internationalContests } from "./data/international-contests";
import { apiJson } from "./lib/api-client";
import { readTrainerPreferences, saveTrainerPreferences, syncTrainerPreferences } from "./lib/preferences";
import { loadPersistentJson, savePersistentJson } from "./lib/persistent-state";
import { readStoredJson } from "./lib/storage";
import { getTrainingClientId, loadTrainingSummary, type TrainingSummary } from "./lib/training-client";

type Recommendation = { code: string; title: string; titleZh?: string; rating: number; tags: string[]; reason?: string };
type Submission = { id: number; createdAt: string; code: string; title: string; verdict: string };

const fallbackRecommendations: Recommendation[] = [
  { code: "CF 1967B1", title: "Reverse Card (Easy Version)", rating: 1400, tags: ["math", "number theory"], reason: "接近当前目标 Rating" },
  { code: "CF 1920C", title: "Partitioning the Array", rating: 1600, tags: ["math", "brute force"], reason: "数学与枚举延伸训练" },
  { code: "CF 1904C", title: "Array Game", rating: 1400, tags: ["greedy", "sortings"], reason: "贪心与排序巩固" },
  { code: "CF 1791F", title: "Range Update Point Query", rating: 1600, tags: ["data structures", "dsu"], reason: "数据结构专项" },
];

const archiveYears = [2026, 2025, 2024] as const;
const internationalYears = [2025, 2024] as const;

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export default function Home() {
  const [handle, setHandle] = useState("ShallowDream2");
  const [goal, setGoal] = useState(4);
  const [manualActivity, setManualActivity] = useState<Record<string, number>>({});
  const [remoteActivity, setRemoteActivity] = useState<Record<string, number>>({});
  const [trainingActivity, setTrainingActivity] = useState<Record<string, number>>({});
  const [trainingSummary, setTrainingSummary] = useState<TrainingSummary | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>(fallbackRecommendations);
  const [batch, setBatch] = useState(0);
  const [syncing, setSyncing] = useState(true);
  const [syncError, setSyncError] = useState("");
  const today = dateKey(new Date());
  const days = useMemo(() => Array.from({ length: 84 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - 83 + index); return dateKey(date); }), []);

  useEffect(() => {
    const preferences = readTrainerPreferences();
    setHandle(preferences.codeforcesHandle);
    setGoal(preferences.dailyGoal);
    void syncTrainerPreferences().then((remote) => { setHandle(remote.codeforcesHandle); setGoal(remote.dailyGoal); });
    const saved = readStoredJson<{ activity?: Record<string, number> }>("icpc-trainer-dashboard", {});
    if (saved.activity && typeof saved.activity === "object") {
      setManualActivity(Object.fromEntries(Object.entries(saved.activity).filter(([key, value]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isInteger(value) && value >= 0 && value <= 100)));
    }
    void loadPersistentJson<{ activity?: Record<string, number> }>("dashboard", "icpc-trainer-dashboard", saved).then((remote) => {
      if (remote.activity && typeof remote.activity === "object") setManualActivity(Object.fromEntries(Object.entries(remote.activity).filter(([key, value]) => /^\d{4}-\d{2}-\d{2}$/.test(key) && Number.isInteger(value) && value >= 0 && value <= 100)));
    });
    const clientId = getTrainingClientId();
    const controller = new AbortController();
    Promise.allSettled([
      apiJson<{ submissions?: Submission[] }>(`/codeforces/submissions?handle=${encodeURIComponent(preferences.codeforcesHandle)}`, { cache: "no-store", signal: controller.signal }),
      apiJson<{ problems?: Recommendation[] }>(`/codeforces/recommendations?handle=${encodeURIComponent(preferences.codeforcesHandle)}&min=800&max=1600&limit=12&mode=balanced&clientId=${encodeURIComponent(clientId)}`, { cache: "no-store", signal: controller.signal }),
      loadTrainingSummary(preferences.codeforcesHandle, controller.signal),
    ]).then(([submissionResult, recommendationResult, summaryResult]) => {
      if (controller.signal.aborted) return;
      let failed = 0;
      const submissionData = submissionResult.status === "fulfilled" ? submissionResult.value : (failed += 1, {});
      const nextSubmissions = Array.isArray(submissionData.submissions) ? submissionData.submissions as Submission[] : [];
      setSubmissions(nextSubmissions);
      const solvedPerDay: Record<string, number> = {};
      const seen = new Set<string>();
      for (const item of nextSubmissions) {
        if (item.verdict !== "OK" || seen.has(item.code)) continue;
        seen.add(item.code);
        const key = dateKey(new Date(item.createdAt));
        solvedPerDay[key] = (solvedPerDay[key] ?? 0) + 1;
      }
      setRemoteActivity(solvedPerDay);
      const recommendationData = recommendationResult.status === "fulfilled" ? recommendationResult.value : (failed += 1, {});
      if (Array.isArray(recommendationData.problems) && recommendationData.problems.length) setRecommendations(recommendationData.problems);
      if (summaryResult.status === "fulfilled") {
        const summaryData = summaryResult.value;
        setTrainingSummary(summaryData);
        const trainedPerDay: Record<string, number> = {};
        for (const item of summaryData.recent) {
          const key = dateKey(new Date(item.createdAt));
          trainedPerDay[key] = (trainedPerDay[key] ?? 0) + 1;
        }
        setTrainingActivity(trainedPerDay);
      } else {
        failed += 1;
      }
      if (failed) setSyncError(failed === 3 ? "实时数据暂时不可用，已显示本地训练数据" : "部分实时数据同步失败，其余内容仍可使用");
    }).finally(() => { if (!controller.signal.aborted) setSyncing(false); });
    return () => controller.abort();
  }, []);

  const activity = useMemo(() => Object.fromEntries(days.map((key) => [key, Math.max(manualActivity[key] ?? 0, remoteActivity[key] ?? 0, trainingActivity[key] ?? 0)])), [days, manualActivity, remoteActivity, trainingActivity]);
  const done = activity[today] ?? 0;
  const totalActivity = Object.values(activity).reduce((sum, value) => sum + value, 0);
  const weeklyActivity = days.slice(-7).reduce((sum, key) => sum + (activity[key] ?? 0), 0);
  let streak = 0;
  for (let index = days.length - 1; index >= 0 && (activity[days[index]] ?? 0) > 0; index -= 1) streak += 1;
  const recentAccepted = useMemo(() => {
    const seen = new Set<string>();
    return submissions.filter((item) => {
      if (item.verdict !== "OK" || seen.has(item.code)) return false;
      seen.add(item.code);
      return true;
    }).slice(0, 5);
  }, [submissions]);
  const visibleRecommendations = useMemo(() => Array.from({ length: Math.min(4, recommendations.length) }, (_, index) => recommendations[(batch * 4 + index) % recommendations.length]), [batch, recommendations]);

  function saveDashboard(nextGoal: number, nextActivity = manualActivity) {
    setGoal(nextGoal);
    setManualActivity(nextActivity);
    try { saveTrainerPreferences({ codeforcesHandle: handle, dailyGoal: nextGoal }); } catch (error) { setSyncError(error instanceof Error ? error.message : "训练目标未能保存"); }
    void savePersistentJson("dashboard", "icpc-trainer-dashboard", { activity: nextActivity }).then((saved) => { if (!saved) setSyncError("训练记录未能保存"); });
  }

  function recordProblem() {
    saveDashboard(goal, { ...manualActivity, [today]: (manualActivity[today] ?? 0) + 1 });
  }

  return <AppShell active="训练台">
    <section className="training-dashboard-head">
      <div><h1>今天，专注完成训练。</h1><p>推荐题目、完成记录与训练节奏集中在一个页面。</p></div>
      <div><Link className="button button-primary" href="/problem?recommended=1&mode=balanced&training=1"><Icon name="play" /> 开始今日训练</Link><Link className="button button-ghost" href="/vp"><Icon name="trophy" /> 创建 VP</Link></div>
    </section>

    <section className="training-mode-strip" aria-label="训练模式">
      <Link href="/problem?recommended=1&mode=speed&training=1"><span>25′</span><div><b>热身冲刺</b><small>练读题与实现速度</small></div><strong>→</strong></Link>
      <Link href="/problem?recommended=1&mode=weakness&training=1"><span>弱</span><div><b>弱项攻坚</b><small>按错误记录定位短板</small></div><strong>→</strong></Link>
      <Link href="/vp/archive"><span>赛</span><div><b>赛事补题</b><small>邀请赛、省赛与区域赛真题 VP</small></div><strong>→</strong></Link>
      <Link href="/problem?recommended=1&mode=boss&training=1"><span>+4</span><div><b>Boss 题</b><small>挑战舒适区上方 400</small></div><strong>→</strong></Link>
    </section>

    <section className="training-overview-grid">
      <article className="daily-goal-card">
        <div className="goal-ring" style={{ "--progress": `${Math.min(100, done / Math.max(1, goal) * 100)}%` } as CSSProperties}><span><b>{done}</b><small>/ {goal} 题</small></span></div>
        <div className="daily-goal-copy"><span>每日目标</span><h2>{done >= goal ? "今日目标已完成" : `还差 ${goal - done} 题`}</h2><p>连续 {streak} 天 · 本周完成 {weeklyActivity} 题</p><div><button onClick={() => saveDashboard(Math.max(1, goal - 1))}>−</button><strong>{goal} 题/天</strong><button onClick={() => saveDashboard(goal + 1)}>＋</button><button className="complete-goal" onClick={recordProblem}>手动记一题</button></div></div>
      </article>
      <article className="recent-completed-card panel">
        <div className="panel-head"><div><h2>最近完成</h2><p>{syncing ? `正在同步 ${handle}…` : syncError || `累计记录 ${totalActivity} 题`}</p></div><Link href="/submissions">全部记录 →</Link></div>
        <div className="recent-solve-list">{recentAccepted.length ? recentAccepted.map((item) => <Link href={`/problem/${item.code.replace("CF ", "")}`} key={item.id}><Icon name="check" /><span><b>{item.code} · {item.title}</b><small>{new Date(item.createdAt).toLocaleString("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" })}</small></span></Link>) : <p className="dashboard-empty">还没有同步到近期 AC，完成一道题后会显示在这里。</p>}</div>
      </article>
    </section>

    <section className="dashboard-main-grid">
      <article className="panel dashboard-recommendations">
        <div className="panel-head"><div><h2>为你推荐</h2><p>排除已完成题，优先补弱项；训练入口默认隐藏标签与 Rating。</p></div><button className="text-button" onClick={() => setBatch((value) => value + 1)}><Icon name="shuffle" /> 换一组</button></div>
        <div className="problem-list">{visibleRecommendations.map((problem, index) => <div className="recommended-problem" key={problem.code}><ProblemRow problem={problem} index={index + 1} training concealMeta /><span>{problem.reason}</span></div>)}</div>
        <Link className="panel-footer-link" href="/problem?recommended=1&mode=balanced&training=1">调整训练模式、标签和目标区间 <span>→</span></Link>
      </article>
      <article className="panel compact-heatmap-card">
        <div className="panel-head"><div><h2>近期热力图</h2><p>最近 12 周</p></div><strong>{weeklyActivity}<small>本周</small></strong></div>
        <div className="heatmap" aria-label="训练活跃热力图">{days.map((key) => <i key={key} className={`heat-${Math.min(4, activity[key] ?? 0)}`} title={`${key}: ${activity[key] ?? 0} 道`} />)}</div>
        <div className="heat-legend"><span>少</span>{[0, 1, 2, 3, 4].map((value) => <i key={value} className={`heat-${value}`} />)}<span>多</span></div>
        {trainingSummary?.dueReviews.length ? <Link className="dashboard-vp-cta review-cta" href="/problem?recommended=1&mode=review&training=1"><span><b>{trainingSummary.dueReviews.length} 题待复盘</b><small>重新独立做，检查是否真正掌握</small></span><strong>→</strong></Link> : <Link className="dashboard-vp-cta" href="/vp"><span><b>创建一场 VP</b><small>支持多人实时榜单与多场组合</small></span><strong>→</strong></Link>}
      </article>
    </section>

    <section className="dashboard-archive-section">
      <div className="dashboard-section-head">
        <div><span className="eyebrow">ICPC ARCHIVE</span><h2>近年 ICPC 赛后补题</h2><p>按年份直接选择全国邀请赛、省赛、区域赛或东亚区决赛，进入原场提交时间轴与实时相对榜单。</p></div>
        <Link className="button button-ghost" href="/vp/archive">打开完整赛事库 →</Link>
      </div>
      <div className="dashboard-archive-years">
        {archiveYears.map((year) => {
          const contests = archiveContests.filter((contest) => contest.year === year);
          return <article className="dashboard-archive-year" key={year}>
            <header><div><strong>{year}</strong><span>{contests.length} 场可回放</span></div><small>真实榜单时间轴</small></header>
            <div className="dashboard-contest-list">{contests.map((contest) => <Link href={`/vp/archive?contest=${contest.id}`} key={contest.id}>
              <span className="contest-type">{contest.type}</span><span><b>{contest.name}</b><small>{contest.city} · {contest.problemCount} 题</small></span><em>开始 VP →</em>
            </Link>)}</div>
          </article>;
        })}
      </div>
      <div className="dashboard-international">
        <div className="dashboard-international-head"><div><h3>国内外 ICPC 赛事导航</h3><p>国际场次先提供官方资料与榜单入口；拥有逐提交公开数据后会升级为站内实时回放。</p></div><span>官方来源 ↗</span></div>
        <div className="dashboard-international-years">{internationalYears.map((year) => <article key={year}><strong>{year}</strong><div>{internationalContests.filter((contest) => contest.year === year).map((contest) => <a href={contest.href} target="_blank" rel="noreferrer" key={`${contest.year}-${contest.name}`}><span><b>{contest.name}</b><small>{contest.region} · {contest.type}</small></span><em>查看资料 ↗</em></a>)}</div></article>)}</div>
      </div>
    </section>
  </AppShell>;
}
