"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell, Icon } from "../../components/AppShell";
import { findCuratedProblem } from "../../data/problems";
import { findImportedStatement } from "../../data/problem-statements";
import { browserApiUrl } from "../../lib/browser-api";

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

export default function ProblemDetailPage() {
  const params = useParams<{ code: string }>();
  const requestedCode = decodeURIComponent(params.code ?? "1904C");
  const curated = useMemo(() => findCuratedProblem(requestedCode), [requestedCode]);
  const importedStatement = useMemo(() => findImportedStatement(requestedCode), [requestedCode]);
  const [problem, setProblem] = useState<DisplayProblem>(() => curated ?? { code: `CF ${requestedCode}`, contestId: Number(requestedCode.match(/^\d+/)?.[0] ?? 0), index: requestedCode.replace(/^\d+/, ""), title: "Codeforces Problem", titleZh: importedStatement?.titleZh ?? "中文题面待导入", rating: 0, tags: ["Codeforces"], summaryZh: "这道题来自按 Rating 扩展的实时题库，中文结构化题面尚未导入。", inputZh: "请查看 Codeforces 英文原题。", outputZh: "请查看 Codeforces 英文原题。" });
  const [tab, setTab] = useState("题目");
  const [favorite, setFavorite] = useState(false);
  const [code, setCode] = useState(initialCode);
  const [submitState, setSubmitState] = useState<"idle" | "sent">("idle");
  const [autoSubmit, setAutoSubmit] = useState(false);

  useEffect(() => {
    if (curated) { setProblem(curated); return; }
    fetch(browserApiUrl(`/codeforces/problems?scope=single&code=${encodeURIComponent(requestedCode)}`)).then((response) => response.json()).then((data) => {
      if (!data.problem) return;
      setProblem({ ...data.problem, titleZh: importedStatement?.titleZh ?? "中文题面待导入", summaryZh: "这道题来自按 Rating 扩展的实时题库，中文结构化题面尚未导入。请在训练时结合英文原题。", inputZh: "请查看 Codeforces 英文原题中的输入说明。", outputZh: "请查看 Codeforces 英文原题中的输出说明。" });
    }).catch(() => undefined);
  }, [curated, importedStatement, requestedCode]);

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

  function sendToExtension() {
    window.postMessage({
      source: "icpc-trainer",
      type: "ICPC_TRAINER_SUBMIT",
      payload: { contestId: problem.contestId, index: problem.index, languageLabel: "GNU C++20", sourceCode: code, autoSubmit },
    }, window.location.origin);
    setSubmitState("sent");
  }

  return <AppShell active="题库">
    <div className="problem-page-head">
      <div><a href="/problem">← 返回题库</a><span>{importedStatement ? "完整题面已导入" : "实时题库"} · {problem.code}</span></div>
      <div><a href={`https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`} target="_blank" rel="noreferrer">查看英文原题 ↗</a><button className={favorite ? "saved" : ""} onClick={toggleFavorite}>☆ {favorite ? "已收藏" : "收藏"}</button></div>
    </div>
    <section className="problem-workspace">
      <article className="statement-panel">
        <div className="statement-title">
          <div><span>{problem.code}</span><h1>{problem.title}</h1><p>{problem.titleZh}</p></div>
          <div className="problem-meta"><b>{problem.rating}</b>{problem.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div>
        </div>
        <div className={`translation-note${importedStatement ? " statement-ready" : ""}`}><Icon name="spark" /><p><b>{importedStatement ? "完整中文题面" : "题面尚未导入"}</b> · {importedStatement ? "包含规则、约束、输入输出与官方样例" : "当前仅有题库元数据"}　<span>中文独立整理 · 可打开英文原题校对</span></p></div>
        <div className="tabs">{["题目", "提交记录", "题解"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>
        {tab === "题目" ? importedStatement ? <div className="statement-body full-statement">
          <div className="statement-facts"><span><b>{importedStatement.timeLimitSeconds}</b> 秒时间限制</span><span><b>{importedStatement.memoryLimitMb}</b> MB 内存限制</span><span><b>标准</b> 输入 / 输出</span></div>
          <h2>题目描述</h2>{importedStatement.descriptionZh.map((paragraph, index) => <p key={`description-${index}`}>{paragraph}</p>)}
          <h2>输入格式</h2>{importedStatement.inputZh.map((paragraph, index) => <p key={`input-${index}`}>{paragraph}</p>)}
          <h2>输出格式</h2>{importedStatement.outputZh.map((paragraph, index) => <p key={`output-${index}`}>{paragraph}</p>)}
          <h2>样例</h2>{importedStatement.examples.map((example, index) => <div className="samples statement-sample" key={`example-${index}`}><div><b>样例输入 {importedStatement.examples.length > 1 ? index + 1 : ""}</b><pre>{example.input}</pre></div><div><b>样例输出 {importedStatement.examples.length > 1 ? index + 1 : ""}</b><pre>{example.output}</pre></div></div>)}
          {importedStatement.noteZh?.length ? <><h2>样例说明</h2>{importedStatement.noteZh.map((paragraph, index) => <p key={`note-${index}`}>{paragraph}</p>)}</> : null}
          <div className="source-callout"><b>题面来源</b><p>根据 Codeforces 公开英文题面翻译整理；竞赛规则、特殊判题与后续修订请以英文原题为准。</p></div>
        </div> : <div className="statement-body statement-missing">
          <h2>题意导读</h2><p>{problem.summaryZh}</p>
          <h2>输入格式</h2><p>{problem.inputZh}</p>
          <h2>输出格式</h2><p>{problem.outputZh}</p>
          <div className="source-callout"><b>尚未导入</b><p>这道扩展题目前只有 Codeforces 元数据。你仍可打开英文原题；中文题面会继续按训练频率扩充。</p></div>
        </div> : tab === "提交记录" ? <div className="empty-state"><Icon name="history" /><h3>查看公开提交记录</h3><p>在「提交记录」输入 Codeforces Handle，即可同步最近提交与判题结果。</p><a className="button button-primary" href="/submissions">前往同步</a></div> : <div className="locked-editorial"><Icon name="spark" /><h3>解题导航</h3><p>{strategyByTag[problem.tags[0]] ?? "从约束范围反推目标复杂度，先写出朴素算法，再寻找可以复用的状态或单调性。"}</p><p>建议复杂度方向：根据 <b>{problem.tags.join(" / ")}</b> 标签选择对应模板，并使用样例和极端数据验证。</p><div className="hero-actions"><a className="button button-primary" href="/templates">打开算法模板</a><a className="button button-ghost" href={`https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`} target="_blank" rel="noreferrer">核对官方题面 ↗</a></div></div>}
      </article>
      <aside className="code-panel">
        <div className="editor-head"><div><span className="active-dot" /> main.cpp</div><select aria-label="编译语言"><option>GNU C++20</option></select></div>
        <textarea className="code-editor" value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} aria-label="C++ 代码编辑器" />
        <div className="editor-footer"><div><a href="/templates">＋ 打开模板库</a><span>草稿已自动保存在当前浏览器</span></div><label className="auto-submit-option"><input type="checkbox" checked={autoSubmit} onChange={(event) => setAutoSubmit(event.target.checked)} /> 预填后自动点击 Codeforces 提交按钮</label><button className="submit-button" onClick={sendToExtension}>{submitState === "sent" ? <><Icon name="check" /> 已发送给浏览器扩展</> : <>提交到 Codeforces <span>⌘ ↵</span></>}</button><a className="extension-help" href="/extension">尚未安装扩展？查看安装与使用说明 →</a></div>
      </aside>
    </section>
  </AppShell>;
}
