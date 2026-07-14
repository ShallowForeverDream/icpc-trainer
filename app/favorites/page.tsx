"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AppShell, Icon, ProblemRow } from "../components/AppShell";
import { curatedProblems } from "../data/problems";
import { apiJson } from "../lib/api-client";
import { clearPersistentJson, loadPersistentJson } from "../lib/persistent-state";
import { readStoredJson } from "../lib/storage";

type FavoriteProblem = { code: string; title: string; titleZh?: string; rating: number; tags: string[] };

export default function FavoritesPage() {
  const [items, setItems] = useState<FavoriteProblem[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const validate = (value: unknown): value is string[] => Array.isArray(value) && value.length <= 500 && value.every((item) => typeof item === "string");
    const local = readStoredJson<string[]>("icpc-trainer-favorites", [], validate);
    void loadPersistentJson("favorites", "icpc-trainer-favorites", local, validate).then((codes) => Promise.all(codes.map(async (code) => {
      const curated = curatedProblems.find((problem) => problem.code === code);
      if (curated) return curated;
      try {
        const data = await apiJson<{ problem?: FavoriteProblem }>(`/codeforces/problems?scope=single&code=${encodeURIComponent(code)}`, { signal: controller.signal });
        return data.problem as FavoriteProblem | undefined;
      } catch { return undefined; }
    }))).then((problems) => { if (!controller.signal.aborted) setItems(problems.filter(Boolean) as FavoriteProblem[]); }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  function clearFavorites() {
    void clearPersistentJson("favorites", "icpc-trainer-favorites");
    setItems([]);
  }

  return <AppShell active="收藏"><section className="library-hero"><div><span className="eyebrow"><span className="live-dot" /> ACCOUNT-SAVED PROBLEMS</span><h1>收藏夹</h1><p>收藏会持久保存到训练账号；未登录时仍以当前设备标识同步。</p></div>{items.length > 0 ? <button className="button button-ghost" onClick={clearFavorites}>清空收藏</button> : null}</section><section className="panel curated-list"><div className="panel-head"><div><span className="micro-label">PERSISTENT COLLECTION</span><h2>稍后训练</h2></div><span className="calendar-total">{items.length} 道题</span></div>{items.length ? <div className="problem-list">{items.map((problem, index) => <ProblemRow key={problem.code} problem={problem} index={index + 1} />)}</div> : loading ? <div className="loading-panel">正在读取收藏…</div> : <div className="empty-state"><Icon name="star" /><h3>还没有收藏题目</h3><p>进入题库，打开题目后点击「收藏」。</p><Link className="button button-primary" href="/problem">浏览题库</Link></div>}</section></AppShell>;
}
