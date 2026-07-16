"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AppShell, Icon, ProblemRow } from "./components/AppShell";
import { archiveContests, archiveProblemHref, type ArchiveContest } from "./data/archive-contests";
import { apiJson } from "./lib/api-client";
import { authJson } from "./lib/auth-client";
import { loadPlatformSubmissions, subscribePlatformSubmissions, type PlatformSubmission } from "./lib/platform-submissions";
import { readTrainerPreferences, saveTrainerPreferences, syncTrainerPreferences } from "./lib/preferences";
import { loadPersistentJson } from "./lib/persistent-state";
import { readStoredJson } from "./lib/storage";
import { getTrainingClientId, loadTrainingSummary, type TrainingSummary } from "./lib/training-client";

type Recommendation = { code: string; title: string; titleZh?: string; rating: number; tags: string[]; reason?: string };
type Submission = { id: number; createdAt: string; code: string; title: string; verdict: string };
type ArchiveAttempt = { wrong: number; solvedAt?: number };
type ArchiveSession = { contestId: string; startedAt?: number; reveal: boolean; group: string; myTeam: string; attempts: Record<string, ArchiveAttempt> };

const thinkingTags = ["constructive algorithms", "greedy", "math", "number theory", "combinatorics", "games", "bitmasks", "brute force"];
const fallbackRecommendations: Recommendation[] = [
  { code: "CF 1967B1", title: "Reverse Card (Easy Version)", rating: 1400, tags: ["math", "number theory"], reason: "整除关系与计数转化" },
  { code: "CF 1920C", title: "Partitioning the Array", rating: 1600, tags: ["math", "brute force"], reason: "枚举结构与差分观察" },
  { code: "CF 1904C", title: "Array Game", rating: 1400, tags: ["greedy", "sortings"], reason: "操作次数分类与贪心" },
  { code: "CF 1914C", title: "Quests", rating: 1200, tags: ["greedy", "brute force"], reason: "前缀贡献与决策优化" },
  { code: "CF 1857C", title: "Assembly via Minimums", rating: 1200, tags: ["greedy", "sortings"], reason: "从局部信息反推构造" },
  { code: "CF 1805C", title: "We Need the Zero", rating: 1200, tags: ["bitmasks", "constructive algorithms"], reason: "异或性质与构造判断" },
];
const featuredContestIds = [
  "2025-shenyang",
  "2024-shenyang",
  "2025-chengdu",
  "2025-nanjing",
  "2025-wuhan",
];
const featuredContests = featuredContestIds.map((id) => archiveContests.find((contest) => contest.id === id)).filter((contest): contest is ArchiveContest => Boolean(contest));
const ARCHIVE_SESSION_KEY = "icpc-trainer-archive-vp";

function isArchiveSession(value: unknown): value is ArchiveSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ArchiveSession>;
  return typeof session.contestId === "string" && Boolean(archiveContests.find((contest) => contest.id === session.contestId)) && Boolean(session.attempts) && typeof session.attempts === "object";
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function canonicalProblemCode(code: string) {
  return code.toUpperCase().replace(/[^A-Z0-9]/g, "").replace(/^CF(?=\d)/, "");
}

function rememberFirstCompletion(completions: Map<string, number>, problemId: string, createdAt: string) {
  const timestamp = Date.parse(createdAt);
  if (!problemId || !Number.isFinite(timestamp)) return;
  const current = completions.get(problemId);
  if (current === undefined || timestamp < current) completions.set(problemId, timestamp);
}

export default function Home() {
  const [handle, setHandle] = useState("ShallowDream2");
  const [goal, setGoal] = useState(4);
  const [codeforcesSubmissions, setCodeforcesSubmissions] = useState<Submission[]>([]);
  const [trainingSummary, setTrainingSummary] = useState<TrainingSummary | null>(null);
  const [recommendations, setRecommendations] = useState<Recommendation[]>(fallbackRecommendations);
  const [batch, setBatch] = useState(0);
  const [syncing, setSyncing] = useState(true);
  const [syncError, setSyncError] = useState("");
  const [archiveSession, setArchiveSession] = useState<ArchiveSession | null>(null);
  const [platformSubmissions, setPlatformSubmissions] = useState<PlatformSubmission[]>([]);
  const [selectedContestId, setSelectedContestId] = useState(featuredContests[0]?.id ?? "");
  const today = dateKey(new Date());
  const days = useMemo(() => Array.from({ length: 84 }, (_, index) => { const date = new Date(); date.setDate(date.getDate() - 83 + index); return dateKey(date); }), []);

  useEffect(() => {
    const localPreferences = readTrainerPreferences();
    setHandle(localPreferences.codeforcesHandle);
    setGoal(localPreferences.dailyGoal);

    const localArchive = readStoredJson<ArchiveSession | null>(ARCHIVE_SESSION_KEY, null, (value): value is ArchiveSession | null => value === null || isArchiveSession(value));
    if (localArchive) {
      setArchiveSession(localArchive);
      setSelectedContestId(localArchive.contestId);
    }
    void loadPersistentJson<ArchiveSession | null>("archive-vp", ARCHIVE_SESSION_KEY, localArchive, (value): value is ArchiveSession | null => value === null || isArchiveSession(value)).then((remote) => {
      if (!remote) return;
      setArchiveSession(remote);
      setSelectedContestId(remote.contestId);
    });

    const clientId = getTrainingClientId();
    const controller = new AbortController();
    void syncTrainerPreferences().then(async (preferences) => {
      if (controller.signal.aborted) return;
      setHandle(preferences.codeforcesHandle);
      setGoal(preferences.dailyGoal);
      const recommendationParams = new URLSearchParams({
        handle: preferences.codeforcesHandle,
        min: "800",
        max: "1800",
        limit: "18",
        mode: "balanced",
        tags: thinkingTags.join(","),
        clientId,
      });
      const [submissionResult, recommendationResult, summaryResult] = await Promise.allSettled([
        apiJson<{ submissions?: Submission[] }>(`/codeforces/submissions?handle=${encodeURIComponent(preferences.codeforcesHandle)}&count=1000`, { cache: "no-store", signal: controller.signal }),
        authJson<{ problems?: Recommendation[] }>(`/codeforces/recommendations?${recommendationParams}`, { cache: "no-store", signal: controller.signal }),
        loadTrainingSummary(preferences.codeforcesHandle, controller.signal),
      ]);
      if (controller.signal.aborted) return;
      let failed = 0;
      const submissionData = submissionResult.status === "fulfilled" ? submissionResult.value : (failed += 1, {});
      const nextSubmissions = Array.isArray(submissionData.submissions) ? submissionData.submissions as Submission[] : [];
      setCodeforcesSubmissions(nextSubmissions.slice(0, 10_000));
      const recommendationData = recommendationResult.status === "fulfilled" ? recommendationResult.value : (failed += 1, {});
      if (Array.isArray(recommendationData.problems) && recommendationData.problems.length) setRecommendations(recommendationData.problems);
      if (summaryResult.status === "fulfilled") setTrainingSummary(summaryResult.value); else failed += 1;
      if (failed) setSyncError(failed === 3 ? "实时数据暂时不可用" : "部分数据同步失败");
    }).finally(() => { if (!controller.signal.aborted) setSyncing(false); });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    void loadPlatformSubmissions().then(setPlatformSubmissions);
    return subscribePlatformSubmissions(setPlatformSubmissions);
  }, []);

  const activity = useMemo(() => {
    const firstCompletion = new Map<string, number>();
    for (const item of codeforcesSubmissions) {
      if (item.verdict !== "OK") continue;
      rememberFirstCompletion(firstCompletion, `cf:${canonicalProblemCode(item.code)}`, item.createdAt);
    }
    for (const item of platformSubmissions) {
      if (item.status !== "accepted" && item.verdict !== "AC") continue;
      const archiveId = item.archiveContestId && item.slot
        ? `archive:${item.archiveContestId}:${item.slot.toUpperCase()}`
        : "";
      const problemId = archiveId || (item.judge === "codeforces"
        ? `cf:${canonicalProblemCode(item.problemCode)}`
        : `${item.judge}:${canonicalProblemCode(item.problemCode)}`);
      rememberFirstCompletion(firstCompletion, problemId, item.updatedAt);
    }
    for (const item of trainingSummary?.recent ?? []) {
      if (item.outcome === "unsolved") continue;
      rememberFirstCompletion(firstCompletion, `cf:${canonicalProblemCode(item.code)}`, item.createdAt);
    }
    const counts = Object.fromEntries(days.map((key) => [key, 0]));
    for (const timestamp of firstCompletion.values()) {
      const key = dateKey(new Date(timestamp));
      if (key in counts) counts[key] += 1;
    }
    return counts;
  }, [codeforcesSubmissions, days, platformSubmissions, trainingSummary]);
  const done = activity[today] ?? 0;
  const weeklyActivity = days.slice(-7).reduce((sum, key) => sum + (activity[key] ?? 0), 0);
  let streak = 0;
  for (let index = days.length - 1; index >= 0 && (activity[days[index]] ?? 0) > 0; index -= 1) streak += 1;
  const visibleRecommendations = useMemo(() => Array.from({ length: Math.min(6, recommendations.length) }, (_, index) => recommendations[(batch * 6 + index) % recommendations.length]), [batch, recommendations]);
  const quickContests = useMemo(() => {
    const active = archiveSession ? archiveContests.find((contest) => contest.id === archiveSession.contestId) : undefined;
    return active && !featuredContests.some((contest) => contest.id === active.id) ? [active, ...featuredContests.slice(0, 4)] : featuredContests;
  }, [archiveSession]);
  const selectedContest = archiveContests.find((contest) => contest.id === selectedContestId) ?? quickContests[0];
  const unvpProblems = useMemo(() => {
    if (!selectedContest) return [];
    const contestRows = platformSubmissions.filter((item) => item.archiveContestId === selectedContest.id);
    const acceptedSlots = new Set(contestRows.filter((item) => item.status === "accepted" || item.verdict === "AC").map((item) => item.slot));
    return Array.from({ length: selectedContest.problemCount }, (_, index) => String.fromCharCode(65 + index))
      .filter((slot) => !acceptedSlots.has(slot) && (archiveSession?.contestId !== selectedContest.id || !archiveSession.attempts[slot]?.solvedAt))
      .slice(0, 6)
      .map((slot) => {
        const sessionAttempt = archiveSession?.contestId === selectedContest.id ? archiveSession.attempts[slot] : undefined;
        const platformWrong = contestRows.filter((item) => item.slot === slot && (item.status === "rejected" || item.verdict === "WA")).length;
        return { slot, title: selectedContest.problemTitles?.[slot.charCodeAt(0) - 65] || `Problem ${slot}`, attempt: { wrong: Math.max(sessionAttempt?.wrong || 0, platformWrong), solvedAt: sessionAttempt?.solvedAt } };
      });
  }, [archiveSession, platformSubmissions, selectedContest]);

  function saveDashboard(nextGoal: number) {
    setGoal(nextGoal);
    try { saveTrainerPreferences({ codeforcesHandle: handle, dailyGoal: nextGoal }); } catch (error) { setSyncError(error instanceof Error ? error.message : "训练目标未能保存"); }
  }

  return <AppShell active="训练台">
    <section className="training-dashboard-head">
      <div><h1>今日训练</h1><p>{handle} · 今日 {done}/{goal} 题</p></div>
      <div><Link className="button button-primary" href="/problem?recommended=1&mode=balanced&training=0"><Icon name="play" /> 开始训练</Link><Link className="button button-ghost" href="/vp"><Icon name="trophy" /> 创建 VP</Link></div>
    </section>

    <section className="sprint-home-banner">
      <div><span>7 月底目标</span><h2>沈阳邀请赛冲刺</h2><p>优先完成 2022–2025 沈阳站真题 VP，再穿插近年同强度区域赛。</p></div>
      <div className="sprint-home-problems">{["A", "B", "C", "D"].map((slot) => {
        const contest = archiveContests.find((item) => item.id === "2025-shenyang");
        const solved = platformSubmissions.some((item) => item.archiveContestId === contest?.id && item.slot === slot && (item.status === "accepted" || item.verdict === "AC"));
        return contest ? <Link href={archiveProblemHref(contest, slot)} className={solved ? "solved" : ""} key={slot}><b>{solved ? "✓" : slot}</b><small>{solved ? "已 AC" : "做题"}</small></Link> : null;
      })}</div>
      <div className="sprint-home-actions"><Link href="/sprint">查看冲刺计划</Link><Link className="button button-primary" href="/vp/archive?contest=2025-shenyang"><Icon name="play" /> 开始沈阳站 VP</Link></div>
    </section>

    <section className="training-overview-grid today-training-layout">
      <article className="panel today-archive-card">
        <div className="panel-head"><div><h2>历届补题</h2><p>邀请赛、区域赛与省赛</p></div><Link href="/vp/archive">全部赛事 →</Link></div>
        <div className="today-contest-tabs" role="tablist" aria-label="选择补题赛事">
          {quickContests.map((contest) => <button type="button" role="tab" aria-selected={selectedContest?.id === contest.id} className={selectedContest?.id === contest.id ? "active" : ""} key={contest.id} onClick={() => setSelectedContestId(contest.id)}><b>{contest.year} · {contest.city}</b><small>{contest.type}</small></button>)}
        </div>
        <div className="today-archive-title"><span><b>{selectedContest?.name}</b><small>{unvpProblems.length ? "未完成题目可直接进入" : "本场题目已全部完成"}</small></span>{selectedContest ? <Link href={`/vp/archive?contest=${selectedContest.id}`}>进入整场 VP →</Link> : null}</div>
        <div className="today-archive-problems">
          {selectedContest && unvpProblems.length ? unvpProblems.map(({ slot, title, attempt }) => <Link href={archiveProblemHref(selectedContest, slot)} key={slot}><span>{slot}</span><div><b>{title}</b><small>{attempt?.wrong ? `${attempt.wrong} 次未通过 · 继续做` : "待 VP"}</small></div><strong>→</strong></Link>) : <div className="today-archive-complete"><Icon name="check" /><span><b>这场已完成</b><small>切换上方赛事继续补题</small></span></div>}
        </div>
      </article>

      <article className="panel today-goal-heatmap">
        <div className="panel-head"><div><h2>今日目标</h2><p>{syncing ? "同步中…" : syncError || `连续 ${streak} 天`}</p></div><strong>{weeklyActivity}<small>本周</small></strong></div>
        <div className="today-goal-summary">
          <div className="today-goal-ring" style={{ "--progress": `${Math.min(100, done / Math.max(1, goal) * 100)}%` } as CSSProperties}><span><b>{done}</b><small>/ {goal}</small></span></div>
          <div><h3>{done >= goal ? "今日目标已完成" : `还差 ${goal - done} 题`}</h3><div className="today-goal-controls"><button type="button" aria-label="减少每日目标" onClick={() => saveDashboard(Math.max(1, goal - 1))}>−</button><strong>{goal} 题/天</strong><button type="button" aria-label="增加每日目标" onClick={() => saveDashboard(goal + 1)}>＋</button></div><Link className="today-submission-link" href="/submissions">仅按 AC 自动统计 · 查看提交 →</Link></div>
        </div>
        <div className="today-heatmap-head"><b>近 12 周</b><span>少 {[0, 1, 2, 3, 4].map((value) => <i key={value} className={`heat-${value}`} />)} 多</span></div>
        <div className="heatmap today-heatmap" aria-label="训练活跃热力图">{days.map((key) => <i key={key} className={`heat-${Math.min(4, activity[key] ?? 0)}`} title={`${key}: ${activity[key] ?? 0} 道`} />)}</div>
        {trainingSummary?.dueReviews.length ? <Link className="today-review-link" href="/problem?recommended=1&mode=review&training=0"><b>{trainingSummary.dueReviews.length} 题待复盘</b><span>去完成 →</span></Link> : null}
      </article>
    </section>

    <section className="dashboard-main-grid thinking-dashboard-grid">
      <article className="panel dashboard-recommendations">
        <div className="panel-head"><div><h2>思维题推荐</h2><p>显示难度与标签</p></div><button className="text-button" onClick={() => setBatch((value) => value + 1)}><Icon name="shuffle" /> 换一组</button></div>
        <div className="problem-list thinking-problem-list">{visibleRecommendations.map((problem, index) => <div className="recommended-problem" key={problem.code}><ProblemRow problem={problem} index={index + 1} training /><span>{problem.reason}</span></div>)}</div>
        <Link className="panel-footer-link" href="/problem?recommended=1&mode=balanced&training=0">进入题库筛选标签与 Rating <span>→</span></Link>
      </article>
    </section>
  </AppShell>;
}
