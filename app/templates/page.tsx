"use client";

import { useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";

const templates = [
  ["DSU", "并查集", "数据结构", "O(α(n))", "维护不相交集合，支持路径压缩和按秩合并。"],
  ["FenwickTree", "树状数组", "数据结构", "O(log n)", "单点修改、前缀查询，0 下标半开区间接口。"],
  ["LazySegmentTree", "懒标记线段树", "数据结构", "O(log n)", "区间修改与区间查询的泛型竞赛实现。"],
  ["Dijkstra", "最短路", "图论", "O((V+E)log V)", "非负权图单源最短路，返回距离和前驱。"],
  ["Dinic", "最大流", "图论", "O(V²E)", "分层图与当前弧优化的 Dinic 最大流。"],
  ["AhoCorasick", "AC 自动机", "字符串", "O(Σ|s|)", "多模式串匹配，包含 fail 指针与出现统计。"],
];

export default function TemplatesPage() {
  const [category, setCategory] = useState("全部");
  const [copied, setCopied] = useState<string | null>(null);
  const filtered = category === "全部" ? templates : templates.filter(x=>x[2]===category);
  return <AppShell active="模板库">
    <section className="library-hero"><div><span className="eyebrow"><span className="live-dot" /> GNU C++20 / 0-INDEXED</span><h1>竞赛模板，<em>即取即用。</em></h1><p>所有官方模板使用 class 封装，经过编译、边界测试与随机对拍。</p></div><button className="button button-primary">＋ 新建个人模板</button></section>
    <section className="library-toolbar"><div className="template-search"><Icon name="search" /><input placeholder="搜索算法、数据结构或 API…" /></div><div className="category-tabs">{["全部","数据结构","图论","数学","字符串"].map(x=><button key={x} className={category===x?"active":""} onClick={()=>setCategory(x)}>{x}</button>)}</div></section>
    <section className="template-grid">
      {filtered.map(([name,cn,cat,complexity,desc])=><article className="template-card" key={name}>
        <div className="template-card-top"><span className={`template-icon cat-${cat}`}>{name.slice(0,2).toUpperCase()}</span><div><Pill>{cat}</Pill><Pill>OFFICIAL</Pill></div></div>
        <h2>{name}</h2><h3>{cn}</h3><p>{desc}</p>
        <div className="template-meta"><span><small>复杂度</small><b>{complexity}</b></span><span><small>版本</small><b>v1.2.0</b></span></div>
        <div className="template-actions"><button onClick={()=>setCopied(name)}>{copied===name?<><Icon name="check" /> 已复制</>:"复制代码"}</button><button>查看 API →</button></div>
      </article>)}
    </section>
    <section className="template-quality"><div><Icon name="check" /><span><b>32 个官方模板</b><small>全部通过 GNU C++20 编译</small></span></div><div><Icon name="check" /><span><b>1,284 组测试</b><small>包含随机对拍与边界数据</small></span></div><div><Icon name="check" /><span><b>依赖自动合并</b><small>插入前检查命名冲突</small></span></div></section>
  </AppShell>;
}
