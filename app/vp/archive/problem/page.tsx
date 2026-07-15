"use client";
/* eslint-disable react-hooks/set-state-in-effect, @next/next/no-img-element */

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChangeEvent, useEffect, useRef, useState } from "react";
import { AppShell, Icon } from "../../../components/AppShell";
import { ArchiveContest, archivePracticeProblem, findArchiveContest } from "../../../data/archive-contests";
import {
  ArchiveExtractedStatement,
  ArchiveStatementBlock,
  ArchiveStatementPendingError,
  loadArchiveStatement,
} from "../../../lib/archive-statement-client";
import { ARCHIVE_SESSION_EVENT } from "../../../lib/archive-vp-session";
import { savePersistentJson } from "../../../lib/persistent-state";
import { createSubmissionRequestId, recordPlatformSubmission, updatePlatformSubmission } from "../../../lib/platform-submissions";
import { readStoredJson, writeStoredJson } from "../../../lib/storage";

type Attempt = { wrong: number; solvedAt?: number };
type ArchiveSubmission = { id: string; slot: string; verdict: "WA" | "AC"; atSeconds: number };
type ArchiveSession = {
  contestId: string;
  startedAt?: number;
  reveal: boolean;
  group: string;
  myTeam: string;
  attempts: Record<string, Attempt>;
  submissions?: ArchiveSubmission[];
};

type SubmitLanguage = { value: string; label: string; extensions: string[] };

const SESSION_KEY = "icpc-trainer-archive-vp";
const SUBMIT_LANGUAGES: SubmitLanguage[] = [
  { value: "C++20", label: "GNU C++20", extensions: ["cpp", "cc", "cxx"] },
  { value: "C++23", label: "GNU C++23", extensions: ["cpp", "cc", "cxx"] },
  { value: "C++17", label: "GNU C++17", extensions: ["cpp", "cc", "cxx"] },
  { value: "C11", label: "GNU C11", extensions: ["c"] },
  { value: "PyPy3", label: "PyPy 3", extensions: ["py"] },
  { value: "Python3", label: "Python 3", extensions: ["py"] },
  { value: "Java21", label: "Java 21", extensions: ["java"] },
  { value: "Java17", label: "Java 17", extensions: ["java"] },
  { value: "Kotlin", label: "Kotlin", extensions: ["kt", "kts"] },
  { value: "Rust", label: "Rust", extensions: ["rs"] },
];

function isArchiveSession(value: unknown): value is ArchiveSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Partial<ArchiveSession>;
  return typeof session.contestId === "string"
    && typeof session.reveal === "boolean"
    && typeof session.group === "string"
    && typeof session.myTeam === "string"
    && Boolean(session.attempts && typeof session.attempts === "object");
}

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function CopySampleButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return <button type="button" className="sample-copy" onClick={() => {
    void copyText(value).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }}>{copied ? "已复制 ✓" : label}</button>;
}

function StatementBlock({ block }: { block: ArchiveStatementBlock }) {
  if (block.kind === "bullets") return <ul>{block.items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
  return <p>{block.text}</p>;
}

function ArchiveStatementView({ statement, language }: { statement: ArchiveExtractedStatement; language: "english" | "chinese" }) {
  const sections = statement[language].sections;
  const pages = statement.source.chinesePages
    ? statement.source.chinesePages[0] === statement.source.chinesePages[1]
      ? `${statement.source.chinesePages[0]}`
      : `${statement.source.chinesePages[0]}–${statement.source.chinesePages[1]}`
    : "";
  const isOfficialChinese = language === "chinese" && Boolean(statement.source.chinesePdfUrl);
  return <article className="archive-statement-panel">
    <header className="archive-statement-toolbar">
      <div><b>结构化题面</b><span>正文、样例与图片已从官方 PDF 提取</span></div>
      <nav>
        <a href={statement.source.englishPdfUrl} target="_blank" rel="noreferrer">下载原始 PDF ↓</a>
        {statement.source.chinesePdfUrl ? <a href={statement.source.chinesePdfUrl} target="_blank" rel="noreferrer">下载中文原始 PDF ↓</a> : null}
      </nav>
    </header>
    <div className="statement-body full-statement archive-extracted-statement">
      <div className="statement-facts">
        <span><b>{statement.timeLimitText || "以原题为准"}</b>{language === "chinese" ? "时间限制" : "Time limit"}</span>
        <span><b>{statement.memoryLimitText || "以原题为准"}</b>{language === "chinese" ? "内存限制" : "Memory limit"}</span>
        <span><b>{isOfficialChinese ? `官方中文题册${pages ? ` ${pages} 页` : ""}` : language === "chinese" ? "本站中文翻译" : "Official PDF"}</b>{language === "chinese" ? "题面来源" : "Statement source"}</span>
      </div>
      {sections.map((section) => <section className={`archive-statement-section section-${section.key}`} key={section.key}>
        <h2>{section.title}</h2>
        {section.blocks.map((block, index) => <StatementBlock block={block} key={`${section.key}-${index}`} />)}
      </section>)}
      {statement.images.length ? <section className="archive-statement-section archive-figures">
        <h2>{language === "chinese" ? "题目配图" : "Figures"}</h2>
        {statement.images.map((figure) => <figure key={figure.src || figure.assetId}>
          <img src={figure.src} alt={language === "chinese" ? figure.captionZh : figure.captionEn} />
          <figcaption>{language === "chinese" ? figure.captionZh : figure.captionEn}</figcaption>
          {language === "chinese" && figure.imageTextZh ? <p className="image-translation"><b>图片文字翻译</b>{figure.imageTextZh}</p> : null}
        </figure>)}
      </section> : null}
      {statement.sample ? <section className="archive-statement-section archive-sample-section">
        <h2>{language === "chinese" ? "样例" : "Example"}</h2>
        <div className={`samples statement-sample${statement.sample.output ? "" : " transcript"}`}>
          <div>
            <header><b>{statement.sample.mode === "transcript" ? (language === "chinese" ? "交互记录" : "Transcript") : (language === "chinese" ? "样例输入" : "Input")}</b><CopySampleButton value={statement.sample.input} label="复制输入" /></header>
            <pre>{statement.sample.input}</pre>
          </div>
          {statement.sample.output ? <div>
            <header><b>{language === "chinese" ? "样例输出" : "Output"}</b><CopySampleButton value={statement.sample.output} label="复制输出" /></header>
            <pre>{statement.sample.output}</pre>
          </div> : null}
        </div>
      </section> : null}
      <div className="source-callout"><b>{isOfficialChinese ? "官方中文题面" : language === "chinese" ? "持久化中文题面" : "Official statement"}</b><p>{isOfficialChinese ? "正文、约束、样例与图片均提取自官方题册。" : language === "chinese" ? "译文首次生成后保存在服务器数据库中；公式、样例和图片保持原样。" : "Text, constraints, samples, and figures were extracted from the official PDF."}</p></div>
    </div>
  </article>;
}

function ArchiveSubmitDialog({ contest, currentSlot, slots, onClose }: { contest: ArchiveContest; currentSlot: string; slots: string[]; onClose: () => void }) {
  const [selectedSlot, setSelectedSlot] = useState(currentSlot);
  const [languageValue, setLanguageValue] = useState("C++20");
  const [sourceCode, setSourceCode] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [extensionReady, setExtensionReady] = useState(false);
  const requestIdRef = useRef("");

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin) return;
      if (event.data?.source !== "icpc-trainer-extension") return;
      if (event.data.type === "ICPC_TRAINER_PONG") {
        const current = event.data.version === "0.8.0";
        setExtensionReady(current);
        if (!current) setStatus("检测到旧版扩展，请下载 v0.8 并在扩展管理页重新加载");
      }
      if (event.data.type === "ICPC_TRAINER_SUBMIT_RESULT" && event.data.requestId === requestIdRef.current) {
        const stage = event.data.stage as "queued" | "submitted" | "failed" | "needs_login";
        const message = typeof event.data.message === "string" ? event.data.message : "提交状态已更新";
        setStatus(message);
        if (["queued", "submitted", "failed", "needs_login"].includes(stage)) void updatePlatformSubmission(event.data.requestId, stage, message);
      }
    };
    window.addEventListener("message", listener);
    window.postMessage({ source: "icpc-trainer", type: "ICPC_TRAINER_PING" }, window.location.origin);
    return () => window.removeEventListener("message", listener);
  }, []);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setError("");
    setStatus("");
    if (!file) {
      setFileName("");
      setSourceCode("");
      return;
    }
    if (file.size > 500_000) {
      setError("代码文件不能超过 500 KB");
      event.target.value = "";
      return;
    }
    const text = await file.text();
    if (!text.trim()) {
      setError("代码文件内容为空");
      return;
    }
    setFileName(file.name);
    setSourceCode(text);
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const guessed = SUBMIT_LANGUAGES.find((item) => item.extensions.includes(extension));
    if (guessed) setLanguageValue(guessed.value);
  }

  async function submit() {
    setError("");
    setStatus("");
    if (!sourceCode.trim()) return setError("请选择代码文件或直接粘贴代码");
    const problem = archivePracticeProblem(contest, selectedSlot);
    if (!problem || !contest.qojContestId) return setError("这道题暂时没有可用的评测入口");
    const selectedLanguage = SUBMIT_LANGUAGES.find((item) => item.value === languageValue) || SUBMIT_LANGUAGES[0];
    await copyText(sourceCode);
    if (extensionReady) {
      const requestId = createSubmissionRequestId();
      requestIdRef.current = requestId;
      const title = contest.problemTitles?.[selectedSlot.charCodeAt(0) - 65] || `Problem ${selectedSlot}`;
      void recordPlatformSubmission({
        requestId, judge: "ucup", problemCode: `${contest.id}-${selectedSlot}`, problemTitle: title,
        problemHref: `/vp/archive/problem?contest=${encodeURIComponent(contest.id)}&slot=${encodeURIComponent(selectedSlot)}`,
        contestId: contest.qojContestId, problemIndex: selectedSlot, language: selectedLanguage.label,
        status: "queued", message: "正在连接 Universal Cup / QOJ",
      });
      window.postMessage({
        source: "icpc-trainer",
        type: "ICPC_TRAINER_ARCHIVE_SUBMIT",
        payload: {
          requestId,
          judge: "ucup",
          archiveContestId: contest.id,
          qojContestId: contest.qojContestId,
          problemId: problem.id,
          slot: selectedSlot,
          submitUrl: problem.submitUrl,
          sourceCode,
          languageValue: selectedLanguage.value,
          languageLabel: selectedLanguage.label,
          autoSubmit: true,
        },
      }, window.location.origin);
      setStatus("正在后台连接 Universal Cup / QOJ 并提交…");
      return;
    }
    setStatus("需要安装并重新加载 v0.8 提交扩展；代码已复制，不会丢失。");
  }

  return <div className="archive-submit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="archive-submit-dialog" role="dialog" aria-modal="true" aria-labelledby="archive-submit-title">
      <header><div><small>提交到 Universal Cup / QOJ</small><h2 id="archive-submit-title">提交代码</h2></div><button type="button" aria-label="关闭提交窗口" onClick={onClose}>×</button></header>
      <div className="archive-submit-fields">
        <label><span>题目</span><select value={selectedSlot} onChange={(event) => setSelectedSlot(event.target.value)}>{slots.map((slot) => <option value={slot} key={slot}>{slot} · {contest.problemTitles?.[slot.charCodeAt(0) - 65] || `Problem ${slot}`}</option>)}</select></label>
        <label><span>语言</span><select value={languageValue} onChange={(event) => setLanguageValue(event.target.value)}>{SUBMIT_LANGUAGES.map((item) => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
      </div>
      <label className={`archive-file-picker${fileName ? " selected" : ""}`}>
        <input type="file" accept=".cpp,.cc,.cxx,.c,.py,.java,.kt,.kts,.rs,.txt" onChange={(event) => void selectFile(event)} />
        <Icon name="upload" /><span><b>{fileName || "选择代码文件"}</b><small>{fileName ? `${Math.ceil(new Blob([sourceCode]).size / 1024)} KB · 可更换文件` : "支持 C++、C、Python、Java、Kotlin、Rust"}</small></span>
      </label>
      <div className="archive-code-divider"><span>或直接粘贴代码</span></div>
      <label className="archive-code-paste">
        <span>代码内容</span>
        <textarea value={sourceCode} maxLength={500_000} spellCheck={false} placeholder="#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    return 0;\n}" onChange={(event) => { setSourceCode(event.target.value); setFileName(""); setError(""); setStatus(""); }} />
        <small>{sourceCode ? `${sourceCode.length.toLocaleString("zh-CN")} 个字符` : "选择文件后也可在这里检查和修改"}</small>
      </label>
      {error ? <p className="archive-submit-error">{error}</p> : null}
      {status ? <p className="archive-submit-status">{status}</p> : null}
      <footer><span>{extensionReady ? "v0.8 扩展已连接 · 凭据只留在浏览器" : "未检测到 v0.8 扩展"}</span><button type="button" onClick={() => void submit()}>直接提交 →</button></footer>
    </section>
  </div>;
}

export default function ArchiveProblemPage() {
  const searchParams = useSearchParams();
  const contestId = searchParams.get("contest") || "";
  const slot = (searchParams.get("slot") || "A").toUpperCase();
  const contest = findArchiveContest(contestId);
  const problem = contest && /^[A-Z][0-9]?$/.test(slot) ? archivePracticeProblem(contest, slot) : null;
  const problemIndex = slot.charCodeAt(0) - 65;
  const slots = contest ? Array.from({ length: contest.problemCount }, (_, index) => String.fromCharCode(65 + index)) : [];
  const previous = slots[Math.max(0, problemIndex - 1)];
  const next = slots[Math.min(slots.length - 1, problemIndex + 1)];
  const qojContestId = contest?.qojContestId || 0;
  const problemId = problem?.id || 0;
  const contestName = contest?.name || "";
  const problemTitle = problem?.title || `Problem ${slot}`;
  const [language, setLanguage] = useState<"english" | "chinese">("english");
  const [attempt, setAttempt] = useState<Attempt>({ wrong: 0 });
  const [started, setStarted] = useState(false);
  const [statement, setStatement] = useState<ArchiveExtractedStatement | null>(null);
  const [statementMessage, setStatementMessage] = useState("");
  const [submitOpen, setSubmitOpen] = useState(false);

  useEffect(() => {
    const session = readStoredJson<ArchiveSession | null>(SESSION_KEY, null, (value): value is ArchiveSession | null => value === null || isArchiveSession(value));
    setStarted(Boolean(session?.contestId === contestId && session.startedAt));
    setAttempt(session?.contestId === contestId ? session.attempts[slot] || { wrong: 0 } : { wrong: 0 });
  }, [contestId, slot]);

  useEffect(() => {
    const receive = (event: Event) => {
      const session = (event as CustomEvent<ArchiveSession>).detail;
      if (!isArchiveSession(session) || session.contestId !== contestId) return;
      setStarted(Boolean(session.startedAt));
      setAttempt(session.attempts[slot] || { wrong: 0 });
    };
    window.addEventListener(ARCHIVE_SESSION_EVENT, receive);
    return () => window.removeEventListener(ARCHIVE_SESSION_EVENT, receive);
  }, [contestId, slot]);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    setStatement(null);
    setStatementMessage("");
    if (!qojContestId || !problemId || !contestName) return;
    const refresh = async () => {
      try {
        const value = await loadArchiveStatement(contestId, slot, {
          qojContestId,
          problemId,
          contestName,
          title: problemTitle,
        });
        if (cancelled) return;
        setStatement(value);
        setStatementMessage(value.message || (value.chinese.sections.length ? "" : "中文题面正在后台生成"));
        if (!value.chinese.sections.length) timer = window.setTimeout(refresh, 4_000);
      } catch (error) {
        if (cancelled) return;
        const pending = error instanceof ArchiveStatementPendingError;
        setStatementMessage(error instanceof Error ? error.message : "题面加载失败");
        if (pending) timer = window.setTimeout(refresh, 2_000);
      }
    };
    void refresh();
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [contestId, contestName, problemId, problemTitle, qojContestId, slot]);

  function updateAttempt(action: "wrong" | "solve" | "reset") {
    const session = readStoredJson<ArchiveSession | null>(SESSION_KEY, null, (value): value is ArchiveSession | null => value === null || isArchiveSession(value));
    if (!session?.startedAt || session.contestId !== contestId) return;
    const current = session.attempts[slot] || { wrong: 0 };
    const attempts = { ...session.attempts };
    const atSeconds = Math.max(0, Math.floor((Date.now() - session.startedAt) / 1000));
    let submissions = [...(session.submissions ?? [])];
    if (action === "reset") {
      delete attempts[slot];
      submissions = submissions.filter((submission) => submission.slot !== slot);
    } else if (action === "wrong" && current.solvedAt === undefined) {
      attempts[slot] = { ...current, wrong: current.wrong + 1 };
      submissions.push({ id: `${Date.now()}-${slot}-WA`, slot, verdict: "WA", atSeconds });
    } else if (action === "solve" && current.solvedAt === undefined) {
      attempts[slot] = { ...current, solvedAt: atSeconds };
      submissions.push({ id: `${Date.now()}-${slot}-AC`, slot, verdict: "AC", atSeconds });
    }
    const updated = { ...session, attempts, submissions: submissions.slice(-500) };
    writeStoredJson(SESSION_KEY, updated);
    void savePersistentJson("archive-vp", SESSION_KEY, updated);
    setAttempt(attempts[slot] || { wrong: 0 });
  }

  if (!contest || !problem) return <AppShell active="模拟赛"><section className="template-not-found"><h1>暂未找到这道题</h1><Link className="button button-primary" href="/vp/archive">返回历届补题</Link></section></AppShell>;

  const solved = attempt.solvedAt !== undefined;
  const chineseReady = Boolean(statement?.chinese.sections.length);
  return <AppShell active="模拟赛">
    <header className="archive-problem-head">
      <div>
        <Link href="/vp/archive">← 返回实时榜单</Link>
        <span>{contest.year} · {contest.type}</span>
        <h1><b>{slot}</b>{language === "chinese" && chineseReady ? statement?.titleZh : statement?.titleEn || problem.title}</h1>
        <p>{contest.name}</p>
      </div>
      <nav>
        {problemIndex > 0 ? <Link href={`/vp/archive/problem?contest=${encodeURIComponent(contest.id)}&slot=${previous}`}>← {previous}</Link> : <span />}
        {problemIndex < slots.length - 1 ? <Link href={`/vp/archive/problem?contest=${encodeURIComponent(contest.id)}&slot=${next}`}>{next} →</Link> : <span />}
      </nav>
    </header>

    <section className="archive-solve-bar">
      <div className="language-switch">
        <button className={language === "english" ? "active" : ""} onClick={() => setLanguage("english")}>原题面 <small>EN</small></button>
        <button className={language === "chinese" ? "active" : ""} disabled={!chineseReady} onClick={() => setLanguage("chinese")}>{statement?.source.chinesePdfUrl ? "官方中文" : "中文题面"} <small>{chineseReady ? "ZH" : "生成中"}</small></button>
      </div>
      {statementMessage ? <span className="archive-statement-status"><i />{statementMessage}</span> : null}
      <div className={`archive-attempt-state${solved ? " solved" : attempt.wrong ? " attempted" : ""}`}><span>{solved ? "已 AC" : attempt.wrong ? `${attempt.wrong} 次 WA` : "未尝试"}</span><button disabled={!started || solved} onClick={() => updateAttempt("wrong")}>+ WA</button><button disabled={!started || solved} onClick={() => updateAttempt("solve")}>标记 AC</button>{solved || attempt.wrong ? <button onClick={() => updateAttempt("reset")}>重置</button> : null}</div>
    </section>

    {!started ? <div className="archive-start-notice"><Icon name="clock" /><span>开始 VP 后，本题结果会计入实时排名。</span><Link href="/vp/archive">返回开始 VP →</Link></div> : null}

    <section className="archive-solving-workspace">
      {statement ? <ArchiveStatementView statement={statement} language={language} /> : <article className="archive-statement-panel archive-statement-loading"><div className="statement-loader" /><h2>正在整理题面</h2><p>{statementMessage || "首次打开会从官方 PDF 提取正文、样例和图片，完成后自动写入数据库。"}</p><div className="hero-actions"><a className="button button-ghost" href={problem.statementUrl} target="_blank" rel="noreferrer">下载原始 PDF ↓</a></div></article>}
    </section>

    <section className="archive-submit-dock"><div><b>完成代码后直接提交</b><span>选择文件或粘贴代码，后台代理提交并写入平台记录。</span></div><button type="button" onClick={() => setSubmitOpen(true)}>提交代码 →</button></section>
    {submitOpen ? <ArchiveSubmitDialog contest={contest} currentSlot={slot} slots={slots} onClose={() => setSubmitOpen(false)} /> : null}
  </AppShell>;
}
