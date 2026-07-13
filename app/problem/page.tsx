"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell, Icon, ProblemRow } from "../components/AppShell";
import { browserApiUrl } from "../lib/browser-api";

type CatalogProblem = { code: string; contestId: number; index: string; title: string; rating: number; tags: string[]; status?: string; reason?: string };
type SyncState = "idle" | "syncing" | "live" | "error";
type Profile = { solvedCount: number; estimatedRating: number; targetRating: number; familiarTags: string[] };

const tagOptions = ["greedy", "math", "implementation", "dp", "data structures", "graphs", "trees", "binary search", "two pointers", "strings", "number theory", "combinatorics", "constructive algorithms", "shortest paths", "bitmasks", "sortings"];
const ratings = Array.from({ length: 19 }, (_, index) => 800 + index * 100);

export default function ProblemLibraryPage() {
  const [mode, setMode] = useState<"recommended" | "catalog">("recommended");
  const [query, setQuery] = useState("");
  const [minRating, setMinRating] = useState(1200);
  const [maxRating, setMaxRating] = useState(1800);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [problems, setProblems] = useState<CatalogProblem[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [message, setMessage] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 40;

  const loadProblems = useCallback(async (nextPage = 1, nextMode: "recommended" | "catalog" = mode) => {
    setSyncState("syncing");
    setMessage("");
    const params = new URLSearchParams({ min: String(minRating), max: String(maxRating), q: query, tags: selectedTags.join(",") });
    if (nextMode === "recommended") params.set("handle", "ShallowDream2"), params.set("limit", "40");
    else params.set("scope", "all"), params.set("page", String(nextPage)), params.set("limit", String(pageSize));
    try {
      const endpoint = nextMode === "recommended" ? "/codeforces/recommendations" : "/codeforces/problems";
      const response = await fetch(browserApiUrl(`${endpoint}?${params}`), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "加载失败");
      setProblems(data.problems ?? []);
      setProfile(nextMode === "recommended" ? data.profile ?? null : null);
      setPage(data.page ?? 1);
      setTotal(data.total ?? data.problems?.length ?? 0);
      setSyncState("live");
    } catch (error) {
      setProblems([]);
      setMessage(error instanceof Error ? error.message : "题库暂时不可用");
      setSyncState("error");
    }
  }, [maxRating, minRating, mode, query, selectedTags]);

  useEffect(() => { void loadProblems(1, "recommended"); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleTag(tag: string) {
    setSelectedTags((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    void loadProblems(1, mode);
  }

  const rangeValid = minRating <= maxRating;
  const resultTitle = mode === "recommended" ? "个性化推荐" : "全部 Codeforces 题目";
  const countLabel = useMemo(() => mode === "recommended" ? `${problems.length} 道候选` : `${total} 道匹配`, [mode, problems.length, total]);

  return <AppShell active="题库">
    <section className="problem-library-head">
      <div><h1>选下一道真正适合你的题。</h1><p>根据 ShallowDream2 的公开完成记录排除已做题，并按标签与目标 Rating 区间推荐。</p></div>
      <button className="button button-primary" onClick={() => void loadProblems(1, mode)} disabled={syncState === "syncing"}><Icon name="history" /> {syncState === "syncing" ? "正在匹配…" : "刷新结果"}</button>
    </section>

    <section className="problem-filter-panel panel">
      <div className="catalog-mode-tabs"><button className={mode === "recommended" ? "active" : ""} onClick={() => { setMode("recommended"); void loadProblems(1, "recommended"); }}>为你推荐</button><button className={mode === "catalog" ? "active" : ""} onClick={() => { setMode("catalog"); void loadProblems(1, "catalog"); }}>全部题库</button></div>
      <form onSubmit={submit}>
        <div className="library-filter-top"><label className="template-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="题号、英文题名或标签" /></label><label>最低 Rating<select value={minRating} onChange={(event) => setMinRating(Number(event.target.value))}>{ratings.map((value) => <option key={value}>{value}</option>)}</select></label><label>最高 Rating<select value={maxRating} onChange={(event) => setMaxRating(Number(event.target.value))}>{ratings.map((value) => <option key={value}>{value}</option>)}</select></label><button className="button button-primary" type="submit" disabled={!rangeValid || syncState === "syncing"}>应用筛选</button></div>
        <div className="tag-filter"><span>标签（满足任一）</span><div>{tagOptions.map((tag) => <button type="button" key={tag} className={selectedTags.includes(tag) ? "active" : ""} onClick={() => toggleTag(tag)}>{tag}</button>)}</div>{selectedTags.length ? <button type="button" className="clear-tags" onClick={() => setSelectedTags([])}>清空</button> : null}</div>
      </form>
    </section>

    {profile ? <section className="recommendation-profile"><div><span>已排除</span><b>{profile.solvedCount}</b><small>道已 AC</small></div><div><span>近期水平</span><b>{profile.estimatedRating || "—"}</b><small>按公开 AC 中位数估计</small></div><div><span>本次目标</span><b>{profile.targetRating}</b><small>{profile.familiarTags.slice(0, 3).join(" · ") || "均衡训练"}</small></div><p>推荐不是固定精选集：每道题都来自当前 Codeforces 公开题库，并结合你的完成记录重新排序。</p></section> : null}

    <section className="panel personalized-catalog">
      <div className="panel-head"><div><h2>{resultTitle}</h2><p>{countLabel} · Rating {minRating}–{maxRating}{selectedTags.length ? ` · ${selectedTags.join(" / ")}` : ""}</p></div><span className={`catalog-live-state state-${syncState}`}><i />{syncState === "live" ? "实时题库" : syncState === "syncing" ? "加载中" : syncState === "error" ? "加载失败" : "等待筛选"}</span></div>
      <div className="problem-list">{problems.map((problem, index) => <div className="catalog-problem-with-reason" key={problem.code}><ProblemRow problem={problem} index={(page - 1) * pageSize + index + 1} />{problem.reason ? <span><Icon name="spark" /> {problem.reason}</span> : null}</div>)}</div>
      {!problems.length ? <div className="empty-state"><Icon name="search" /><h3>{message || "没有符合条件的题目"}</h3><p>可以放宽 Rating 区间或减少标签。</p></div> : null}
      {mode === "catalog" && total > pageSize ? <div className="catalog-pagination"><button disabled={page <= 1 || syncState === "syncing"} onClick={() => void loadProblems(page - 1, "catalog")}>← 上一页</button><span>第 {page} / {Math.ceil(total / pageSize)} 页</span><button disabled={page * pageSize >= total || syncState === "syncing"} onClick={() => void loadProblems(page + 1, "catalog")}>下一页 →</button></div> : null}
    </section>
  </AppShell>;
}
