"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AppShell, Icon } from "../components/AppShell";
import { JudgeReadiness } from "../components/JudgeReadiness";
import { authFetch } from "../lib/auth-client";
import { getDeviceId } from "../lib/device-id";
import { loadPlatformSubmissions, type PlatformSubmission } from "../lib/platform-submissions";
import { readTrainerPreferences, saveTrainerPreferences, syncTrainerPreferences, validCodeforcesHandle } from "../lib/preferences";
import { readStoredJson, removeStoredValue, writeStoredJson } from "../lib/storage";

type VpProblem = { slot: string; code: string; contestId: number; index: string; title: string; rating: number; tags: string[]; thinking?: boolean };
type SourceContest = { contestId: number; problemCount: number; averageRating: number; url: string };
type ProblemStanding = { solved: boolean; wrongAttempts: number; pendingAttempts?: number; solvedMinutes: number | null; penalty: number };
type VpMedal = "gold" | "silver" | "bronze" | null;
type StandingRow = { id: string; rank: number; handle: string; solved: number; penalty: number; lastSolvedMinutes?: number | null; medal?: VpMedal; problems: Record<string, ProblemStanding>; mine?: boolean; origin?: "original" | "mine"; sourceCount?: number };
type Standings = { updatedAt: string; elapsedSeconds?: number; freezeAtSeconds?: number; frozen?: boolean; finished?: boolean; pollAfterSeconds?: number; totalRows?: number; originalTeams?: number; medalCutoffs?: { gold: number; silver: number; bronze: number }; participantRows?: StandingRow[]; unavailableContestIds?: number[]; sourceBoards?: Array<{ contestId: number; name: string; selectedProblems: string[]; sampledTeams: number }>; rows: StandingRow[] };
type Contest = { id: string; handle: string; participants?: string[]; mode: string; seed: string; durationMinutes: number; targetRating: number; thinkingRatio?: number; thinkingCount?: number; sourceContestId: number | null; sourceContests?: SourceContest[]; excludedSolved: number; createdAt: string; startedAt?: number; finishedAt?: number; abandoned?: boolean; problems: VpProblem[]; standings?: Standings };
type RoomTab = "problems" | "standings" | "submissions";
type TeamSubmission = { id: string; handle: string; createdAt: string; code: string; contestId?: number; index: string; title: string; language: string; verdict: string; timeMs?: number; memoryBytes?: number; judgeSubmissionId?: number | null; detailHref?: string; platform?: boolean };

const STORAGE_KEY = "icpc-trainer-active-vp";
const modeOptions = [
  ["自由组卷", "跨比赛形成难度梯度，默认提高思维题占比", "✦"],
  ["原场镜像", "完整复现一场历史比赛", "◫"],
  ["多场组合", "从 2–4 场历史比赛组合", "⊞"],
];

const medalText: Record<Exclude<VpMedal, null>, string> = { gold: "金奖", silver: "银奖", bronze: "铜奖" };

function usedTimeLabel(minutes?: number | null) {
  if (minutes === null || minutes === undefined) return "—";
  return `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, "0")}`;
}

function relativeSubmissionTime(createdAt: string, startedAt?: number) {
  if (!startedAt) return "—";
  const seconds = Math.max(0, Math.floor((new Date(createdAt).getTime() - startedAt) / 1000));
  return `+${String(Math.floor(seconds / 3600)).padStart(2, "0")}:${String(Math.floor(seconds % 3600 / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

function verdictLabel(verdict: string) {
  const labels: Record<string, string> = {
    OK: "Accepted",
    WRONG_ANSWER: "Wrong Answer",
    TIME_LIMIT_EXCEEDED: "Time Limit",
    MEMORY_LIMIT_EXCEEDED: "Memory Limit",
    RUNTIME_ERROR: "Runtime Error",
    COMPILATION_ERROR: "Compilation Error",
    IDLENESS_LIMIT_EXCEEDED: "Idleness Limit",
    TESTING: "Judging",
    FAILED: "提交失败",
    NEEDS_LOGIN: "需要登录",
    SKIPPED: "Skipped",
  };
  return labels[verdict] || verdict.replaceAll("_", " ");
}

async function fetchTeamSubmissions(contest: Contest, signal: AbortSignal) {
  if (!contest.startedAt) return [];
  const handles = contest.participants?.length ? contest.participants : [contest.handle];
  const problemKeys = new Set(contest.problems.map((problem) => `${problem.contestId}${problem.index}`));
  const endAt = contest.startedAt + contest.durationMinutes * 60_000;
  const [platformRows, results] = await Promise.all([
    loadPlatformSubmissions(),
    Promise.allSettled(handles.map(async (handle) => {
      const data = await vpJson<{ submissions?: Omit<TeamSubmission, "handle">[] }>(`/codeforces/submissions?handle=${encodeURIComponent(handle)}`, { cache: "no-store", signal }, 20_000);
      return (data.submissions ?? []).map((submission) => ({ ...submission, id: String(submission.id), handle }));
    })),
  ]);
  const inWindow = (createdAt: string) => {
    const submittedAt = new Date(createdAt).getTime();
    return submittedAt >= (contest.startedAt ?? 0) && submittedAt <= endAt;
  };
  const platform = platformRows.filter((submission) => inWindow(submission.createdAt) && problemKeys.has(`${submission.contestId}${submission.problemIndex}`))
    .map((submission): TeamSubmission => ({
      id: submission.requestId,
      handle: contest.handle,
      createdAt: submission.createdAt,
      code: submission.problemCode,
      contestId: submission.contestId,
      index: submission.problemIndex,
      title: submission.problemTitle,
      language: submission.language,
      verdict: platformSubmissionVerdict(submission),
      judgeSubmissionId: submission.judgeSubmissionId,
      detailHref: `/submissions/${encodeURIComponent(submission.requestId)}`,
      platform: true,
    }));
  const platformJudgeIds = new Set(platform.map((submission) => submission.judgeSubmissionId).filter((value): value is number => Number.isInteger(value)));
  const judgeRows = results.flatMap((result) => result.status === "fulfilled" ? result.value : [])
    .filter((submission) => {
      return inWindow(submission.createdAt) && problemKeys.has(`${submission.contestId}${submission.index}`) && !platformJudgeIds.has(Number(submission.id));
    })
    .map((submission) => ({ ...submission, judgeSubmissionId: Number(submission.id) }));
  return [...platform, ...judgeRows].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function platformSubmissionVerdict(submission: PlatformSubmission) {
  if (submission.status === "accepted") return "OK";
  if (submission.status === "submitted" || submission.status === "queued") return "TESTING";
  if (submission.status === "needs_login") return "NEEDS_LOGIN";
  if (submission.status === "failed") return "FAILED";
  return submission.verdict === "WA" ? "WRONG_ANSWER" : "FAILED";
}

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
  const [vpHistory, setVpHistory] = useState<Contest[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error" | "syncing">("idle");
  const [message, setMessage] = useState("");
  const [now, setNow] = useState(Date.now());
  const [roomTab, setRoomTab] = useState<RoomTab>("problems");
  const [teamSubmissions, setTeamSubmissions] = useState<TeamSubmission[]>([]);
  const [standingQuery, setStandingQuery] = useState("");
  const [mineOnly, setMineOnly] = useState(false);
  const [submissionHandle, setSubmissionHandle] = useState("all");
  const generateRequest = useRef<AbortController | null>(null);
  const standingsRequest = useRef<AbortController | null>(null);
  const finalSyncFor = useRef("");

  useEffect(() => {
    let active = true;
    const preferences = readTrainerPreferences();
    setParticipantText(preferences.teamHandles.join(", "));
    const saved = readStoredJson<Contest | null>(STORAGE_KEY, null, (value): value is Contest | null => value === null || isContest(value));
    if (saved) { setContest(saved); setParticipantText((saved.participants ?? [saved.handle]).join(", ")); }
    void Promise.allSettled([
      syncTrainerPreferences(),
      vpJson<{ session: Contest | null }>(`/vp/sessions/active?clientId=${encodeURIComponent(getDeviceId())}`, { cache: "no-store" }),
    ]).then(([preferenceResult, sessionResult]) => {
      if (!active) return;
      const activeSession = sessionResult.status === "fulfilled" ? sessionResult.value.session : null;
      if (activeSession && isContest(activeSession)) { save(activeSession); setParticipantText((activeSession.participants ?? [activeSession.handle]).join(", ")); }
      else if (!saved && preferenceResult.status === "fulfilled") setParticipantText(preferenceResult.value.teamHandles.join(", "));
    });
    void loadVpHistory();
    return () => { active = false; generateRequest.current?.abort(); standingsRequest.current?.abort(); };
  }, []);
  useEffect(() => {
    if (!contest?.startedAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [contest?.startedAt]);
  useEffect(() => {
    if (!contest?.startedAt || contest.standings?.finished) return;
    void syncStandings(true);
    const pollMs = Math.max(15, contest.standings?.pollAfterSeconds ?? Math.ceil((contest.participants?.length ?? 1) * 2.5)) * 1000;
    const timer = window.setInterval(() => void syncStandings(true), pollMs);
    return () => window.clearInterval(timer);
  }, [contest?.id, contest?.startedAt, contest?.participants?.length, contest?.standings?.finished]); // eslint-disable-line react-hooks/exhaustive-deps

  const participants = useMemo(() => [...new Set(participantText.split(/[\s,;]+/).map((item) => item.trim()).filter(Boolean))], [participantText]);
  const remaining = useMemo(() => {
    if (!contest?.startedAt) return contest ? contest.durationMinutes * 60 : duration * 60;
    return Math.max(0, contest.durationMinutes * 60 - Math.floor((now - contest.startedAt) / 1000));
  }, [contest, duration, now]);
  const timeLabel = `${String(Math.floor(remaining / 3600)).padStart(2, "0")}:${String(Math.floor(remaining % 3600 / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  useEffect(() => {
    if (!contest?.startedAt || remaining > 0 || contest.standings?.finished || finalSyncFor.current === contest.id) return;
    finalSyncFor.current = contest.id;
    void syncStandings(true);
  }, [contest?.id, contest?.startedAt, contest?.standings?.finished, remaining]); // eslint-disable-line react-hooks/exhaustive-deps

  function save(next: Contest | null) {
    setContest(next);
    if (next) {
      if (!writeStoredJson(STORAGE_KEY, next)) setMessage("浏览器无法保存本场 VP，刷新页面后进度可能丢失");
    } else removeStoredValue(STORAGE_KEY);
  }

  async function loadVpHistory() {
    try {
      const data = await vpJson<{ sessions?: Contest[] }>(`/vp/sessions/history?clientId=${encodeURIComponent(getDeviceId())}&limit=20`, { cache: "no-store" }, 12_000);
      setVpHistory((data.sessions || []).filter((session) => isContest(session) && session.standings?.finished === true));
    } catch { /* API v13 之前不提供常规 VP 历史，当前比赛仍可正常使用。 */ }
  }

  async function generateContest() {
    if (!participants.length || participants.length > 3 || participants.some((item) => !validCodeforcesHandle(item))) { setStatus("error"); setMessage("请输入 1–3 个有效的队员 Codeforces Handle"); return; }
    generateRequest.current?.abort();
    const controller = new AbortController();
    generateRequest.current = controller;
    setStatus("loading");
    setMessage("");
    try {
      const data = await vpJson<Contest>("/vp/generate", { method: "POST", body: JSON.stringify({ clientId: getDeviceId(), participants, handle: participants[0], mode, count, targetRating, thinkingRatio, durationMinutes: duration, seed: seed || undefined }), signal: controller.signal }, 30_000);
      if (!isContest(data)) throw new Error("组卷服务返回了无效比赛");
      save(data);
      setRoomTab("problems");
      setTeamSubmissions([]);
      setStandingQuery("");
      setMineOnly(false);
      setSubmissionHandle("all");
      finalSyncFor.current = "";
      setSeed(data.seed);
      const preferences = readTrainerPreferences();
      saveTrainerPreferences({ ...preferences, codeforcesHandle: participants[0], teamHandles: participants });
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
    finalSyncFor.current = "";
    save({ ...contest, startedAt });
    setRoomTab("problems");
    setTeamSubmissions([]);
    setNow(startedAt);
    void vpJson<{ session: Contest }>("/vp/sessions/start", { method: "POST", body: JSON.stringify({ clientId: getDeviceId(), id: contest.id, startedAt }) }).then(({ session }) => { if (isContest(session)) save(session); }).catch(() => setMessage("比赛已在本机开始，但服务器暂时未能保存开始时间"));
  }

  async function finishContest() {
    if (!contest) return;
    await vpJson("/vp/sessions/finish", { method: "POST", body: JSON.stringify({ clientId: getDeviceId(), id: contest.id, abandoned: contest.standings?.finished !== true }) }).catch(() => undefined);
    save(null);
    await loadVpHistory();
  }

  async function syncStandings(silent = false) {
    if (!contest?.startedAt) return;
    if (standingsRequest.current) return;
    const controller = new AbortController();
    standingsRequest.current = controller;
    if (!silent) setStatus("syncing");
    if (!contest.standings) setMessage("正在加载并合并各题原比赛榜单；首次完成后会写入服务器数据库…");
    try {
      const [data, submissions] = await Promise.all([
        vpJson<Standings>("/vp/standings", { method: "POST", body: JSON.stringify({ clientId: getDeviceId(), vpId: contest.id, participants: contest.participants?.length ? contest.participants : [contest.handle], startedAt: contest.startedAt, durationMinutes: contest.durationMinutes, problems: contest.problems.map(({ contestId, index, slot }) => ({ contestId, index, slot })) }), signal: controller.signal }, 120_000),
        fetchTeamSubmissions(contest, controller.signal),
      ]);
      if (!Array.isArray(data.rows)) throw new Error("榜单服务返回了无效数据");
      save({ ...contest, standings: data });
      if (data.finished) void loadVpHistory();
      setTeamSubmissions(submissions);
      setMessage(data.finished ? "比赛结束，最终排名与奖牌已完成结算" : data.frozen ? "最后一小时封榜中；你的提交仍会正常判题" : `已同步 ${data.originalTeams ?? 0} 支正式队伍，排名动态更新`);
      setStatus("idle");
    } catch (error) {
      if (controller.signal.aborted) return;
      if (!silent) { setMessage(error instanceof Error ? error.message : "榜单同步失败"); setStatus("error"); }
      else setMessage("自动刷新失败，已保留上次榜单；可点击“立即刷新榜单”重试");
    } finally { if (standingsRequest.current === controller) standingsRequest.current = null; }
  }

  if (contest) {
    const teamMembers = contest.participants ?? [contest.handle];
    const participantHandles = new Set(teamMembers.map((handle) => handle.toLowerCase()));
    const teamLabel = teamMembers.join(" + ");
    const rows: StandingRow[] = contest.standings?.rows?.map((row, index) => ({ ...row, id: row.id || `legacy:${row.handle.toLowerCase()}:${index}`, mine: row.mine ?? participantHandles.has(row.handle.toLowerCase()) })) ?? [{ id: `mine:${teamMembers.map((handle) => handle.toLowerCase()).sort().join("+")}`, rank: 1, handle: teamLabel, solved: 0, penalty: 0, problems: {} as Record<string, ProblemStanding>, mine: true, origin: "mine" }];
    const rankedMyRow = rows.find((row) => row.mine && row.handle.toLowerCase() === contest.handle.toLowerCase()) ?? rows.find((row) => row.mine) ?? rows[0];
    const myRow = contest.standings?.participantRows?.find((row) => row.mine) ?? rankedMyRow;
    const pollSeconds = contest.standings?.pollAfterSeconds ?? Math.max(15, Math.ceil((contest.participants?.length ?? 1) * 2.5));
    const timerEnded = Boolean(contest.startedAt && remaining === 0);
    const finished = Boolean(contest.standings?.finished);
    const settling = timerEnded && !finished;
    const frozen = Boolean(contest.standings?.frozen && !finished);
    const elapsedSeconds = contest.startedAt ? Math.min(contest.durationMinutes * 60, Math.max(0, contest.durationMinutes * 60 - remaining)) : 0;
    const progress = Math.min(100, elapsedSeconds / Math.max(1, contest.durationMinutes * 60) * 100);
    const freezeProgress = Math.max(0, (contest.durationMinutes * 60 - 3600) / Math.max(1, contest.durationMinutes * 60) * 100);
    const medal = myRow?.medal ?? null;
    const normalizedStandingQuery = standingQuery.trim().toLowerCase();
    const visibleRows = rows.filter((row) => (!mineOnly || row.mine) && (!normalizedStandingQuery || row.handle.toLowerCase().includes(normalizedStandingQuery)));
    const visibleSubmissions = teamSubmissions.filter((submission) => submissionHandle === "all" || submission.handle === submissionHandle);
    const teamHandles = contest.participants?.length ? contest.participants : [contest.handle];
    return <AppShell active="模拟赛">
      <section className="contest-room-head">
        <div><span className="eyebrow"><span className="live-dot" /> {!contest.startedAt ? "比赛已生成" : finished ? "比赛结束" : settling ? "正在揭榜" : frozen ? "最后一小时封榜" : "实时榜单回放中"}</span><h1>{contest.mode} · {contest.problems.length} 题</h1><p>{(contest.participants ?? [contest.handle]).join(" / ")} · {contest.thinkingCount ?? contest.problems.filter((problem) => problem.thinking).length} 道思维题 · 已排除 {contest.excludedSolved} 道历史 AC</p></div>
        <div className="contest-clock"><small>{finished ? "已结束" : settling ? "正在结算" : contest.startedAt ? "剩余时间" : "比赛时长"}</small><b>{timeLabel}</b><span>{myRow?.solved ?? 0} AC · {settling ? "等待最终排名" : rankedMyRow?.rank ? `第 ${rankedMyRow.rank} 名` : "等待排名"}</span></div>
      </section>
      {contest.startedAt ? <div className="vp-contest-progress"><i style={{ width: `${progress}%` }} /><span style={{ left: `${freezeProgress}%` }}>封榜</span></div> : null}
      {!contest.startedAt ? <JudgeReadiness judges={["codeforces"]} label="本场 VP 提交环境" /> : null}
      <section className="contest-actions">
        {!contest.startedAt ? <button className="button button-primary" onClick={startContest}><Icon name="play" /> 开始比赛</button> : <button className="button button-primary" onClick={() => void syncStandings(false)} disabled={status === "syncing"}><Icon name="history" /> {status === "syncing" ? "同步中…" : "立即刷新榜单"}</button>}
        <button className="button button-ghost" onClick={() => void finishContest()}>{finished ? "重新组卷" : "放弃本场"}</button>
        {message ? <span className={status === "error" ? "form-error" : ""}>{message}</span> : null}
      </section>
      {frozen ? <section className="vp-freeze-banner"><b>封榜中</b><span>榜单停在最后一小时前；提交与判题继续，比赛结束后自动揭榜。</span></section> : null}
      {settling ? <section className="vp-freeze-banner"><b>正在揭榜</b><span>正在拉取最后一小时的判题记录并计算最终排名、罚时与奖牌。</span></section> : null}
      {finished ? <section className={`vp-final-result medal-${medal || "none"}`}><div><span>{medal ? medalText[medal] : "本场完成"}</span><h2>第 {rankedMyRow?.rank ?? "—"} 名</h2><p>按 {contest.standings?.originalTeams ?? 0} 支正式队伍计算</p></div><dl><div><dt>解题</dt><dd>{myRow?.solved ?? 0}</dd></div><div><dt>总罚时</dt><dd>{myRow?.penalty ?? 0}</dd></div><div><dt>总用时</dt><dd>{usedTimeLabel(myRow?.lastSolvedMinutes)}</dd></div></dl><small>金奖前 10%，银奖随后 20%，铜奖随后 30%；同罚时并列同奖。</small></section> : null}
      <nav className="vp-room-tabs" aria-label="模拟赛内容" role="tablist">
        <button type="button" role="tab" aria-selected={roomTab === "problems"} className={roomTab === "problems" ? "active" : ""} onClick={() => setRoomTab("problems")}><span>题目</span><b>{myRow?.solved ?? 0}/{contest.problems.length}</b></button>
        <button type="button" role="tab" aria-selected={roomTab === "standings"} className={roomTab === "standings" ? "active" : ""} onClick={() => setRoomTab("standings")}><span>{finished ? "最终榜单" : "实时榜单"}</span><b>{rankedMyRow?.rank ? `#${rankedMyRow.rank}` : "LIVE"}</b></button>
        <button type="button" role="tab" aria-selected={roomTab === "submissions"} className={roomTab === "submissions" ? "active" : ""} onClick={() => { setRoomTab("submissions"); if (contest.startedAt) void syncStandings(true); }}><span>队伍提交</span><b>{teamSubmissions.length}</b></button>
      </nav>

      {roomTab === "problems" ? <section className="panel vp-room-panel" role="tabpanel">
        <header className="vp-tab-heading"><div><h2>题目列表</h2><p>{contest.startedAt ? "点击任意题目，在本站阅读、翻译并提交" : "开始比赛后显示题目来源与完整信息"}</p></div><div><span>{contest.thinkingCount ?? contest.problems.filter((problem) => problem.thinking).length} 道思维题</span><span>目标 {contest.targetRating}</span></div></header>
        <div className="vp-problem-list">
          <div className="vp-problem-list-head"><span>题号</span><span>题目</span><span>难度</span><span>状态</span><span /></div>
          {contest.problems.map((problem) => {
            const myState = myRow?.problems?.[`${problem.contestId}${problem.index}`];
            const stateLabel = myState?.solved ? `AC${myState.wrongAttempts ? ` · ${myState.wrongAttempts} WA` : ""}` : myState?.pendingAttempts ? "评测中" : myState?.wrongAttempts ? `${myState.wrongAttempts} 次 WA` : "未尝试";
            const content = <><span className="vp-list-slot">{problem.slot}</span><span className="vp-list-title"><small>{contest.startedAt ? problem.code : "比赛开始后显示来源"}</small><b>{contest.startedAt ? problem.title : `Problem ${problem.slot}`}</b>{contest.startedAt ? <em>{problem.thinking ? "思维题" : "综合题"} · {problem.tags.slice(0, 3).join(" / ")}</em> : null}</span><strong>{contest.startedAt ? problem.rating : "—"}</strong><span className={`vp-list-state${myState?.solved ? " accepted" : myState?.pendingAttempts ? " pending" : myState?.wrongAttempts ? " rejected" : ""}`}>{stateLabel}</span><span className="vp-list-action">{contest.startedAt ? "开始做题 →" : "尚未开始"}</span></>;
            return contest.startedAt ? <Link className="vp-problem-list-row" href={`/problem/${problem.contestId}${problem.index}?vp=${encodeURIComponent(contest.id)}&slot=${problem.slot}`} key={problem.code}>{content}</Link> : <div className="vp-problem-list-row locked" key={problem.code}>{content}</div>;
          })}
        </div>
      </section> : null}

      {roomTab === "standings" ? <section className="panel vp-room-panel live-standings vp-tab-standings" role="tabpanel" style={{ "--problem-count": contest.problems.length } as CSSProperties}>
        <header className="vp-tab-heading vp-standings-heading"><div><h2>{finished ? "最终榜单" : frozen ? "封榜榜单" : "实时榜单"}</h2><p>{contest.standings ? `${new Date(contest.standings.updatedAt).toLocaleTimeString("zh-CN")} 更新 · ${contest.standings.originalTeams ?? 0} 支正式队伍 · ${pollSeconds} 秒刷新` : "正在载入原比赛同时间榜单"}</p></div><div className="vp-standings-tools"><label><Icon name="search" /><input value={standingQuery} onChange={(event) => setStandingQuery(event.target.value)} placeholder="搜索队伍" /></label><button type="button" className={mineOnly ? "active" : ""} onClick={() => setMineOnly((value) => !value)}>只看我的队伍</button><button type="button" onClick={() => void syncStandings(false)} disabled={!contest.startedAt || status === "syncing"}>{status === "syncing" ? "刷新中…" : "刷新"}</button></div></header>
        <section className="vp-rule-strip"><b>ICPC 规则</b><span>{pollSeconds} 秒自动更新</span><span>最后 1 小时封榜</span><span>WA +20 分钟</span><span>金/银/铜 10%/20%/30%</span></section>
        {contest.startedAt && contest.sourceContests?.length ? <section className="contest-sources"><span>原场组合</span>{contest.sourceContests.map((source) => <b key={source.contestId}>CF {source.contestId} · {source.problemCount} 题 · 均分 {source.averageRating}</b>)}</section> : null}
        {contest.standings?.sourceBoards?.length ? <div className="combined-board-sources">{contest.standings.sourceBoards.map((source) => <span key={source.contestId}><b>CF {source.contestId}</b> · {source.selectedProblems.join("/")} · {source.sampledTeams} 队</span>)}{contest.standings.sourceBoards.length > 1 ? <span><b>组合规则</b> · 按各原场同百分位队伍配对，只统计已选题目</span> : null}</div> : null}
        <div className="standings-table"><div className="standings-row standings-header"><span>#</span><span>参赛者 / 原队伍</span><span>AC</span><span>罚时</span>{contest.problems.map((problem) => <span key={problem.code}>{problem.slot}</span>)}</div>{visibleRows.map((row) => <div className={`standings-row${row.mine ? " mine" : ""}${row.medal ? ` medal-${row.medal}` : ""}`} key={row.id}><strong>{row.rank}</strong><span className="standing-party"><b>{row.handle}</b><small>{row.medal ? `${medalText[row.medal]} · ` : ""}{row.mine ? "我们的队伍" : `原比赛${row.sourceCount && row.sourceCount > 1 ? ` · 合并 ${row.sourceCount} 场` : ""}`}</small></span><strong>{row.solved}</strong><span>{row.penalty}</span>{contest.problems.map((problem) => { const state = row.problems?.[`${problem.contestId}${problem.index}`]; return <span className={state?.solved ? "solved" : state?.pendingAttempts ? "pending" : state?.wrongAttempts ? "attempted" : ""} key={problem.code}>{state?.solved ? `+${state.wrongAttempts || ""}` : state?.pendingAttempts ? `?${state.pendingAttempts}` : state?.wrongAttempts ? `-${state.wrongAttempts}` : "·"}</span>; })}</div>)}</div>
        {!visibleRows.length ? <div className="vp-tab-empty"><b>没有匹配的队伍</b><span>清空搜索或关闭“只看我的队伍”</span></div> : null}
      </section> : null}

      {roomTab === "submissions" ? <section className="panel vp-room-panel" role="tabpanel">
        <header className="vp-tab-heading"><div><h2>队伍提交记录</h2><p>站内提交优先显示并可打开源码；队友判题自动合并去重</p></div><div className="vp-submission-tools">{teamHandles.length > 1 ? <select value={submissionHandle} onChange={(event) => setSubmissionHandle(event.target.value)}><option value="all">全部队员</option>{teamHandles.map((handle) => <option value={handle} key={handle}>{handle}</option>)}</select> : <span>{teamHandles[0]}</span>}<button type="button" onClick={() => void syncStandings(false)} disabled={!contest.startedAt || status === "syncing"}>{status === "syncing" ? "同步中…" : "同步提交"}</button></div></header>
        <div className="vp-submission-list">
          <div className="vp-submission-head"><span>比赛时间</span><span>队员</span><span>题目</span><span>结果</span><span>语言</span><span>用时 / 内存</span></div>
          {visibleSubmissions.map((submission) => <Link className="vp-submission-row" href={submission.detailHref || `/problem/${submission.contestId}${submission.index}?vp=${encodeURIComponent(contest.id)}`} key={`${submission.handle}-${submission.id}`}><time>{relativeSubmissionTime(submission.createdAt, contest.startedAt)}</time><b>{submission.handle}</b><span><strong>{contest.problems.find((problem) => problem.contestId === submission.contestId && problem.index === submission.index)?.slot ?? submission.index}</strong>{submission.title}</span><em className={submission.verdict === "OK" ? "accepted" : submission.verdict === "TESTING" ? "pending" : "rejected"}>{verdictLabel(submission.verdict)}</em><span>{submission.language}{submission.platform ? <small>站内源码</small> : null}</span><small>{submission.timeMs !== undefined && submission.memoryBytes !== undefined ? `${submission.timeMs} ms · ${(submission.memoryBytes / 1024 / 1024).toFixed(1)} MB` : "查看提交详情 →"}</small></Link>)}
        </div>
        {!contest.startedAt ? <div className="vp-tab-empty"><b>比赛尚未开始</b><span>开始比赛后会自动同步队伍提交</span></div> : !visibleSubmissions.length ? <div className="vp-tab-empty"><b>还没有本场提交</b><span>从“题目”标签进入题目并提交，记录会自动出现在这里</span><button type="button" onClick={() => setRoomTab("problems")}>去做题 →</button></div> : null}
      </section> : null}
    </AppShell>;
  }

  return <AppShell active="模拟赛">
    <section className="vp-builder-head"><div><h1>创建 VP</h1><p>自由组卷或复现历史比赛</p></div><div><b>{duration / 60}h</b><span>{count} 题</span><span>{participants.length || 0} 名队员</span></div></section>
    <Link className="archive-vp-entry" href="/vp/archive"><span>ICPC</span><div><h2>历届补题</h2><p>邀请赛、区域赛与 EC-Final 原榜回放</p></div><b>选择赛事 →</b></Link>
    <section className="vp-builder simplified-vp-builder">
      <div className="builder-main">
        <div className="builder-section"><div><h2>模式</h2></div><div className="mode-grid three-modes">{modeOptions.map(([name, description, icon]) => <button key={name} className={mode === name ? "active" : ""} onClick={() => setMode(name)}><b>{icon}</b><span><strong>{name}</strong><small>{description}</small></span><i>{mode === name ? "●" : "○"}</i></button>)}</div></div>
        <div className="builder-section"><div><h2>设置</h2></div><div className="vp-inline-settings"><label>时长<div className="segmented">{[[120, "2 小时"], [180, "3 小时"], [300, "5 小时"]].map(([value, label]) => <button type="button" key={value} className={duration === value ? "active" : ""} onClick={() => setDuration(Number(value))}>{label}</button>)}</div></label><label>题数<div className="counter"><button type="button" onClick={() => setCount(Math.max(5, count - 1))}>−</button><strong>{count}</strong><button type="button" onClick={() => setCount(Math.min(13, count + 1))}>＋</button></div></label><label>Rating<select value={targetRating} onChange={(event) => setTargetRating(Number(event.target.value))}>{[1200, 1400, 1600, 1800, 2000, 2200].map((value) => <option key={value}>{value}</option>)}</select></label><label>思维题<select value={thinkingRatio} disabled={mode !== "自由组卷"} onChange={(event) => setThinkingRatio(Number(event.target.value))}><option value={0.4}>40%</option><option value={0.6}>60%</option><option value={0.8}>80%</option></select></label></div></div>
        <div className="builder-section"><div><h2>队伍成员</h2></div><div className="form-grid vp-participant-form"><label>队员 Codeforces Handles<textarea value={participantText} onChange={(event) => setParticipantText(event.target.value)} placeholder="ShallowDream2, teammate" /></label><label>Seed<input value={seed} onChange={(event) => setSeed(event.target.value)} placeholder="自动生成" /></label></div></div>
      </div>
      <aside className="builder-summary"><h2>{mode}</h2><div className="summary-time"><b>{duration / 60}</b><span>小时</span><i>·</i><b>{count}</b><span>题</span></div><p className="builder-handle">{participants[0] || "未填写 Handle"}</p><button className="create-contest" onClick={() => void generateContest()} disabled={status === "loading"}>{status === "loading" ? "正在组卷…" : "生成比赛"}</button>{message ? <small className="summary-foot form-error">{message}</small> : null}</aside>
    </section>
    {vpHistory.length ? <section className="panel archive-vp-history regular-vp-history"><header><div><h2>我的常规 VP</h2><p>最终排名、罚时与组卷题目已保存，可随时回看。</p></div><strong>{vpHistory.length} 场</strong></header><div>{vpHistory.map((entry) => {
      const result = entry.standings?.participantRows?.find((row) => row.mine) || entry.standings?.participantRows?.[0] || entry.standings?.rows.find((row) => row.mine);
      return <article key={entry.id}><span className="finished">{result?.medal ? medalText[result.medal] : "已完成"}</span><div><b>{entry.mode} · {entry.problems.length} 题</b><small>{entry.startedAt ? new Date(entry.startedAt).toLocaleString("zh-CN") : new Date(entry.createdAt).toLocaleString("zh-CN")} · {entry.thinkingCount ?? entry.problems.filter((problem) => problem.thinking).length} 道思维题</small></div><em>第 {result?.rank ?? "—"} 名 · {result?.solved ?? 0} 题 · {result?.penalty ?? 0} 罚时</em><button type="button" onClick={() => { save(entry); setRoomTab("problems"); setTeamSubmissions([]); }}>查看结果 →</button></article>;
    })}</div></section> : null}
  </AppShell>;
}
