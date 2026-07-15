"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell, Icon } from "../../components/AppShell";
import { contestTemplates, findContestTemplate } from "../data";

function CodeLine({ line, number }: { line: string; number: number }) {
  const commentAt = line.indexOf("//");
  return <span className="template-code-line"><i>{number}</i><code>{commentAt < 0 ? (line || " ") : <>{line.slice(0, commentAt)}<em>{line.slice(commentAt)}</em></>}</code></span>;
}

export default function TemplateDetailPage() {
  const params = useParams<{ slug: string }>();
  const template = findContestTemplate(String(params.slug || ""));
  const [copied, setCopied] = useState(false);

  if (!template) return <AppShell active="模板库"><section className="template-not-found"><h1>模板不存在</h1><Link className="button button-primary" href="/templates">返回模板库</Link></section></AppShell>;

  const currentIndex = contestTemplates.findIndex((item) => item.slug === template.slug);
  const previous = contestTemplates[(currentIndex - 1 + contestTemplates.length) % contestTemplates.length];
  const next = contestTemplates[(currentIndex + 1) % contestTemplates.length];

  async function copyCode() {
    await navigator.clipboard.writeText(template!.code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return <AppShell active="模板库">
    <header className="template-detail-head">
      <Link href="/templates">← 返回模板库</Link>
      <div><span className="template-detail-icon">{template.shortCode}</span><div><div className="template-detail-labels"><span>{template.category}</span><span>{template.priority}</span><span>{template.complexity}</span></div><h1>{template.cn}</h1><code>{template.name}</code><p>{template.summary}</p></div></div>
    </header>

    <section className="template-detail-layout">
      <aside className="template-reference-panel">
        <button className="template-copy-main" type="button" onClick={() => void copyCode()}>{copied ? <><Icon name="check" /> 已复制完整代码</> : <><Icon name="code" /> 复制完整代码</>}</button>

        <div><h2>最适合</h2><ul>{template.bestFor.map((item) => <li key={item}>{item}</li>)}</ul></div>
        <div><h2>接口速查</h2><dl>{template.apis.map((api) => <div key={api.signature}><dt>{api.signature}</dt><dd>{api.description}</dd></div>)}</dl></div>
        <div><h2>使用约定</h2><ul>{template.notes.map((item) => <li key={item}>{item}</li>)}</ul></div>

        <nav className="template-detail-nav"><Link href={`/templates/${previous.slug}`}><small>上一个</small><b>← {previous.cn}</b></Link><Link href={`/templates/${next.slug}`}><small>下一个</small><b>{next.cn} →</b></Link></nav>
      </aside>

      <article className="template-code-panel">
        <div className="template-code-toolbar"><div><span>C++20</span><b>{template.code.split("\n").length} 行</b><small>可横向滚动</small></div><button type="button" onClick={() => void copyCode()}>{copied ? "已复制 ✓" : "复制代码"}</button></div>
        <div className="template-code-block" role="region" aria-label={`${template.cn} C++ 代码`} tabIndex={0}><pre>{template.code.split("\n").map((line, index) => <CodeLine key={`${index}-${line}`} line={line} number={index + 1} />)}</pre></div>
      </article>
    </section>
  </AppShell>;
}
