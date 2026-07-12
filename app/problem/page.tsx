"use client";

import { useMemo, useState } from "react";
import { AppShell, Icon, ProblemRow } from "../components/AppShell";
import { curatedProblems } from "../data/problems";

type SyncState = "idle" | "syncing" | "live" | "fallback";

export default function ProblemLibraryPage() {
  const [query, setQuery] = useState("");
  const [rating, setRating] = useState("全部");
  const [problems, setProblems] = useState(curatedProblems);
  const [syncState, setSyncState] = useState<SyncState>("idle");

  const filtered = useMemo(() => problems.filter((problem) => {
    const matchesQuery = `${problem.code} ${problem.title} ${problem.titleZh} ${problem.tags.join(" ")}`.toLowerCase().includes(query.toLowerCase());
    const matchesRating = rating === "全部" || (rating === "≤1200" ? problem.rating <= 1200 : rating === "1300–1500" ? problem.rating >= 1300 && problem.rating <= 1500 : problem.rating >= 1600);
    return matchesQuery && matchesRating;
  }), [problems, query, rating]);

  async function syncProblems() {
    setSyncState("syncing");
    try {
      const response = await fetch("/api/codeforces/problems", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "同步失败");
      setProblems(data.problems);
      setSyncState(data.source === "codeforces" ? "live" : "fallback");
    } catch {
      setSyncState("fallback");
    }
  }

  return <AppShell active="题库">
    <section className="library-hero">
      <div><span className="eyebrow"><span className="live-dot" /> FIRST CURATED SET / 20</span><h1>中文题库，<em>从经典题开始。</em></h1><p>首批 20 道 Codeforces 精选题已完成中文结构化导入；评分、标签和英文题名可从官方公开 API 校准。</p></div>
      <button className="button button-primary" onClick={syncProblems} disabled={syncState === "syncing"}><Icon name="history" /> {syncState === "syncing" ? "正在同步…" : syncState === "live" ? "已同步官方题库" : "同步 Codeforces"}</button>
    </section>
    <div className={`sync-banner sync-${syncState}`}>
      <span>{syncState === "live" ? "官方数据已校准" : syncState === "fallback" ? "官方接口暂不可用，正在使用内置精选题数据" : "精选题数据已就绪"}</span>
      <small>公开题库接口无需 API Key · 中文内容为独立整理的题意说明</small>
    </div>
    <section className="library-toolbar">
      <div className="template-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索题号、中文题名、标签…" /></div>
      <div className="category-tabs">{["全部", "≤1200", "1300–1500", "≥1600"].map((item) => <button key={item} className={rating === item ? "active" : ""} onClick={() => setRating(item)}>{item}</button>)}</div>
    </section>
    <section className="panel curated-list">
      <div className="panel-head"><div><span className="micro-label">CURATED PROBLEMSET</span><h2>精选训练集</h2></div><span className="calendar-total">显示 <b>{filtered.length}</b> / 20</span></div>
      <div className="problem-list">{filtered.map((problem, index) => <ProblemRow key={problem.code} problem={problem} index={index + 1} />)}</div>
      {filtered.length === 0 && <div className="empty-state"><Icon name="search" /><h3>没有匹配的题目</h3><p>换一个关键词或难度区间试试。</p></div>}
    </section>
  </AppShell>;
}
