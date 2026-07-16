"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppShell, Icon, ProblemRow } from "../components/AppShell";
import { apiJson } from "../lib/api-client";
import { authJson } from "../lib/auth-client";
import { readTrainerPreferences } from "../lib/preferences";
import { getTrainingClientId } from "../lib/training-client";

type CatalogProblem = { code: string; contestId: number; index: string; title: string; rating: number; tags: string[]; status?: string; reason?: string };
type SyncState = "idle" | "syncing" | "live" | "error";
type PracticeMode = "balanced" | "weakness" | "upsolve" | "speed" | "boss" | "review";
type Profile = { solvedCount: number; attemptedCount?: number; estimatedRating: number; targetRating: number; familiarTags: string[]; weakTags?: string[]; upsolveCount?: number; dueReviewCount?: number; mode?: PracticeMode; methodology?: string };

const tagOptions = ["greedy", "math", "implementation", "dp", "data structures", "graphs", "trees", "binary search", "two pointers", "strings", "number theory", "combinatorics", "constructive algorithms", "shortest paths", "bitmasks", "sortings"];
const ratings = Array.from({ length: 19 }, (_, index) => 800 + index * 100);
const practiceModes: Array<{ id: PracticeMode; title: string; meta: string; badge: string }> = [
  { id: "balanced", title: "均衡进阶", meta: "挑战位 +100，弱项优先", badge: "推荐" },
  { id: "weakness", title: "弱项攻坚", meta: "从 WA 与卡题记录定位短板", badge: "弱" },
  { id: "upsolve", title: "赛后补题", meta: "追回做错或未完成的题", badge: "补" },
  { id: "speed", title: "热身冲刺", meta: "25 分钟内练读题与实现", badge: "25′" },
  { id: "boss", title: "Boss 题", meta: "挑战舒适区上方约 400", badge: "+4" },
  { id: "review", title: "到期复盘", meta: "重做提示或题解后才会的题", badge: "复" },
];

export default function ProblemLibraryPage() {
  const [handle, setHandle] = useState("ShallowDream2");
  const [mode, setMode] = useState<"recommended" | "catalog">("recommended");
  const [practiceMode, setPracticeMode] = useState<PracticeMode>("balanced");
  const [concealMeta, setConcealMeta] = useState(true);
  const [query, setQuery] = useState("");
  const [minRating, setMinRating] = useState(800);
  const [maxRating, setMaxRating] = useState(1600);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [problems, setProblems] = useState<CatalogProblem[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const requestRef = useRef<AbortController | null>(null);
  const pageSize = 40;

  const loadProblems = useCallback(async (nextPage = 1, nextMode: "recommended" | "catalog" = mode, nextPracticeMode: PracticeMode = practiceMode, nextHandle = handle) => {
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setSyncState("syncing");
    setMessage("");
    const params = new URLSearchParams({ min: String(minRating), max: String(maxRating), q: query, tags: selectedTags.join(",") });
    if (nextMode === "recommended") {
      params.set("handle", nextHandle);
      params.set("limit", "40");
      params.set("mode", nextPracticeMode);
      params.set("clientId", getTrainingClientId());
    }
    else {
      params.set("scope", "all");
      params.set("page", String(nextPage));
      params.set("limit", String(pageSize));
    }
    try {
      const endpoint = nextMode === "recommended" ? "/codeforces/recommendations" : "/codeforces/problems";
      const request = nextMode === "recommended" ? authJson : apiJson;
      const data = await request<{ problems?: CatalogProblem[]; profile?: Profile; page?: number; total?: number }>(`${endpoint}?${params}`, { cache: "no-store", signal: controller.signal });
      setProblems(data.problems ?? []);
      setProfile(nextMode === "recommended" ? data.profile ?? null : null);
      setPage(data.page ?? 1);
      setTotal(data.total ?? data.problems?.length ?? 0);
      setSyncState("live");
    } catch (error) {
      if (controller.signal.aborted) return;
      setProblems([]);
      setMessage(error instanceof Error ? error.message : "题库暂时不可用");
      setSyncState("error");
    }
  }, [handle, maxRating, minRating, mode, practiceMode, query, selectedTags]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const requested = params.get("mode") as PracticeMode | null;
    const nextPracticeMode = practiceModes.some((item) => item.id === requested) ? requested! : "balanced";
    const savedHandle = readTrainerPreferences().codeforcesHandle;
    setHandle(savedHandle);
    setPracticeMode(nextPracticeMode);
    setConcealMeta(params.get("training") !== "0");
    void loadProblems(1, "recommended", nextPracticeMode, savedHandle);
    return () => requestRef.current?.abort();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTag(tag: string) {
    setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void loadProblems(1, mode);
  }

  const rangeValid = minRating <= maxRating;
  const resultTitle = mode === "recommended" ? practiceModes.find((item) => item.id === practiceMode)?.title ?? "个性化推荐" : "全部 Codeforces 题目";
  const countLabel = useMemo(() => mode === "recommended" ? `${problems.length} 道候选` : `${total} 道匹配`, [mode, problems.length, total]);

  return <AppShell active="题库">
    <section className="problem-library-head">
      <div><h1>题库</h1><p>{handle} · 按难度与标签筛选</p></div>
      <button className="button button-primary" onClick={() => void loadProblems(1, mode)} disabled={syncState === "syncing"}><Icon name="history" /> {syncState === "syncing" ? "正在匹配…" : "刷新结果"}</button>
    </section>

    <section className="problem-filter-panel panel">
      <div className="catalog-mode-tabs"><button className={mode === "recommended" ? "active" : ""} onClick={() => { setMode("recommended"); void loadProblems(1, "recommended"); }}>为你推荐</button><button className={mode === "catalog" ? "active" : ""} onClick={() => { setMode("catalog"); void loadProblems(1, "catalog"); }}>全部题库</button></div>
      {mode === "recommended" ? <div className="practice-mode-grid">{practiceModes.map((item) => <button type="button" key={item.id} className={practiceMode === item.id ? "active" : ""} onClick={() => { setPracticeMode(item.id); void loadProblems(1, "recommended", item.id); }}><span>{item.badge}</span><div><b>{item.title}</b><small>{item.meta}</small></div></button>)}</div> : null}
      <form onSubmit={submit}>
        <div className="library-filter-top"><label className="template-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="题号、英文题名或标签" /></label><label>最低 Rating<select value={minRating} onChange={(event) => setMinRating(Number(event.target.value))}>{ratings.map((value) => <option key={value}>{value}</option>)}</select></label><label>最高 Rating<select value={maxRating} onChange={(event) => setMaxRating(Number(event.target.value))}>{ratings.map((value) => <option key={value}>{value}</option>)}</select></label><button className="button button-primary" type="submit" disabled={!rangeValid || syncState === "syncing"}>应用筛选</button></div>
        <div className="tag-filter"><span>标签（满足任一）</span><div>{tagOptions.map((tag) => <button type="button" key={tag} className={selectedTags.includes(tag) ? "active" : ""} onClick={() => toggleTag(tag)}>{tag}</button>)}</div>{selectedTags.length ? <button type="button" className="clear-tags" onClick={() => setSelectedTags([])}>清空</button> : null}</div>
        {mode === "recommended" ? <label className="conceal-option"><input type="checkbox" checked={concealMeta} onChange={(event) => setConcealMeta(event.target.checked)} /><span><b>赛场思维模式</b><small>进入题目前隐藏标签与 Rating，避免提前泄露解法方向</small></span></label> : null}
      </form>
    </section>

    {profile ? <section className="recommendation-profile"><div><span>已完成</span><b>{profile.solvedCount}</b></div><div><span>待补题</span><b>{profile.upsolveCount ?? 0}</b></div><div><span>目标 Rating</span><b>{profile.targetRating}</b><small>{(profile.weakTags ?? []).slice(0, 2).join(" · ") || "均衡"}</small></div></section> : null}

    <section className="panel personalized-catalog">
      <div className="panel-head"><div><h2>{resultTitle}</h2><p>{countLabel} · Rating {minRating}–{maxRating}{selectedTags.length ? ` · ${selectedTags.join(" / ")}` : ""}</p></div><span className={`catalog-live-state state-${syncState}`}><i />{syncState === "live" ? "实时题库" : syncState === "syncing" ? "加载中" : syncState === "error" ? "加载失败" : "等待筛选"}</span></div>
      <div className="problem-list">{problems.map((problem, index) => <div className="catalog-problem-with-reason" key={problem.code}><ProblemRow problem={problem} index={(page - 1) * pageSize + index + 1} training={mode === "recommended"} concealMeta={mode === "recommended" && concealMeta} />{problem.reason ? <span><Icon name="spark" /> {problem.reason}</span> : null}</div>)}</div>
      {!problems.length ? <div className="empty-state"><Icon name="search" /><h3>{message || "没有符合条件的题目"}</h3><p>可以放宽 Rating 区间或减少标签。</p></div> : null}
      {mode === "catalog" && total > pageSize ? <div className="catalog-pagination"><button disabled={page <= 1 || syncState === "syncing"} onClick={() => void loadProblems(page - 1, "catalog")}>← 上一页</button><span>第 {page} / {Math.ceil(total / pageSize)} 页</span><button disabled={page * pageSize >= total || syncState === "syncing"} onClick={() => void loadProblems(page + 1, "catalog")}>下一页 →</button></div> : null}
    </section>
  </AppShell>;
}
