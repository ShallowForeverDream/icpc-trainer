"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AppShell, Icon } from "../../components/AppShell";
import { findCuratedProblem } from "../../data/problems";
import { findImportedStatement } from "../../data/problem-statements";
import { browserApiUrl } from "../../lib/browser-api";
import {
  CachedStatement,
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
};

function statusText(statement: CachedStatement | null, error: string) {
  if (error) return error;
  if (!statement) return "正在连接题面服务";
  if (statement.status === "importing") return "首次打开：正在导入 Codeforces 原题面";
  if (statement.status === "source_required") return "服务器受到 Codeforces 限制，正在调用浏览器扩展导入";
  if (statement.status === "model_downloading") return statement.message || "首次使用：正在下载本地翻译模型";
  if (statement.status === "translating") return statement.message || "原题已就绪，正在生成中文题面";
  if (statement.status === "ready_original") return statement.message || "原题已就绪，中文翻译稍后重试";
  if (statement.status === "ready") return "原题面与中文题面均已缓存";
  return statement.message || "正在准备题面";
}

function CachedStatementView({ statement, language }: { statement: CachedStatement; language: StatementLanguage }) {
  const source = language === "original" ? statement.originalHtml : statement.chineseHtml;
  const html = useMemo(() => source ? statementHtmlForDisplay(source, statement.images, language) : "", [language, source, statement.images]);
  return <div className="statement-body full-statement dynamic-statement">
    <div className="statement-facts">
      <span><b>{statement.timeLimitText || "—"}</b> 时间限制</span>
      <span><b>{statement.memoryLimitText || "—"}</b> 内存限制</span>
      <span><b>{statement.sourceKind === "codeforces" ? "Codeforces" : "CF 数据集"}</b> 题面来源</span>
    </div>
    <div className="cf-statement-html" dangerouslySetInnerHTML={{ __html: html }} />
    <div className="source-callout"><b>{language === "original" ? "原题面" : "机器翻译题面"}</b><p>{language === "original" ? "首次打开后缓存自 Codeforces；公式、样例和图片保持原始结构。" : "由本地模型翻译并缓存。变量、公式与样例不参与翻译；如有差异请以原题面为准。"}</p></div>
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
  const requestedCode = decodeURIComponent(params.code ?? "1904C").replace(/^CF\s*/i, "").toUpperCase();
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
  const [submitState, setSubmitState] = useState<"idle" | "sent">("idle");
  const [autoSubmit, setAutoSubmit] = useState(false);
  const officialProblemUrl = `https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`;

  const refreshStatement = useCallback(async () => {
    try {
      const next = await loadStatement(requestedCode);
      setStatement(next);
      setStatementError("");
      return next;
    } catch (error) {
      setStatementError(error instanceof Error ? error.message : "题面服务暂时不可用");
      return null;
    }
  }, [requestedCode]);

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
    fetch(browserApiUrl(`/codeforces/problems?scope=single&code=${encodeURIComponent(requestedCode)}`))
      .then((response) => response.json())
      .then((data) => {
        if (!data.problem) return;
        setProblem({ ...data.problem, titleZh: importedStatement?.titleZh ?? "中文题面首次打开后生成", summaryZh: "正在导入 Codeforces 原题并生成可切换的中文题面。", inputZh: "请查看原题面。", outputZh: "请查看原题面。" });
      }).catch(() => undefined);
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
    const interval = window.setInterval(() => void refreshStatement(), 3500);
    return () => window.clearInterval(interval);
  }, [refreshStatement, statement?.status]);

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

  useEffect(() => { setCode(localStorage.getItem(`icpc-trainer-draft:${requestedCode}`) ?? initialCode); }, [requestedCode]);
  useEffect(() => { localStorage.setItem(`icpc-trainer-draft:${requestedCode}`, code); }, [code, requestedCode]);
  useEffect(() => {
    const favorites = JSON.parse(localStorage.getItem("icpc-trainer-favorites") ?? "[]") as string[];
    setFavorite(favorites.includes(problem.code));
  }, [problem.code]);

  function toggleFavorite() {
    const favorites = new Set<string>(JSON.parse(localStorage.getItem("icpc-trainer-favorites") ?? "[]"));
    if (favorites.has(problem.code)) favorites.delete(problem.code); else favorites.add(problem.code);
    localStorage.setItem("icpc-trainer-favorites", JSON.stringify([...favorites]));
    setFavorite(favorites.has(problem.code));
  }

  async function translateInBrowser() {
    if (!statement?.originalHtml) return;
    try {
      setStatementAction("正在检查 Chrome 本地翻译能力");
      const translated = await translateStatementInBrowser(statement.originalHtml, statement.images, setStatementAction);
      setStatementAction("正在保存浏览器本地翻译");
      const next = await submitBrowserTranslation(requestedCode, translated.chineseHtml, translated.images);
      setStatement(next);
      setStatementError("");
      setStatementAction("中文题面已保存");
      setLanguage("chinese");
    } catch (error) {
      setStatementAction("");
      setStatementError(error instanceof Error ? error.message : "浏览器本地翻译失败");
    }
  }

  function sendToExtension() {
    window.postMessage({
      source: "icpc-trainer",
      type: "ICPC_TRAINER_SUBMIT",
      payload: { contestId: problem.contestId, index: problem.index, languageLabel: "GNU C++20", sourceCode: code, autoSubmit },
    }, window.location.origin);
    setSubmitState("sent");
  }

  const ready = Boolean(statement?.originalHtml);
  const status = statementAction || statusText(statement, statementError);

  return <AppShell active="题库">
    <div className="problem-page-head">
      <div><Link href="/problem">← 返回题库</Link><span>{ready ? "原题面已导入" : "首次打开自动导入"} · {problem.code}</span></div>
      <div><a href={officialProblemUrl} target="_blank" rel="noreferrer">查看 Codeforces 原题 ↗</a><button className={favorite ? "saved" : ""} onClick={toggleFavorite}>☆ {favorite ? "已收藏" : "收藏"}</button></div>
    </div>
    <section className="problem-workspace">
      <article className="statement-panel">
        <div className="statement-title">
          <div><span>{problem.code}</span><h1>{problem.title}</h1><p>{problem.titleZh}</p></div>
          <div className="problem-meta"><b>{problem.rating || "—"}</b>{problem.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div>
        </div>
        <div className={`translation-note${ready ? " statement-ready" : ""}`}><Icon name="spark" /><p><b>原题面默认显示 · 可切换中文</b>　<span>{status}</span></p></div>
        <div className="tabs">{["题目", "提交记录", "题解"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>
        {tab === "题目" ? <>
          <div className="statement-language-bar" aria-label="题面语言">
            <div className="language-switch"><button className={language === "original" ? "active" : ""} aria-pressed={language === "original"} onClick={() => setLanguage("original")}>原题面 <small>EN</small></button><button className={language === "chinese" ? "active" : ""} aria-pressed={language === "chinese"} onClick={() => setLanguage("chinese")}>中文题面 <small>ZH</small></button></div>
            <span className={`statement-status status-${statement?.status || "loading"}`}><i />{status}</span>
          </div>
          {language === "original" ? statement?.originalHtml ? <CachedStatementView statement={statement} language="original" /> : <div className="statement-body statement-loading-card">
            <div className="statement-loader" /><h2>正在导入原题面</h2><p>这是本题第一次打开。服务器会先尝试 Codeforces 与缓存数据源；若服务器访问受限，v0.3 浏览器扩展会读取公开题面并完成导入。</p>
            {statementError ? <p className="statement-error">{statementError}</p> : null}
            <div className="hero-actions"><button className="button button-primary" onClick={() => void importWithExtension()} disabled={Boolean(statementAction)}>通过扩展重新导入</button><a className="button button-ghost" href={officialProblemUrl} target="_blank" rel="noreferrer">先打开原题完成验证 ↗</a></div>
          </div> : statement?.chineseHtml ? <CachedStatementView statement={statement} language="chinese" /> : importedStatement ? <CuratedChineseStatement statement={importedStatement} /> : <div className="statement-body statement-loading-card">
            <div className="statement-loader" /><h2>中文题面正在生成</h2><p>{statement?.originalHtml ? "原题面已经可以阅读。服务器正在用本地模型翻译，完成后会自动缓存；公式、代码与样例保持原样。" : "中文翻译会在原题导入后自动开始。你可以先切换到原题面阅读。"}</p>
            {statementError ? <p className="statement-error">{statementError}</p> : null}
            {statement?.originalHtml ? <div className="hero-actions"><button className="button button-primary" onClick={() => void translateInBrowser()} disabled={Boolean(statementAction)}>使用 Chrome 本地翻译</button><button className="button button-ghost" onClick={() => setLanguage("original")}>返回原题面</button></div> : null}
          </div>}
        </> : tab === "提交记录" ? <div className="empty-state"><Icon name="history" /><h3>查看公开提交记录</h3><p>在「提交记录」输入 Codeforces Handle，即可同步最近提交与判题结果。</p><a className="button button-primary" href="/submissions">前往同步</a></div> : <div className="locked-editorial"><Icon name="spark" /><h3>解题导航</h3><p>{strategyByTag[problem.tags[0]] ?? "从约束范围反推目标复杂度，先写出朴素算法，再寻找可以复用的状态或单调性。"}</p><p>建议复杂度方向：根据 <b>{problem.tags.join(" / ")}</b> 标签选择对应模板，并使用样例和极端数据验证。</p><div className="hero-actions"><a className="button button-primary" href="/templates">打开算法模板</a><a className="button button-ghost" href={officialProblemUrl} target="_blank" rel="noreferrer">核对官方题面 ↗</a></div></div>}
      </article>
      <aside className="code-panel">
        <div className="editor-head"><div><span className="active-dot" /> main.cpp</div><select aria-label="编译语言"><option>GNU C++20</option></select></div>
        <textarea className="code-editor" value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} aria-label="C++ 代码编辑器" />
        <div className="editor-footer"><div><a href="/templates">＋ 打开模板库</a><span>草稿已自动保存在当前浏览器</span></div><label className="auto-submit-option"><input type="checkbox" checked={autoSubmit} onChange={(event) => setAutoSubmit(event.target.checked)} /> 预填后自动点击 Codeforces 提交按钮</label><button className="submit-button" onClick={sendToExtension}>{submitState === "sent" ? <><Icon name="check" /> 已发送给浏览器扩展</> : <>提交到 Codeforces <span>⌘ ↵</span></>}</button><a className="extension-help" href="/extension">尚未安装扩展？查看安装与使用说明 →</a></div>
      </aside>
    </section>
  </AppShell>;
}
