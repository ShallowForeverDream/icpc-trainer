"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AppShell, Icon } from "../components/AppShell";
import { contestTemplates, templateCategories } from "./data";

export default function TemplatesPage() {
  const [category, setCategory] = useState<(typeof templateCategories)[number]>("全部");
  const [query, setQuery] = useState("");
  const [copied, setCopied] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    return contestTemplates.filter((template) => {
      const categoryMatches = category === "全部" || template.category === category;
      const text = [template.name, template.cn, template.category, template.summary, ...template.bestFor].join(" ").toLowerCase();
      return categoryMatches && (!keyword || text.includes(keyword));
    });
  }, [category, query]);

  async function copyTemplate(slug: string, code: string) {
    await navigator.clipboard.writeText(code);
    setCopied(slug);
    window.setTimeout(() => setCopied((current) => current === slug ? null : current), 1600);
  }

  return <AppShell active="模板库">
    <section className="template-library-head">
      <div><span className="eyebrow">GNU C++20 · 0 下标 · 半开区间</span><h1>竞赛模板</h1><p>按比赛使用频率筛选，打开后在独立大屏页面阅读、复制。</p></div>
      <div className="template-library-stats"><strong>{contestTemplates.length}</strong><span>份精选模板</span><i /> <b>{contestTemplates.filter((template) => template.priority === "高频").length}</b><span>份高频</span></div>
    </section>

    <section className="template-library-toolbar">
      <label className="template-search"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索：最短路、区间、字符串……" /></label>
      <div className="category-tabs" aria-label="模板分类">{templateCategories.map((item) => <button type="button" key={item} className={category === item ? "active" : ""} onClick={() => setCategory(item)}>{item}</button>)}</div>
      <span className="template-result-count">{filtered.length} 个结果</span>
    </section>

    {filtered.length ? <section className="template-grid template-quick-grid">
      {filtered.map((template, index) => <article className="template-card template-quick-card" key={template.slug}>
        <div className="template-card-top">
          <span className="template-icon">{template.shortCode}</span>
          <div className="template-card-labels"><span>{template.category}</span><span className={`priority-${template.priority}`}>{template.priority}</span></div>
        </div>
        <div className="template-card-title"><span>{String(index + 1).padStart(2, "0")}</span><div><h2>{template.cn}</h2><code>{template.name}</code></div></div>
        <p>{template.summary}</p>
        <div className="template-use-list">{template.bestFor.slice(0, 3).map((use) => <span key={use}>{use}</span>)}</div>
        <div className="template-meta"><span><small>复杂度</small><b>{template.complexity}</b></span><span><small>接口</small><b>{template.apis.length} 个</b></span></div>
        <div className="template-actions">
          <Link href={`/templates/${template.slug}`}>打开模板 <span>→</span></Link>
          <button type="button" onClick={() => void copyTemplate(template.slug, template.code)}>{copied === template.slug ? <><Icon name="check" /> 已复制</> : "快速复制"}</button>
        </div>
      </article>)}
    </section> : <section className="template-empty"><Icon name="search" /><h2>没有匹配的模板</h2><p>尝试搜索“图论”“区间”或切换分类。</p></section>}

    <section className="template-quality compact-template-quality"><span><b>统一约定</b> 0 下标、[l, r)、long long</span><span><b>中文注释</b> 只解释关键状态与易错边界</span><span><b>比赛优先</b> 接口短、复制后容易改造</span></section>
  </AppShell>;
}
