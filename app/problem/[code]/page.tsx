"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { AppShell, Icon } from "../../components/AppShell";
import { findCuratedProblem } from "../../data/problems";

const initialCode = `#include <bits/stdc++.h>
using namespace std;

int main() {
  ios::sync_with_stdio(false);
  cin.tie(nullptr);

  
  return 0;
}`;

export default function ProblemDetailPage() {
  const params = useParams<{ code: string }>();
  const problem = useMemo(() => findCuratedProblem(decodeURIComponent(params.code ?? "1904C")), [params.code]);
  const [tab, setTab] = useState("题目");
  const [favorite, setFavorite] = useState(false);
  const [code, setCode] = useState(initialCode);
  const [submitState, setSubmitState] = useState<"idle" | "sent">("idle");

  function sendToExtension() {
    window.postMessage({
      source: "icpc-trainer",
      type: "ICPC_TRAINER_SUBMIT",
      payload: { contestId: problem.contestId, index: problem.index, languageLabel: "GNU C++20", sourceCode: code },
    }, window.location.origin);
    setSubmitState("sent");
  }

  return <AppShell active="题库">
    <div className="problem-page-head">
      <div><a href="/problem">← 返回题库</a><span>首批精选 · {problem.code}</span></div>
      <div><a href={`https://codeforces.com/problemset/problem/${problem.contestId}/${problem.index}`} target="_blank" rel="noreferrer">查看英文原题 ↗</a><button className={favorite ? "saved" : ""} onClick={() => setFavorite(!favorite)}>☆ {favorite ? "已收藏" : "收藏"}</button></div>
    </div>
    <section className="problem-workspace">
      <article className="statement-panel">
        <div className="statement-title">
          <div><span>{problem.code}</span><h1>{problem.title}</h1><p>{problem.titleZh}</p></div>
          <div className="problem-meta"><b>{problem.rating}</b>{problem.tags.slice(0, 2).map((tag) => <span key={tag}>{tag}</span>)}</div>
        </div>
        <div className="translation-note"><Icon name="spark" /><p><b>中文结构化题面</b> · 首批精选题　<span>独立整理 · 建议结合英文原题核对细节</span></p></div>
        <div className="tabs">{["题目", "提交记录", "题解"].map((item) => <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>{item}</button>)}</div>
        {tab === "题目" ? <div className="statement-body">
          <h2>题意</h2><p>{problem.summaryZh}</p>
          <h2>输入格式</h2><p>{problem.inputZh}</p>
          <h2>输出格式</h2><p>{problem.outputZh}</p>
          <div className="source-callout"><b>校对提示</b><p>本页提供中文结构化导读，不替代 Codeforces 官方题面。边界条件、样例与特殊说明请以英文原题为准。</p></div>
        </div> : tab === "提交记录" ? <div className="empty-state"><Icon name="history" /><h3>等待同步提交记录</h3><p>在「提交记录」绑定 Codeforces Handle 后即可查看公开提交。</p><a className="button button-primary" href="/submissions">前往绑定</a></div> : <div className="locked-editorial"><Icon name="lock" /><h3>题解尚未开放</h3><p>第一阶段先完成题库、中文导入和提交闭环，题解系统随后接入。</p></div>}
      </article>
      <aside className="code-panel">
        <div className="editor-head"><div><span className="active-dot" /> main.cpp</div><select aria-label="编译语言"><option>GNU C++20</option></select></div>
        <textarea className="code-editor" value={code} onChange={(event) => setCode(event.target.value)} spellCheck={false} aria-label="C++ 代码编辑器" />
        <div className="editor-footer"><div><a href="/templates">＋ 插入模板</a><span>当前草稿仅保存在本页</span></div><button className="submit-button" onClick={sendToExtension}>{submitState === "sent" ? <><Icon name="check" /> 已发送给浏览器扩展</> : <>提交到 Codeforces <span>⌘ ↵</span></>}</button><a className="extension-help" href="/extension">尚未安装扩展？查看安装与使用说明 →</a></div>
      </aside>
    </section>
  </AppShell>;
}
