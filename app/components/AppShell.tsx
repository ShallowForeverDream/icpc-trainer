"use client";

import { ReactNode, useState } from "react";

export function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = { grid: "▦", search: "⌕", trophy: "♜", code: "⌘", history: "↻", star: "☆", play: "▶", fire: "♨", clock: "◷", shuffle: "⤨", spark: "✦", bell: "◉", chevron: "›", check: "✓", lock: "▣", team: "♟", book: "▤", filter: "≡" };
  return <span className={`icon icon-${name}`} aria-hidden="true">{icons[name] ?? "·"}</span>;
}

export function AppShell({ children, active }: { children: ReactNode; active: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const nav = [
    ["训练台", "/", "grid"], ["题库", "/problem", "search"], ["模拟赛", "/vp", "trophy"],
    ["模板库", "/templates", "code"], ["提交记录", "/submissions", "history"], ["收藏", "/favorites", "star"],
  ];
  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <a className="brand" href="/"><span className="brand-mark"><i /><i /><i /></span><span>ICPC<em>LAB</em></span></a>
        <nav>
          <p>WORKSPACE</p>
          {nav.map(([label, href, icon]) => <a key={label} href={href} className={active === label ? "active" : ""}><Icon name={icon} /><span>{label}</span>{active === label && <i className="nav-indicator" />}</a>)}
          <p>COMMUNITY</p>
          <a href="#"><Icon name="team" /><span>队伍</span><b className="nav-badge">3</b></a>
          <a href="#"><Icon name="book" /><span>讨论</span></a>
        </nav>
        <div className="sidebar-card"><span>CF</span><div><small>CODEFORCES</small><b>ShallowDream</b><em>● 已同步</em></div></div>
        <a className="profile-mini" href="#"><span>SD</span><div><b>ShallowDream</b><small>Rating 1642</small></div><Icon name="chevron" /></a>
      </aside>
      <main>
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="打开菜单">☰</button>
          <div className="crumb"><span>ICPC LAB</span><i>/</i><b>{active}</b></div>
          <div className="top-actions">
            <button className="command-search"><Icon name="search" /><span>搜索题目、比赛、模板</span><kbd>⌘ K</kbd></button>
            <button className="icon-button" aria-label="通知"><Icon name="bell" /><i /></button>
            <a className="quick-button" href="/vp">＋ 创建 VP</a>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
    </div>
  );
}

export function MetricCard({ label, value, delta, tone }: { label: string; value: string; delta: string; tone: string }) {
  return <div className={`metric-card tone-${tone}`}><div><span>{label}</span><b>{value}</b></div><em>{delta}</em><i /></div>;
}

export function Pill({ children }: { children: ReactNode }) { return <span className="pill">{children}</span>; }

export function ProblemRow({ problem, index }: { problem: { code: string; title: string; rating: number; tags: string[]; status: string }; index: number }) {
  return <a className="problem-row" href="/problem"><span className="problem-index">0{index}</span><div className="problem-main"><span>{problem.code}</span><b>{problem.title}</b><div>{problem.tags.map(tag => <Pill key={tag}>{tag}</Pill>)}</div></div><div className="rating"><small>RATING</small><b>{problem.rating}</b></div><span className="problem-arrow">→</span></a>;
}
