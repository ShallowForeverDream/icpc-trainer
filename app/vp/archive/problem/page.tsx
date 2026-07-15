"use client";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, Icon } from "../../../components/AppShell";
import { archivePracticeProblem, findArchiveContest } from "../../../data/archive-contests";
import { ArchiveExtractedStatement, ArchiveStatementBlock, loadArchiveStatement } from "../../../lib/archive-statement-client";
import { loadPersistentJson, savePersistentJson } from "../../../lib/persistent-state";
import { readStoredJson, readStoredString, writeStoredJson, writeStoredString } from "../../../lib/storage";

type Attempt = { wrong: number; solvedAt?: number };
type ArchiveSession = {
  contestId: string;
  startedAt?: number;
  reveal: boolean;
  group: string;
  myTeam: string;
  attempts: Record<string, Attempt>;
};

const SESSION_KEY = "icpc-trainer-archive-vp";
const starterCode = `#include <bits/stdc++.h>
using namespace std;

using i64 = long long;

void solve() {
    
}

int main() {
    ios::sync_with_stdio(false);
    cin.tie(nullptr);

    int tests = 1;
    // cin >> tests;
    while (tests--) solve();
    return 0;
}`;

function isArchiveSession(value: unknown): value is ArchiveSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ArchiveSession>;
  return typeof session.contestId === "string"
    && typeof session.reveal === "boolean"
    && typeof session.group === "string"
    && typeof session.myTeam === "string"
    && Boolean(session.attempts && typeof session.attempts === "object");
}

function StatementBlock({ block }: { block: ArchiveStatementBlock }) {
  if (block.kind === "bullets") return <ul>{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
  return <p>{block.text}</p>;
}

function ArchiveStatementView({ statement, language }: { statement: ArchiveExtractedStatement; language: "english" | "chinese" }) {
  const sections = statement[language].sections;
  const pages = statement.source.chinesePages[0] === statement.source.chinesePages[1]
    ? `${statement.source.chinesePages[0]}`
    : `${statement.source.chinesePages[0]}–${statement.source.chinesePages[1]}`;
  return <article className="archive-statement-panel">
    <header className="archive-statement-toolbar">
      <div><b>结构化题面</b><span>正文与图片已从官方 PDF 提取</span></div>
      <nav>
        <a href={statement.source.englishPdfUrl} target="_blank" rel="noreferrer">下载英文原始 PDF ↓</a>
        <a href={statement.source.chinesePdfUrl} target="_blank" rel="noreferrer">下载中文原始 PDF ↓</a>
      </nav>
    </header>
    <div className="statement-body full-statement archive-extracted-statement">
      <div className="statement-facts">
        <span><b>{statement.timeLimitText}</b>{language === "chinese" ? "时间限制" : "Time limit"}</span>
        <span><b>{statement.memoryLimitText}</b>{language === "chinese" ? "内存限制" : "Memory limit"}</span>
        <span><b>{language === "chinese" ? `官方中文题册 ${pages} 页` : "Official PDF"}</b>{language === "chinese" ? "题面来源" : "Statement source"}</span>
      </div>
      {sections.map((section) => <section className={`archive-statement-section section-${section.key}`} key={section.key}>
        <h2>{section.title}</h2>
        {section.blocks.map((block, index) => <StatementBlock block={block} key={`${section.key}-${index}`} />)}
      </section>)}
      {statement.images.length ? <section className="archive-statement-section archive-figures">
        <h2>{language === "chinese" ? "题目配图" : "Figures"}</h2>
        {statement.images.map((figure) => <figure key={figure.src}>
          <img src={figure.src} alt={language === "chinese" ? figure.captionZh : figure.captionEn} />
          <figcaption>{language === "chinese" ? figure.captionZh : figure.captionEn}</figcaption>
          {language === "chinese" && figure.imageTextZh ? <p className="image-translation"><b>图片文字翻译</b>{figure.imageTextZh}</p> : null}
        </figure>)}
      </section> : null}
      {statement.sample ? <section className="archive-statement-section">
        <h2>{language === "chinese" ? "样例" : "Example"}</h2>
        <div className={`samples statement-sample${statement.sample.output ? "" : " transcript"}`}>
          <div><b>{statement.sample.mode === "transcript" ? (language === "chinese" ? "交互记录" : "Transcript") : (language === "chinese" ? "样例输入" : "Input")}</b><pre>{statement.sample.input}</pre></div>
          {statement.sample.output ? <div><b>{language === "chinese" ? "样例输出" : "Output"}</b><pre>{statement.sample.output}</pre></div> : null}
        </div>
      </section> : null}
      <div className="source-callout"><b>{language === "chinese" ? "官方中文题面" : "Official statement"}</b><p>{language === "chinese" ? "正文、约束、样例与图片均提取自官方题册；可使用页面顶部链接下载原始 PDF 核对。" : "Text, constraints, samples, and figures were extracted from the official PDF. Use the download links above to verify the original file."}</p></div>
    </div>
  </article>;
}

export default function ArchiveProblemPage() {
  const searchParams = useSearchParams();
  const contestId = searchParams.get("contest") || "";
  const slot = (searchParams.get("slot") || "A").toUpperCase();
  const contest = findArchiveContest(contestId);
  const problem = contest && /^[A-Z]$/.test(slot) ? archivePracticeProblem(contest, slot) : null;
  const hasProblem = Boolean(problem);
  const problemIndex = slot.charCodeAt(0) - 65;
  const slots = contest ? Array.from({ length: contest.problemCount }, (_, index) => String.fromCharCode(65 + index)) : [];
  const previous = slots[Math.max(0, problemIndex - 1)];
  const next = slots[Math.min(slots.length - 1, problemIndex + 1)];
  const draftKey = `icpc-trainer-archive-draft:${contestId}:${slot}`;
  const [code, setCode] = useState(starterCode);
  const [draftReady, setDraftReady] = useState(false);
  const [language, setLanguage] = useState<"english" | "chinese">("english");
  const [attempt, setAttempt] = useState<Attempt>({ wrong: 0 });
  const [started, setStarted] = useState(false);
  const [copied, setCopied] = useState(false);
  const [statement, setStatement] = useState<ArchiveExtractedStatement | null>(null);
  const [statementError, setStatementError] = useState("");

  useEffect(() => {
    setDraftReady(false);
    const localDraft = readStoredString(draftKey, starterCode);
    setCode(localDraft);
    void loadPersistentJson(`archive-draft:${contestId}:${slot}`, `${draftKey}:sync`, localDraft, (value): value is string => typeof value === "string" && value.length <= 500_000).then((savedDraft) => {
      setCode(savedDraft);
      writeStoredString(draftKey, savedDraft);
      setDraftReady(true);
    });
    const session = readStoredJson<ArchiveSession | null>(SESSION_KEY, null, (value): value is ArchiveSession | null => value === null || isArchiveSession(value));
    setStarted(Boolean(session?.contestId === contestId && session.startedAt));
    setAttempt(session?.contestId === contestId ? session.attempts[slot] || { wrong: 0 } : { wrong: 0 });
  }, [contestId, draftKey, slot]);

  useEffect(() => {
    if (!draftReady) return;
    const timer = window.setTimeout(() => {
      writeStoredString(draftKey, code);
      void savePersistentJson(`archive-draft:${contestId}:${slot}`, `${draftKey}:sync`, code);
    }, 450);
    return () => window.clearTimeout(timer);
  }, [code, contestId, draftKey, draftReady, slot]);

  useEffect(() => {
    setStatement(null);
    setStatementError("");
    if (!hasProblem) return;
    void loadArchiveStatement(contestId, slot).then(setStatement).catch((error) => setStatementError(error instanceof Error ? error.message : "题面加载失败"));
  }, [contestId, hasProblem, slot]);

  function updateAttempt(action: "wrong" | "solve" | "reset") {
    const session = readStoredJson<ArchiveSession | null>(SESSION_KEY, null, (value): value is ArchiveSession | null => value === null || isArchiveSession(value));
    if (!session?.startedAt || session.contestId !== contestId) return;
    const current = session.attempts[slot] || { wrong: 0 };
    const attempts = { ...session.attempts };
    if (action === "reset") delete attempts[slot];
    else if (action === "wrong" && current.solvedAt === undefined) attempts[slot] = { ...current, wrong: current.wrong + 1 };
    else if (action === "solve" && current.solvedAt === undefined) attempts[slot] = { ...current, solvedAt: Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000)) };
    const updated = { ...session, attempts };
    writeStoredJson(SESSION_KEY, updated);
    void savePersistentJson("archive-vp", SESSION_KEY, updated);
    setAttempt(attempts[slot] || { wrong: 0 });
  }

  function copyAndSubmit() {
    if (!problem || !code.trim()) return;
    void navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    });
    window.open(problem.submitUrl, "_blank", "noopener,noreferrer");
  }

  if (!contest || !problem) return <AppShell active="模拟赛"><section className="template-not-found"><h1>暂未找到这道题</h1><Link className="button button-primary" href="/vp/archive">返回历届补题</Link></section></AppShell>;

  const solved = attempt.solvedAt !== undefined;
  return <AppShell active="模拟赛">
    <header className="archive-problem-head">
      <div>
        <Link href="/vp/archive">← 返回实时榜单</Link>
        <span>{contest.year} · {contest.type}</span>
        <h1><b>{slot}</b>{language === "chinese" && statement ? statement.titleZh : problem.title}</h1>
        <p>{contest.name} · 官方题面直接在本站阅读</p>
      </div>
      <nav>
        {problemIndex > 0 ? <Link href={`/vp/archive/problem?contest=${encodeURIComponent(contest.id)}&slot=${previous}`}>← {previous}</Link> : <span />}
        {problemIndex < slots.length - 1 ? <Link href={`/vp/archive/problem?contest=${encodeURIComponent(contest.id)}&slot=${next}`}>{next} →</Link> : <span />}
      </nav>
    </header>

    <section className="archive-solve-bar">
      <div className="language-switch">
        <button className={language === "english" ? "active" : ""} onClick={() => setLanguage("english")}>原题面 <small>EN</small></button>
        {problem.chineseStatementUrl ? <button className={language === "chinese" ? "active" : ""} onClick={() => setLanguage("chinese")}>官方中文 <small>ZH</small></button> : null}
      </div>
      <div className={`archive-attempt-state${solved ? " solved" : attempt.wrong ? " attempted" : ""}`}><span>{solved ? "已 AC" : attempt.wrong ? `${attempt.wrong} 次 WA` : "未尝试"}</span><button disabled={!started || solved} onClick={() => updateAttempt("wrong")}>+ WA</button><button disabled={!started || solved} onClick={() => updateAttempt("solve")}>标记 AC</button>{solved || attempt.wrong ? <button onClick={() => updateAttempt("reset")}>重置</button> : null}</div>
    </section>

    {!started ? <div className="archive-start-notice"><Icon name="clock" /><span>题面和编辑器可以直接使用；如需计入实时排名，请先返回榜单点击「开始 VP」。</span><Link href="/vp/archive">返回开始 VP →</Link></div> : null}

    <section className="archive-solving-workspace">
      {statement ? <ArchiveStatementView statement={statement} language={language} /> : <article className="archive-statement-panel archive-statement-loading"><div className="statement-loader" /><h2>{statementError || "正在读取结构化题面"}</h2><p>{statementError ? "当前仍可下载官方原始 PDF 核对题面。" : "正文和图片已经持久化，首次进入只需读取本站文件。"}</p><div className="hero-actions"><a className="button button-ghost" href={problem.statementUrl} target="_blank" rel="noreferrer">下载英文原始 PDF ↓</a>{problem.chineseStatementUrl ? <a className="button button-ghost" href={problem.chineseStatementUrl} target="_blank" rel="noreferrer">下载中文原始 PDF ↓</a> : null}</div></article>}
      <aside className="archive-code-panel">
        <div className="editor-head"><div><span className="active-dot" /> main.cpp</div><span>GNU C++20</span></div>
        <textarea className="code-editor" value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} aria-label="C++ 代码编辑器" />
        <div className="archive-submit-panel"><span>草稿已自动保存</span><button type="button" onClick={copyAndSubmit}>{copied ? "代码已复制 ✓" : "复制代码并打开提交页"}</button><small>提交页由 Universal Cup / QOJ 提供；代码已复制，粘贴后确认提交。</small></div>
      </aside>
    </section>
  </AppShell>;
}
