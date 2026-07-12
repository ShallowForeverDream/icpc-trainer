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
    ["模板库", "/templates", "code"], ["提交记录", "/submissions", "history"], ["提交扩展", "/extension", "spark"], ["收藏", "/favorites", "star"],
  ];
  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <a className="brand" href="/"><span className="brand-mark"><i /><i /><i /></span><span>icpc-<em>trainer</em></span></a>
        <nav>
          <p>WORKSPACE</p>
          {nav.map(([label, href, icon]) => <a key={label} href={href} className={active === label ? "active" : ""}><Icon name={icon} /><span>{label}</span>{active === label && <i className="nav-indicator" />}</a>)}
          <p>NEXT</p>
          <a href="/extension"><Icon name="book" /><span>扩展安装指南</span></a>
        </nav>
        <div className="sidebar-card"><span>CF</span><div><small>CODEFORCES API</small><b>公开题库可用</b><em>● 无需 API Key</em></div></div>
        <a className="profile-mini" href="/submissions"><span>S2</span><div><b>ShallowDream2</b><small>同步公开提交记录</small></div><Icon name="chevron" /></a>
      </aside>
      <main>
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-label="打开菜单">☰</button>
          <div className="crumb"><span>icpc-trainer</span><i>/</i><b>{active}</b></div>
          <div className="top-actions">
            <a className="command-search" href="/problem"><Icon name="search" /><span>搜索题目与 Rating 题库</span><kbd>⌘ K</kbd></a>
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

export function ProblemRow({ problem, index }: { problem: { code: string; title: string; titleZh?: string; rating: number; tags: string[]; status?: string }; index: number }) {
  return <a className="problem-row" href={`/problem/${problem.code.replace("CF ", "")}`}><span className="problem-index">{String(index).padStart(2, "0")}</span><div className="problem-main"><span>{problem.code}</span><b>{problem.titleZh ? `${problem.titleZh} · ${problem.title}` : problem.title}</b><div>{problem.tags.map(tag => <Pill key={tag}>{tag}</Pill>)}</div></div><div className="rating"><small>RATING</small><b>{problem.rating}</b></div><span className="problem-arrow">→</span></a>;
}
