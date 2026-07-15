"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppShell, Icon } from "../../../../components/AppShell";
import { archivePracticeProblem, findArchiveContest } from "../../../../data/archive-contests";
import { loadPersistentJson, savePersistentJson } from "../../../../lib/persistent-state";
import { readStoredJson, readStoredString, writeStoredJson, writeStoredString } from "../../../../lib/storage";

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

export default function ArchiveProblemPage() {
  const params = useParams<{ contestId: string; slot: string }>();
  const contestId = decodeURIComponent(String(params.contestId || ""));
  const slot = decodeURIComponent(String(params.slot || "A")).toUpperCase();
  const contest = findArchiveContest(contestId);
  const problem = contest && /^[A-Z]$/.test(slot) ? archivePracticeProblem(contest, slot) : null;
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

  const statementUrl = useMemo(() => {
    if (!problem) return "";
    return language === "chinese" && problem.chineseStatementUrl
      ? `${problem.chineseStatementUrl}#page=1&view=FitH`
      : `${problem.statementUrl}#view=FitH`;
  }, [language, problem]);

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
        <h1><b>{slot}</b>{problem.title}</h1>
        <p>{contest.name} · 官方题面直接在本站阅读</p>
      </div>
      <nav>
        {problemIndex > 0 ? <Link href={`/vp/archive/${contest.id}/${previous}`}>← {previous}</Link> : <span />}
        {problemIndex < slots.length - 1 ? <Link href={`/vp/archive/${contest.id}/${next}`}>{next} →</Link> : <span />}
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
      <article className="archive-pdf-panel">
        <div><b>{language === "chinese" ? "官方中文整场题册" : `Problem ${slot} · English`}</b><a href={statementUrl} target="_blank" rel="noreferrer">新窗口打开 ↗</a></div>
        <iframe title={`${contest.name} Problem ${slot} 题面`} src={statementUrl} />
      </article>
      <aside className="archive-code-panel">
        <div className="editor-head"><div><span className="active-dot" /> main.cpp</div><span>GNU C++20</span></div>
        <textarea className="code-editor" value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} aria-label="C++ 代码编辑器" />
        <div className="archive-submit-panel"><span>草稿已自动保存</span><button type="button" onClick={copyAndSubmit}>{copied ? "代码已复制 ✓" : "复制代码并打开提交页"}</button><small>提交页由 Universal Cup / QOJ 提供；代码已复制，粘贴后确认提交。</small></div>
      </aside>
    </section>
  </AppShell>;
}
