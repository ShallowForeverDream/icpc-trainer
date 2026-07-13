"use client";

import { FormEvent, useMemo, useState } from "react";
import { AppShell, Icon, ProblemRow } from "../components/AppShell";
import { curatedProblems } from "../data/problems";
import { browserApiUrl } from "../lib/browser-api";

type CatalogProblem = { code: string; contestId: number; index: string; title: string; titleZh?: string; rating: number; tags: string[]; status?: string };
type SyncState = "idle" | "syncing" | "live" | "fallback";
const ranges: Record<string, [number, number]> = { "800–1000": [800, 1000], "1100–1300": [1100, 1300], "1400–1600": [1400, 1600], "1700–1900": [1700, 1900], "2000+": [2000, 3500] };

export default function ProblemLibraryPage() {
  const [mode, setMode] = useState<"curated" | "rating">("curated");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("1400–1600");
  const [problems, setProblems] = useState<CatalogProblem[]>(curatedProblems);
  const [syncState, setSyncState] = useState<SyncState>("idle");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(20);

  const filtered = useMemo(() => mode === "rating" ? problems : problems.filter((problem) => `${problem.code} ${problem.title} ${problem.titleZh ?? ""} ${problem.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase())), [mode, problems, query]);

  async function syncCurated() {
    setMode("curated");
    setSyncState("syncing");
    try {
      const response = await fetch("/api/codeforces/problems", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "同步失败");
      setProblems(data.problems);
      setTotal(data.problems.length);
      setSyncState(data.source === "codeforces" ? "live" : "fallback");
    } catch { setProblems(curatedProblems); setTotal(20); setSyncState("fallback"); }
  }

  async function loadRating(nextPage = 1, event?: FormEvent, selectedRange = range) {
    event?.preventDefault();
    setMode("rating");
    setSyncState("syncing");
    const [min, max] = ranges[selectedRange];
    try {
      const response = await fetch(browserApiUrl(`/codeforces/problems?scope=all&min=${min}&max=${max}&page=${nextPage}&limit=60&q=${encodeURIComponent(query)}`), { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "加载失败");
      setProblems(data.problems);
      setPage(data.page);
      setTotal(data.total);
      setSyncState("live");
    } catch { setSyncState("fallback"); }
  }

  return <AppShell active="题库">
    <section className="library-hero"><div><span className="eyebrow"><span className="live-dot" /> CURATED + LIVE RATING POOL</span><h1>中文精选，<em>再扩充到完整题池。</em></h1><p>20 道题提供中文结构化导读；Rating 扩展题库直接读取 Codeforces 官方公开数据。</p></div><button className="button button-primary" onClick={mode === "curated" ? syncCurated : () => loadRating(page)} disabled={syncState === "syncing"}><Icon name="history" /> {syncState === "syncing" ? "正在读取题库…" : "刷新当前题库"}</button></section>
    <div className={`sync-banner sync-${syncState}`}><span>{syncState === "live" ? "Codeforces 官方数据已加载" : syncState === "fallback" ? "官方接口暂不可用，保留当前数据" : "首批中文精选题已就绪"}</span><small>默认 Handle：ShallowDream2 · 公开接口无需 API Key</small></div>
    <div className="catalog-mode-tabs"><button className={mode === "curated" ? "active" : ""} onClick={() => { setMode("curated"); setProblems(curatedProblems); setTotal(20); }}>中文精选 20</button><button className={mode === "rating" ? "active" : ""} onClick={() => loadRating(1)}>按 Rating 扩展</button></div>
    <form className="library-toolbar" onSubmit={(event) => mode === "rating" ? loadRating(1, event) : event.preventDefault()}><div className="template-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题号、题名或标签…" /></div>{mode === "rating" && <div className="category-tabs">{Object.keys(ranges).map((item) => <button type="button" key={item} className={range === item ? "active" : ""} onClick={() => { setRange(item); loadRating(1, undefined, item); }}>{item}</button>)}<button type="submit">搜索</button></div>}</form>
    <section className="panel curated-list"><div className="panel-head"><div><span className="micro-label">{mode === "curated" ? "CHINESE CURATED SET" : `LIVE RATING / ${range}`}</span><h2>{mode === "curated" ? "精选训练集" : "Codeforces Rating 题库"}</h2></div><span className="calendar-total">当前 <b>{filtered.length}</b> / {total}</span></div><div className="problem-list">{filtered.map((problem, index) => <ProblemRow key={problem.code} problem={problem} index={(page - 1) * 60 + index + 1} />)}</div>{filtered.length === 0 && <div className="empty-state"><Icon name="search" /><h3>没有匹配的题目</h3><p>换一个关键词或 Rating 区间试试。</p></div>}{mode === "rating" && <div className="catalog-pagination"><button disabled={page <= 1 || syncState === "syncing"} onClick={() => loadRating(page - 1)}>← 上一页</button><span>第 {page} / {Math.max(1, Math.ceil(total / 60))} 页</span><button disabled={page * 60 >= total || syncState === "syncing"} onClick={() => loadRating(page + 1)}>下一页 →</button></div>}</section>
  </AppShell>;
}
