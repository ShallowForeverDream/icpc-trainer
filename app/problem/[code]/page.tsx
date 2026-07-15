"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { ChangeEvent, MouseEvent as ReactMouseEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { AppShell, Icon } from "../../components/AppShell";
import { findArchiveContest } from "../../data/archive-contests";
import { findCuratedProblem } from "../../data/problems";
import { findImportedStatement } from "../../data/problem-statements";
import { apiJson } from "../../lib/api-client";
import { loadPersistentJson, savePersistentJson } from "../../lib/persistent-state";
import { createSubmissionRequestId, recordPlatformSubmission, updatePlatformSubmission } from "../../lib/platform-submissions";
import { readTrainerPreferences } from "../../lib/preferences";
import { readStoredJson, readStoredString, removeStoredValue, writeStoredJson, writeStoredString } from "../../lib/storage";
import { saveTrainingEvent, type TrainingDifficulty, type TrainingOutcome } from "../../lib/training-client";
import {
  CachedStatement,
  cacheBrowserTranslation,
  fetchStatementViaExtension,
  importStatementSource,
  loadStatement,
  statementHtmlForDisplay,
  submitBrowserTranslation,
  translateStatementInBrowser,
} from "../../lib/statement-client";

type DisplayProblem = {
  code: string;
  contestId: number;
  index: string;
  title: string;
  titleZh: string;
  rating: number;
  tags: string[];
  summaryZh: string;
  inputZh: string;
  outputZh: string;
};

type StatementLanguage = "original" | "chinese";
type SubmitLanguage = { label: string; extensions: string[] };

const SUBMIT_LANGUAGES: SubmitLanguage[] = [
  { label: "GNU C++20", extensions: ["cpp", "cc", "cxx"] },
  { label: "GNU C++23", extensions: ["cpp", "cc", "cxx"] },
  { label: "GNU C++17", extensions: ["cpp", "cc", "cxx"] },
  { label: "GNU C11", extensions: ["c"] },
  { label: "PyPy 3", extensions: ["py"] },
  { label: "Python 3", extensions: ["py"] },
  { label: "Java 21", extensions: ["java"] },
  { label: "Java 17", extensions: ["java"] },
  { label: "Kotlin 1.9", extensions: ["kt", "kts"] },
  { label: "Rust 2021", extensions: ["rs"] },
];

async function copyCodeText(value: string) {
  try { await navigator.clipboard.writeText(value); }
  catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.cssText = "position:fixed;opacity:0";
    document.body.append(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}
type ThinkingRecord = { startedAt?: number | null; note?: string; hintLevel?: number; difficulty?: TrainingDifficulty };
type PersistentProblemState = { draft: string; thinking: ThinkingRecord };
type VpContext = { id: string; slot: string };

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 500 && value.every((item) => typeof item === "string" && item.length <= 40);
}

function isThinkingRecord(value: unknown): value is ThinkingRecord {
  if (!value || typeof value !== "object") return false;
  const item = value as ThinkingRecord;
  return (item.startedAt === undefined || item.startedAt === null || Number.isFinite(item.startedAt))
    && (item.note === undefined || typeof item.note === "string")
    && (item.hintLevel === undefined || Number.isInteger(item.hintLevel))
    && (item.difficulty === undefined || ["easy", "right", "hard"].includes(item.difficulty));
}

function isPersistentProblemState(value: unknown): value is PersistentProblemState {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<PersistentProblemState>;
  return typeof item.draft === "string" && item.draft.length <= 200_000 && isThinkingRecord(item.thinking);
}

const initialCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  
  return 0;
}`;

const strategyByTag: Record<string, string> = {
  数学: "先把题目条件改写成等式或不等式，寻找奇偶性、整除关系和可直接计算的量。",
  入门: "按题意逐步模拟，并在编码前列出所有边界情况。",
  字符串: "明确字符下标与扫描方向，优先考虑一次线性遍历。",
  排序: "先排序建立单调性，再检查能否用贪心、双指针或二分完成。",
  模拟: "把每条操作规则翻译成独立分支，保持状态定义简单且可验证。",
  贪心: "尝试证明局部最优选择不会破坏后续决策，并用反证或交换论证校验。",
  二分: "确定答案或位置上的单调性，写清左右边界与开闭区间。",
  数据结构: "先写出需要支持的修改与查询，再选择能够满足复杂度的数据结构。",
  位运算: "逐位统计贡献，从高位到低位判断当前预算能否让这一位成立。",
  数论: "枚举较小参数，利用 gcd、整除或因子关系压缩另一维范围。",
  greedy: "能否用交换论证说明：先做当前最优选择，不会让后续答案变差？",
  math: "把操作或条件改写成等式、不等式、奇偶性或整除关系后，什么量保持不变？",
  implementation: "先列出状态与边界，再把每条规则拆成可单独验证的分支。",
  dp: "如果只保留解决后缀所需的最少信息，状态应该表示什么？转移最后一步是什么？",
  graphs: "把对象看作点、关系看作边后，题目真正询问的是连通、最短路还是拓扑顺序？",
  trees: "选定根后，每棵子树需要向父亲汇报哪一条最小信息？",
  "binary search": "是否存在一个答案 x，使得 x 可行时更宽松的答案也必然可行？",
  "two pointers": "当右端点移动时，左端点是否只需单调向前而不必回退？",
  strings: "逐字符扫描时，决定未来所需的历史信息能否压缩到常数或一个前缀状态？",
  "number theory": "先写出整除、gcd 或因子关系，哪一维可以通过枚举较小参数被消去？",
  combinatorics: "尝试按最后一次选择或贡献位置计数，如何避免重复与遗漏？",
  "constructive algorithms": "先从答案必须满足的局部条件反推结构，再尝试用最简单规则构造。",
  "data structures": "明确必须支持的修改和查询，再判断是否真的需要树状数组、线段树或并查集。",
};

const thinkingPrompts = [
  "先不想算法：用一句话写出“给定什么、要最优化或判断什么”。",
  "只看约束范围：允许的时间复杂度大约是多少？哪些朴素枚举一定会超时？",
  "写出最直接的暴力过程。它重复计算了什么，或在哪一步丢失了单调性？",
];

function statusText(statement: CachedStatement | null, error: string) {
  if (error) return error;
  if (!statement) return "正在连接题面服务";
  if (statement.status === "importing") return "首次打开：正在导入 Codeforces 原题面";
  if (statement.status === "source_required") return "服务器受到 Codeforces 限制，正在调用浏览器扩展导入";
  if (statement.chineseHtml && statement.revalidating) return "中文缓存可立即阅读 · 后台正在校对新版术语";
  if (statement.status === "model_downloading") return statement.chineseHtml ? "中文缓存可立即阅读 · 后台正在载入校对模型" : statement.message || "首次使用：正在下载本地翻译模型";
  if (statement.status === "translating") return statement.message || "原题已就绪，正在生成中文题面";
  if (statement.status === "ready_original") return statement.message || "原题已就绪，中文翻译稍后重试";
  if (statement.status === "ready") return "原题面与中文题面均已缓存";
  return statement.message || "正在准备题面";
}

function CachedStatementView({ statement, language }: { statement: CachedStatement; language: StatementLanguage }) {
  const source = language === "original" ? statement.originalHtml : statement.chineseHtml;
  const html = useMemo(() => source ? statementHtmlForDisplay(source, statement.images, language) : "", [language, source, statement.images]);
  const copySample = (event: ReactMouseEvent<HTMLDivElement>) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>("button[data-sample-copy]");
    const pre = button?.closest(".input, .output")?.querySelector("pre");
    if (!button || !pre) return;
    const value = pre.textContent || "";
    void (navigator.clipboard?.writeText(value) ?? Promise.reject()).catch(() => {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.style.cssText = "position:fixed;opacity:0";
      document.body.append(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }).then(() => {
      const previous = button.textContent;
      button.textContent = "已复制 ✓";
      window.setTimeout(() => { button.textContent = previous; }, 1400);
    });
  };
  return <div className="statement-body full-statement dynamic-statement" onClick={copySample}>
    <div className="statement-facts">
      <span><b>{statement.timeLimitText || "—"}</b> 时间限制</span>
      <span><b>{statement.memoryLimitText || "—"}</b> 内存限制</span>
      <span><b>{statement.sourceKind === "codeforces-gym" ? "Codeforces Gym" : statement.sourceKind === "codeforces" ? "Codeforces" : "CF 数据集"}</b> 题面来源</span>
    </div>
    <div className="cf-statement-html" dangerouslySetInnerHTML={{ __html: html }} />
    <div className="source-callout"><b>{language === "original" ? "原题面" : statement.revalidating ? "中文缓存题面 · 后台校对中" : "中文题面"}</b><p>{language === "original" ? "首次打开后缓存自 Codeforces；公式、样例和图片保持原始结构。" : statement.revalidating ? "先显示上一版可用中文，不再让你等待；新版术语校对完成后会自动替换。" : "由本地模型翻译并缓存。变量、公式与样例保持原样；如有差异请以原题面为准。"}</p></div>
  </div>;
}

function GymSubmitDialog({ contestId, currentIndex, problemCount, titles, onClose }: {
  contestId: number;
  currentIndex: string;
  problemCount: number;
  titles?: string[];
  onClose: () => void;
}) {
  const slots = Array.from({ length: problemCount }, (_, index) => String.fromCharCode(65 + index));
  const [selectedIndex, setSelectedIndex] = useState(currentIndex);
  const [languageLabel, setLanguageLabel] = useState("GNU C++20");
  const [sourceCode, setSourceCode] = useState("");
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [extensionReady, setExtensionReady] = useState(false);
  const requestIdRef = useRef("");

  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== "icpc-trainer-extension") return;
      if (event.data.type === "ICPC_TRAINER_PONG") {
        const current = event.data.version === "0.9.0";
        setExtensionReady(current);
        if (!current) setStatus("检测到旧版扩展，请下载 v0.9 并在扩展管理页重新加载");
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
    if (!file) return;
    if (file.size > 500_000) {
      setError("代码文件不能超过 500 KB");
      event.target.value = "";
      return;
    }
    const value = await file.text();
    if (!value.trim()) return setError("代码文件内容为空");
    setFileName(file.name);
    setSourceCode(value);
    const extension = file.name.split(".").pop()?.toLowerCase() || "";
    const guessed = SUBMIT_LANGUAGES.find((item) => item.extensions.includes(extension));
    if (guessed) setLanguageLabel(guessed.label);
  }

  async function submit() {
    setError("");
    setStatus("");
    if (!sourceCode.trim()) return setError("请选择代码文件或直接粘贴代码");
    await copyCodeText(sourceCode);
    if (extensionReady) {
      const requestId = createSubmissionRequestId();
      requestIdRef.current = requestId;
      const title = titles?.[selectedIndex.charCodeAt(0) - 65] || `Problem ${selectedIndex}`;
      void recordPlatformSubmission({
        requestId, judge: "codeforces", problemCode: `${contestId}${selectedIndex}`, problemTitle: title,
        problemHref: `/problem/${contestId}${selectedIndex}`, contestId, problemIndex: selectedIndex,
        language: languageLabel, status: "queued", message: "正在连接 Codeforces Gym",
      });
      window.postMessage({
        source: "icpc-trainer",
        type: "ICPC_TRAINER_SUBMIT",
        payload: { requestId, contestId, index: selectedIndex, languageLabel, sourceCode, isGym: true, autoSubmit: true },
      }, window.location.origin);
      setStatus("正在后台连接 Codeforces Gym 并提交…");
      return;
    }
    setStatus("需要安装并重新加载 v0.9 提交扩展；代码已复制，不会丢失。 ");
  }

  return <div className="archive-submit-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className="archive-submit-dialog" role="dialog" aria-modal="true" aria-labelledby="gym-submit-title">
      <header><div><small>提交到 Codeforces Gym</small><h2 id="gym-submit-title">提交代码</h2></div><button type="button" aria-label="关闭提交窗口" onClick={onClose}>×</button></header>
      <div className="archive-submit-fields">
        <label><span>题目</span><select value={selectedIndex} onChange={(event) => setSelectedIndex(event.target.value)}>{slots.map((slot, index) => <option value={slot} key={slot}>{slot} · {titles?.[index] || `Problem ${slot}`}</option>)}</select></label>
        <label><span>语言</span><select value={languageLabel} onChange={(event) => setLanguageLabel(event.target.value)}>{SUBMIT_LANGUAGES.map((item) => <option value={item.label} key={item.label}>{item.label}</option>)}</select></label>
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
      <footer><span>{extensionReady ? "v0.9 扩展已连接 · 凭据只留在浏览器" : "未检测到 v0.9 扩展"}</span><button type="button" onClick={() => void submit()}>直接提交 →</button></footer>
    </section>
  </div>;
}

function CuratedChineseStatement({ statement }: { statement: NonNullable<ReturnType<typeof findImportedStatement>> }) {
  return <div className="statement-body full-statement">
    <div className="statement-facts"><span><b>{statement.timeLimitSeconds}</b> 秒时间限制</span><span><b>{statement.memoryLimitMb}</b> MB 内存限制</span><span><b>精选人工整理</b> 中文来源</span></div>
    <h2>题目描述</h2>{statement.descriptionZh.map((paragraph, index) => <p key={`description-${index}`}>{paragraph}</p>)}
    <h2>输入格式</h2>{statement.inputZh.map((paragraph, index) => <p key={`input-${index}`}>{paragraph}</p>)}
    <h2>输出格式</h2>{statement.outputZh.map((paragraph, index) => <p key={`output-${index}`}>{paragraph}</p>)}
    <h2>样例</h2>{statement.examples.map((example, index) => <div className="samples statement-sample" key={`example-${index}`}><div><b>样例输入 {statement.examples.length > 1 ? index + 1 : ""}</b><pre>{example.input}</pre></div><div><b>样例输出 {statement.examples.length > 1 ? index + 1 : ""}</b><pre>{example.output}</pre></div></div>)}
    {statement.noteZh?.length ? <><h2>样例说明</h2>{statement.noteZh.map((paragraph, index) => <p key={`note-${index}`}>{paragraph}</p>)}</> : null}
    <div className="source-callout"><b>精选中文题面</b><p>服务器机器翻译完成前优先显示已有的人工整理版本；规则与特殊说明仍请用「原题面」校对。</p></div>
  </div>;
}

export default function ProblemDetailPage() {
  const params = useParams<{ code: string }>();
  const searchParams = useSearchParams();
  const requestedCode = decodeURIComponent(params.code ?? "1904C").replace(/^CF\s*/i, "").toUpperCase();
  const archiveContest = findArchiveContest(searchParams.get("archive") || "");
  const isGym = Boolean(archiveContest?.gymId && requestedCode.startsWith(String(archiveContest.gymId)));
  const curated = useMemo(() => findCuratedProblem(requestedCode), [requestedCode]);
  const importedStatement = useMemo(() => findImportedStatement(requestedCode), [requestedCode]);
  const [problem, setProblem] = useState<DisplayProblem>(() => curated ?? {
    code: `CF ${requestedCode}`,
    contestId: Number(requestedCode.match(/^\d+/)?.[0] ?? 0),
    index: requestedCode.replace(/^\d+/, ""),
    title: "Codeforces Problem",
    titleZh: importedStatement?.titleZh ?? "中文题面首次打开后生成",
    rating: 0,
    tags: ["Codeforces"],
    summaryZh: "正在导入 Codeforces 原题并生成可切换的中文题面。",
    inputZh: "请先查看原题面。",
    outputZh: "请先查看原题面。",
  });
  const [tab, setTab] = useState("题目");
  const [language, setLanguage] = useState<StatementLanguage>("original");
  const [statement, setStatement] = useState<CachedStatement | null>(null);
  const [statementError, setStatementError] = useState("");
  const [statementAction, setStatementAction] = useState("");
  const extensionAttempted = useRef(false);
  const [favorite, setFavorite] = useState(false);
  const [code, setCode] = useState(initialCode);
  const [submitState, setSubmitState] = useState<"idle" | "sending" | "sent" | "empty" | "missing">("idle");
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitFileName, setSubmitFileName] = useState("");
  const submitTimeout = useRef<number | null>(null);
  const submitRequestId = useRef("");
  const [trainingMode, setTrainingMode] = useState(false);
  const [metaRevealed, setMetaRevealed] = useState(false);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [hintLevel, setHintLevel] = useState(0);
  const [thinkingNote, setThinkingNote] = useState("");
  const [difficulty, setDifficulty] = useState<TrainingDifficulty>("right");
  const [trainingState, setTrainingState] = useState<"active" | "saving" | "saved" | "error">("active");
  const [vpContext, setVpContext] = useState<VpContext | null>(null);
  const [gymSubmitOpen, setGymSubmitOpen] = useState(false);
  const officialProblemUrl = isGym
    ? `https://codeforces.com/gym/${problem.contestId}/problem/${problem.index}`
    : `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`;

  const refreshStatement = useCallback(async () => {
    try {
      const next = await loadStatement(requestedCode, isGym ? "gym" : "problemset");
      setStatement(next);
      setStatementError("");
      return next;
    } catch (error) {
      setStatementError(error instanceof Error ? error.message : "题面服务暂时不可用");
      return null;
    }
  }, [isGym, requestedCode]);

  const importWithExtension = useCallback(async () => {
    setStatementAction("正在请求浏览器扩展读取 Codeforces 原题");
    try {
      const source = await fetchStatementViaExtension(`${officialProblemUrl}?locale=en`);
      setStatementAction("扩展读取成功，正在安全导入并缓存");
      const next = await importStatementSource(requestedCode, source.url, source.html);
      setStatement(next);
      setStatementError("");
      setStatementAction("原题导入完成，正在后台生成中文题面");
    } catch (error) {
      setStatementAction("");
      setStatementError(error instanceof Error ? error.message : "扩展导入失败");
    }
  }, [officialProblemUrl, requestedCode]);

  useEffect(() => {
    if (curated) { setProblem(curated); return; }
    const controller = new AbortController();
    apiJson<{ problem?: Omit<DisplayProblem, "titleZh" | "summaryZh" | "inputZh" | "outputZh"> }>(`/codeforces/problems?scope=single&code=${encodeURIComponent(requestedCode)}`, { signal: controller.signal })
      .then((data) => {
        if (!data.problem) return;
        setProblem({ ...data.problem, titleZh: importedStatement?.titleZh ?? "中文题面首次打开后生成", summaryZh: "正在导入 Codeforces 原题并生成可切换的中文题面。", inputZh: "请查看原题面。", outputZh: "请查看原题面。" });
      }).catch(() => undefined);
    return () => controller.abort();
  }, [curated, importedStatement, requestedCode]);

  useEffect(() => {
    extensionAttempted.current = false;
    setLanguage("original");
    setStatement(null);
    setStatementError("");
    setStatementAction("");
    void refreshStatement();
  }, [refreshStatement]);

  useEffect(() => {
    if (statement?.status === "ready") return;
    const delay = statement?.chineseHtml ? 10_000 : statement?.status === "ready_original" ? 15_000 : 3500;
    const interval = window.setInterval(() => void refreshStatement(), delay);
    return () => window.clearInterval(interval);
  }, [refreshStatement, statement?.chineseHtml, statement?.status]);

  useEffect(() => {
    if (statement?.originalHtml || !["importing", "source_required"].includes(statement?.status || "") || extensionAttempted.current) return;
    extensionAttempted.current = true;
    const timeout = window.setTimeout(() => void importWithExtension(), statement?.status === "importing" ? 1800 : 0);
    return () => window.clearTimeout(timeout);
  }, [importWithExtension, statement?.originalHtml, statement?.status]);

  useEffect(() => {
    if (!statement?.title) return;
    const title = statement.title.replace(/^[A-Z][0-9]?\.\s*/, "");
    setProblem((current) => ({ ...current, title: title || current.title }));
  }, [statement?.title]);

  useEffect(() => {
    const draft = readStoredString(`icpc-trainer-draft:${requestedCode}`, initialCode);
    const thinking = readStoredJson<ThinkingRecord>(`icpc-trainer-thinking:${requestedCode}`, {}, isThinkingRecord);
    setCode(draft);
    void loadPersistentJson(`problem:${requestedCode}`, `icpc-trainer-problem:${requestedCode}`, { draft, thinking }, isPersistentProblemState).then((remote) => {
      setCode(remote.draft);
      setThinkingNote(remote.thinking.note?.slice(0, 10_000) ?? "");
      setHintLevel(Math.min(3, Math.max(0, Number(remote.thinking.hintLevel) || 0)));
      setDifficulty(remote.thinking.difficulty && ["easy", "right", "hard"].includes(remote.thinking.difficulty) ? remote.thinking.difficulty : "right");
    });
  }, [requestedCode]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      writeStoredString(`icpc-trainer-draft:${requestedCode}`, code);
      const thinking = readStoredJson<ThinkingRecord>(`icpc-trainer-thinking:${requestedCode}`, {}, isThinkingRecord);
      void savePersistentJson(`problem:${requestedCode}`, `icpc-trainer-problem:${requestedCode}`, { draft: code, thinking });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [code, requestedCode]);
  useEffect(() => {
    const local = readStoredJson<string[]>("icpc-trainer-favorites", [], isStringArray);
    setFavorite(local.includes(problem.code));
    void loadPersistentJson("favorites", "icpc-trainer-favorites", local, isStringArray).then((favorites) => setFavorite(favorites.includes(problem.code)));
  }, [problem.code]);

  useEffect(() => {
    const search = new URLSearchParams(location.search);
    const enabled = search.get("training") === "1";
    const vpId = (search.get("vp") || "").slice(0, 80);
    const slot = (search.get("slot") || "").toUpperCase();
    setVpContext(vpId && /^[A-Z][0-9]?$/.test(slot) ? { id: vpId, slot } : null);
    setTrainingMode(enabled);
    setMetaRevealed(!enabled);
    const saved = readStoredJson<ThinkingRecord>(`icpc-trainer-thinking:${requestedCode}`, {}, isThinkingRecord);
    setThinkingNote(saved.note?.slice(0, 10_000) ?? "");
    setHintLevel(Math.min(3, Math.max(0, Number(saved.hintLevel) || 0)));
    setDifficulty(saved.difficulty && ["easy", "right", "hard"].includes(saved.difficulty) ? saved.difficulty : "right");
    const startedAt = enabled ? Number(saved.startedAt) || Date.now() : null;
    setSessionStartedAt(startedAt);
    if (startedAt) writeStoredJson(`icpc-trainer-thinking:${requestedCode}`, { ...saved, startedAt });
  }, [requestedCode]);

  useEffect(() => {
    if (!sessionStartedAt || trainingState === "saved") return;
    const update = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - sessionStartedAt) / 1000)));
    update();
    const interval = window.setInterval(update, 1000);
    return () => window.clearInterval(interval);
  }, [sessionStartedAt, trainingState]);

  useEffect(() => {
    if (!trainingMode) return;
    const timeout = window.setTimeout(() => {
      const previous = readStoredJson<ThinkingRecord>(`icpc-trainer-thinking:${requestedCode}`, {}, isThinkingRecord);
      const thinking = { ...previous, startedAt: sessionStartedAt, note: thinkingNote.slice(0, 10_000), hintLevel, difficulty };
      writeStoredJson(`icpc-trainer-thinking:${requestedCode}`, thinking);
      void savePersistentJson(`problem:${requestedCode}`, `icpc-trainer-problem:${requestedCode}`, { draft: code, thinking });
    }, 400);
    return () => window.clearTimeout(timeout);
  }, [code, difficulty, hintLevel, requestedCode, sessionStartedAt, thinkingNote, trainingMode]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== "icpc-trainer-extension" || event.data?.type !== "ICPC_TRAINER_SUBMIT_RESULT" || event.data.requestId !== submitRequestId.current) return;
      if (submitTimeout.current) window.clearTimeout(submitTimeout.current);
      const stage = event.data.stage as "queued" | "submitted" | "failed" | "needs_login";
      const message = typeof event.data.message === "string" ? event.data.message : "提交状态已更新";
      setSubmitMessage(message);
      setSubmitState(stage === "submitted" ? "sent" : stage === "queued" ? "sending" : "missing");
      if (["queued", "submitted", "failed", "needs_login"].includes(stage)) void updatePlatformSubmission(event.data.requestId, stage, message);
    };
    window.addEventListener("message", receive);
    return () => {
      window.removeEventListener("message", receive);
      if (submitTimeout.current) window.clearTimeout(submitTimeout.current);
    };
  }, []);

  function toggleFavorite() {
    const favorites = new Set<string>(readStoredJson<string[]>("icpc-trainer-favorites", [], isStringArray));
    if (favorites.has(problem.code)) favorites.delete(problem.code); else favorites.add(problem.code);
    void savePersistentJson("favorites", "icpc-trainer-favorites", [...favorites].slice(0, 500));
    setFavorite(favorites.has(problem.code));
  }

  async function translateInBrowser() {
    if (!statement?.originalHtml) return;
    try {
      setStatementAction("正在检查 Chrome 本地翻译能力");
      const translated = await translateStatementInBrowser(statement.originalHtml, statement.images, setStatementAction);
      const local = cacheBrowserTranslation(statement, translated.chineseHtml, translated.images);
      setStatement(local);
      setLanguage("chinese");
      setStatementError("");
      setStatementAction("中文题面已生成，正在写入服务器数据库");
      try {
        const next = await submitBrowserTranslation(requestedCode, translated.chineseHtml, translated.images);
        setStatement(next);
        setStatementAction(next.cacheScope === "device" ? "中文题面已保存到当前设备" : "中文题面已持久保存到服务器数据库");
      } catch {
        setStatementAction("中文题面已保存到当前设备；登录后可同步共享缓存");
      }
    } catch (error) {
      setStatementAction("");
      setStatementError(error instanceof Error ? error.message : "浏览器本地翻译失败");
    }
  }

  const sendToExtension = useCallback(() => {
    if (!code.trim()) {
      setSubmitState("empty");
      return;
    }
    const requestId = createSubmissionRequestId();
    submitRequestId.current = requestId;
    setSubmitMessage("正在通过浏览器会话连接 Codeforces");
    void recordPlatformSubmission({
      requestId, judge: "codeforces", problemCode: requestedCode, problemTitle: problem.title,
      problemHref: `/problem/${requestedCode}`, contestId: problem.contestId, problemIndex: problem.index,
      language: "GNU C++20", status: "queued", message: "正在连接 Codeforces",
    });
    window.postMessage({
      source: "icpc-trainer",
      type: "ICPC_TRAINER_SUBMIT",
      payload: { requestId, contestId: problem.contestId, index: problem.index, languageLabel: "GNU C++20", sourceCode: code, isGym, autoSubmit: true },
    }, window.location.origin);
    setSubmitState("sending");
    if (submitTimeout.current) window.clearTimeout(submitTimeout.current);
    submitTimeout.current = window.setTimeout(() => {
      setSubmitState("missing");
      setSubmitMessage("未检测到 v0.9 扩展，请安装或在扩展管理页点击重新加载");
    }, 1800);
  }, [code, isGym, problem.contestId, problem.index, problem.title, requestedCode]);

  async function selectEditorFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 500_000) {
      setSubmitState("missing");
      setSubmitMessage("代码文件不能超过 500 KB");
      event.target.value = "";
      return;
    }
    const source = await file.text();
    if (!source.trim()) {
      setSubmitState("empty");
      setSubmitMessage("代码文件内容为空");
      return;
    }
    setCode(source);
    setSubmitFileName(file.name);
    setSubmitState("idle");
    setSubmitMessage("");
  }

  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") { event.preventDefault(); sendToExtension(); }
    };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [sendToExtension]);

  async function recordTraining(outcome: TrainingOutcome) {
    setTrainingState("saving");
    try {
      await saveTrainingEvent({ handle: readTrainerPreferences().codeforcesHandle, code: requestedCode, outcome, durationMinutes: Math.max(1, Math.round(elapsedSeconds / 60)), hintLevel, difficulty, reflection: thinkingNote });
      setTrainingState("saved");
      removeStoredValue(`icpc-trainer-thinking:${requestedCode}`);
      void savePersistentJson(`problem:${requestedCode}`, `icpc-trainer-problem:${requestedCode}`, { draft: code, thinking: {} });
    } catch { setTrainingState("error"); }
  }

  const elapsedLabel = `${String(Math.floor(elapsedSeconds / 60)).padStart(2, "0")}:${String(elapsedSeconds % 60).padStart(2, "0")}`;
  const directionPrompt = strategyByTag[problem.tags[0]] ?? "从约束反推复杂度：能否先写出暴力，再找出被重复计算的部分？";

  const ready = Boolean(statement?.originalHtml);
  const status = statementAction || statusText(statement, statementError);

  return <AppShell active="题库">
    <div className="problem-page-head">
      <div><Link href={vpContext ? "/vp" : "/problem"}>← {vpContext ? "返回 VP" : "返回题库"}</Link><span>{ready ? "原题面已导入" : "首次打开自动导入"} · {problem.code}</span></div>
      <div><a href={officialProblemUrl} target="_blank" rel="noreferrer">查看 {isGym ? "Codeforces Gym" : "Codeforces"} 原题 ↗</a><button className={favorite ? "saved" : ""} onClick={toggleFavorite}>☆ {favorite ? "已收藏" : "收藏"}</button></div>
    </div>
    {vpContext ? <section className="vp-problem-banner"><div><b>VP · Problem {vpContext.slot}</b><span>题面、中文翻译与代码草稿均在站内；提交后榜单会自动更新。</span></div><Link href="/vp">返回实时榜单 →</Link></section> : null}
    <section className={`problem-workspace${isGym ? " gym-statement-workspace" : ""}`}>
      <article className="statement-panel">
        <div className="statement-title">
          <div><span>{problem.code}</span><h1>{problem.title}</h1><p>{problem.titleZh}</p></div>
          <div className={`problem-meta${trainingMode && !metaRevealed ? " meta-concealed" : ""}`}>{trainingMode && !metaRevealed ? <><b>?</b><span>标签已隐藏</span><button onClick={() => setMetaRevealed(true)}>主动揭示</button></> : <><b>{problem.rating || "—"}</b>{problem.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</>}</div>
        </div>
        <div className={`translation-note${ready ? " statement-ready" : ""}`}><Icon name="spark" /><p><b>原题面默认显示 · 可切换中文</b>　<span>{status}</span></p></div>
        <div className="tabs">{["题目", "提交记录", "题解"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>
        {tab === "题目" ? <>
          <div className="statement-language-bar" aria-label="题面语言">
            <div className="language-switch"><button className={language === "original" ? "active" : ""} aria-pressed={language === "original"} onClick={() => setLanguage("original")}>原题面 <small>EN</small></button><button className={language === "chinese" ? "active" : ""} aria-pressed={language === "chinese"} onClick={() => setLanguage("chinese")}>中文题面 <small>ZH</small></button></div>
            <span className={`statement-status status-${statement?.status || "loading"}`}><i />{status}</span>
          </div>
          {language === "original" ? statement?.originalHtml ? <CachedStatementView statement={statement} language="original" /> : <div className="statement-body statement-loading-card">
            <div className="statement-loader" /><h2>正在导入原题面</h2><p>这是本题第一次打开。服务器会先尝试 {isGym ? "Codeforces Gym" : "Codeforces 与缓存数据源"}；若服务器访问受限，v0.9 浏览器扩展会读取公开题面并完成导入。</p>
            {statementError ? <p className="statement-error">{statementError}</p> : null}
            <div className="hero-actions"><button className="button button-primary" onClick={() => void importWithExtension()} disabled={Boolean(statementAction)}>通过扩展重新导入</button><a className="button button-ghost" href={officialProblemUrl} target="_blank" rel="noreferrer">先打开原题完成验证 ↗</a></div>
          </div> : statement?.chineseHtml ? <CachedStatementView statement={statement} language="chinese" /> : importedStatement ? <CuratedChineseStatement statement={importedStatement} /> : <div className="statement-body statement-loading-card">
            {statement?.status !== "ready_original" ? <div className="statement-loader" /> : <Icon name="history" />}<h2>{statement?.status === "ready_original" ? "中文翻译正在排队重试" : "中文题面正在生成"}</h2><p>{statement?.status === "ready_original" ? "原题面可立即阅读，服务器翻译暂未成功并会自动重试。你也可以使用 Chrome 本地翻译，结果会先保存在当前设备，不再因登录或网络失败而丢失。" : statement?.originalHtml ? "原题面已经可以阅读。服务器正在用本地模型翻译，完成后会自动缓存；公式、代码与样例保持原样。" : "中文翻译会在原题导入后自动开始。你可以先切换到原题面阅读。"}</p>
            {statementError ? <p className="statement-error">{statementError}</p> : null}
            {statement?.originalHtml ? <div className="hero-actions"><button className="button button-primary" onClick={() => void translateInBrowser()} disabled={Boolean(statementAction)}>使用 Chrome 本地翻译</button><button className="button button-ghost" onClick={() => void refreshStatement()}>立即重试</button><button className="button button-ghost" onClick={() => setLanguage("original")}>返回原题面</button></div> : null}
          </div>}
        </> : tab === "提交记录" ? <div className="empty-state"><Icon name="history" /><h3>查看公开提交记录</h3><p>在「提交记录」输入 Codeforces Handle，即可同步最近提交与判题结果。</p><a className="button button-primary" href="/submissions">前往同步</a></div> : <div className="locked-editorial"><Icon name="spark" /><h3>解题导航</h3><p>{strategyByTag[problem.tags[0]] ?? "从约束范围反推目标复杂度，先写出朴素算法，再寻找可以复用的状态或单调性。"}</p><p>建议复杂度方向：根据 <b>{problem.tags.join(" / ")}</b> 标签选择对应模板，并使用样例和极端数据验证。</p><div className="hero-actions"><Link className="button button-primary" href="/templates">打开算法模板</Link><a className="button button-ghost" href={officialProblemUrl} target="_blank" rel="noreferrer">核对官方题面 ↗</a></div></div>}
      </article>
      {!isGym ? <aside className="code-panel">
        {trainingMode ? <section className="thinking-coach">
          <div className="thinking-coach-head"><div><span>THINKING MODE</span><h2>思维训练</h2></div><strong>{elapsedLabel}</strong></div>
          {trainingState === "saved" ? <div className="training-saved"><span>✓</span><div><b>本题训练已记录</b><small>后续推荐会区分独立完成、提示后完成和待补题。</small></div><Link href="/problem?recommended=1&mode=balanced&training=1">下一题 →</Link></div> : <>
            <div className="thinking-stage"><small>第 {Math.min(4, hintLevel + 1)} / 4 步</small><p>{hintLevel < 3 ? thinkingPrompts[hintLevel] : directionPrompt}</p></div>
            <textarea className="thinking-notes" value={thinkingNote} onChange={(event) => setThinkingNote(event.target.value)} placeholder="记录：目标、暴力算法、瓶颈、关键观察。不要只抄题解。" aria-label="思路草稿" />
            <div className="thinking-actions"><button type="button" disabled={hintLevel >= 3} onClick={() => setHintLevel((value) => Math.min(3, value + 1))}>{hintLevel >= 3 ? "已到最后提示" : "卡住了，给下一步问题"}</button><button type="button" onClick={() => setMetaRevealed((value) => !value)}>{metaRevealed ? "重新隐藏标签" : "显示标签与 Rating"}</button></div>
            <div className="difficulty-check"><span>这题对你：</span>{(["easy", "right", "hard"] as TrainingDifficulty[]).map((value) => <button type="button" key={value} className={difficulty === value ? "active" : ""} onClick={() => setDifficulty(value)}>{value === "easy" ? "偏简单" : value === "right" ? "刚刚好" : "偏困难"}</button>)}</div>
            <div className="outcome-grid"><button type="button" onClick={() => void recordTraining("independent")}><b>独立完成</b><small>未看提示/题解</small></button><button type="button" onClick={() => void recordTraining("hinted")}><b>提示后完成</b><small>需要安排复盘</small></button><button type="button" onClick={() => void recordTraining("editorial")}><b>题解后完成</b><small>3 天后重做</small></button><button type="button" onClick={() => void recordTraining("unsolved")}><b>暂未解决</b><small>加入补题队列</small></button></div>
            {trainingState === "saving" ? <p className="training-save-state">正在保存训练结果…</p> : trainingState === "error" ? <p className="form-error">保存失败，请重试。</p> : null}
          </>}
        </section> : null}
        <div className="editor-head"><div><span className="active-dot" /> {submitFileName || "main.cpp"}</div><div className="editor-head-actions"><label className="editor-file-button"><input type="file" accept=".cpp,.cc,.cxx,.c,.py,.java,.kt,.kts,.rs,.txt" onChange={(event) => void selectEditorFile(event)} />选择文件</label><select aria-label="编译语言"><option>GNU C++20</option></select></div></div>
        <textarea className="code-editor" value={code} onChange={(event) => { setCode(event.target.value); setSubmitFileName(""); }} spellCheck={false} aria-label="C++ 代码编辑器" />
        <div className="editor-footer"><div><Link href="/templates">＋ 打开模板库</Link><span>草稿已自动保存</span></div><p className="submit-safety-note">点击后由 v0.9 扩展在后台代理提交；评测站密码与 Cookie 不会上传到平台。</p>{submitMessage ? <p className={submitState === "missing" ? "statement-error" : "submit-progress"} role="status">{submitMessage}</p> : submitState === "empty" ? <p className="statement-error" role="alert">请先填写代码。</p> : null}<button className="submit-button" onClick={sendToExtension} disabled={submitState === "sending"}>{submitState === "sent" ? <><Icon name="check" /> 已提交</> : submitState === "sending" ? <>正在提交…</> : <>直接提交 <span>⌘ ↵</span></>}</button><a className="extension-help" href="/extension">安装或更新 v0.9 提交扩展 →</a></div>
      </aside> : null}
    </section>
    {isGym && archiveContest ? <section className="archive-submit-dock"><div><b>完成代码后直接提交</b><span>选择文件或粘贴代码，后台代理提交到 Codeforces Gym。</span></div><button type="button" onClick={() => setGymSubmitOpen(true)}>提交代码 →</button></section> : null}
    {isGym && archiveContest && gymSubmitOpen ? <GymSubmitDialog contestId={archiveContest.gymId || problem.contestId} currentIndex={problem.index} problemCount={archiveContest.problemCount} titles={archiveContest.problemTitles} onClose={() => setGymSubmitOpen(false)} /> : null}
  </AppShell>;
}
