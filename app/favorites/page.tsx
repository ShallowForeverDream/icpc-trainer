"use client";

import { useEffect, useState } from "react";
import { AppShell, Icon, ProblemRow } from "../components/AppShell";
import { curatedProblems } from "../data/problems";
import { browserApiUrl } from "../lib/browser-api";

type FavoriteProblem = { code: string; title: string; titleZh?: string; rating: number; tags: string[] };

export default function FavoritesPage() {
  const [items, setItems] = useState<FavoriteProblem[]>([]);
  useEffect(() => {
    const codes = JSON.parse(localStorage.getItem("icpc-trainer-favorites") ?? "[]") as string[];
    Promise.all(codes.map(async (code) => {
      const curated = curatedProblems.find((problem) => problem.code === code);
      if (curated) return curated;
      try {
        const response = await fetch(browserApiUrl(`/codeforces/problems?scope=single&code=${encodeURIComponent(code)}`));
        const data = await response.json();
        return data.problem as FavoriteProblem | undefined;
      } catch { return undefined; }
    })).then((problems) => setItems(problems.filter(Boolean) as FavoriteProblem[]));
  }, []);

  function clearFavorites() {
    localStorage.removeItem("icpc-trainer-favorites");
    setItems([]);
  }

  return <AppShell active="收藏"><section className="library-hero"><div><span className="eyebrow"><span className="live-dot" /> DEVICE-SAVED PROBLEMS</span><h1>收藏夹</h1><p>收藏默认保存在当前浏览器，不会上传代码或读取 Codeforces 凭据。</p></div>{items.length > 0 && <button className="button button-ghost" onClick={clearFavorites}>清空收藏</button>}</section><section className="panel curated-list"><div className="panel-head"><div><span className="micro-label">LOCAL COLLECTION</span><h2>稍后训练</h2></div><span className="calendar-total">{items.length} 道题</span></div>{items.length ? <div className="problem-list">{items.map((problem, index) => <ProblemRow key={problem.code} problem={problem} index={index + 1} />)}</div> : <div className="empty-state"><Icon name="star" /><h3>还没有收藏题目</h3><p>进入题库，打开题目后点击「收藏」。</p><a className="button button-primary" href="/problem">浏览题库</a></div>}</section></AppShell>;
}
