"use client";

import { useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";

export default function ProblemPage() {
  const [tab, setTab] = useState("题目");
  const [favorite, setFavorite] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  return <AppShell active="题库">
    <div className="problem-page-head">
      <div><a href="/">← 返回训练台</a><span>每日推荐 · 第 3 题</span></div>
      <div><button className={favorite ? "saved" : ""} onClick={() => setFavorite(!favorite)}>☆ {favorite ? "已收藏" : "收藏"}</button><button>反馈翻译</button></div>
    </div>
    <section className="problem-workspace">
      <article className="statement-panel">
        <div className="statement-title">
          <div><span>CF 1904C</span><h1>Array Game</h1><p>数组游戏</p></div>
          <div className="problem-meta"><b>1700</b><span>GREEDY</span><span>THINKING</span></div>
        </div>
        <div className="translation-note"><Icon name="spark" /><p><b>AI 中文翻译</b> · 已通过结构校验　<span>原题在比赛结束后可查看</span></p></div>
        <div className="tabs">{["题目", "提交记录", "题解"].map(x => <button key={x} className={tab===x?"active":""} onClick={() => setTab(x)}>{x}</button>)}</div>
        {tab === "题目" ? <div className="statement-body">
          <p>你有一个由 <code>n</code> 个正整数构成的数组 <code>a</code>，以及一个整数 <code>k</code>。</p>
          <p>在一次操作中，你可以选择两个不同的下标 <code>i</code> 和 <code>j</code>，然后将 <code>|aᵢ − aⱼ|</code> 添加到数组末尾。你的目标是在恰好进行 <code>k</code> 次操作后，使数组中的最小值尽可能小。</p>
          <h2>输入格式</h2><p>第一行包含一个整数 <code>t</code>，表示测试用例数量。每个测试用例的第一行包含两个整数 <code>n</code> 和 <code>k</code>。</p>
          <div className="constraints"><span>2 ≤ n ≤ 2·10³</span><span>1 ≤ k ≤ 3</span><span>1 ≤ aᵢ ≤ 10¹⁸</span></div>
          <h2>输出格式</h2><p>对于每个测试用例，输出执行恰好 <code>k</code> 次操作后数组中的最小可能值。</p>
          <h2>样例</h2>
          <div className="samples"><div><b>输入 <button>复制</button></b><pre>4{`\n`}5 2{`\n`}3 9 7 15 1{`\n`}4 3{`\n`}7 4 15 12</pre></div><div><b>输出 <button>复制</button></b><pre>0{`\n`}0{`\n`}1{`\n`}0</pre></div></div>
        </div> : tab === "提交记录" ? <div className="empty-state"><Icon name="history" /><h3>还没有提交</h3><p>完成第一份代码后，评测结果会实时显示在这里。</p></div> : <div className="locked-editorial"><Icon name="lock" /><h3>题解尚未解锁</h3><p>AC 后自动解锁；你也可以选择放弃本题并查看题解。</p><button>放弃并查看题解</button></div>}
      </article>
      <aside className="code-panel">
        <div className="editor-head"><div><span className="active-dot" /> main.cpp</div><select aria-label="编译语言"><option>GNU C++20</option></select></div>
        <div className="fake-editor"><pre><span className="ln">1</span><i>#include</i> <em>&lt;bits/stdc++.h&gt;</em>{`\n`}<span className="ln">2</span><i>using namespace</i> std;{`\n`}<span className="ln">3</span>{`\n`}<span className="ln">4</span><i>int</i> main() {'{'}{`\n`}<span className="ln">5</span>  ios::sync_with_stdio(<b>false</b>);{`\n`}<span className="ln">6</span>  cin.tie(<b>nullptr</b>);{`\n`}<span className="ln">7</span>{`\n`}<span className="ln">8</span>  <span className="cursor"> </span>{`\n`}<span className="ln">9</span>  <i>return</i> <b>0</b>;{`\n`}<span className="ln">10</span>{'}'}</pre></div>
        <div className="editor-footer"><div><button>＋ 插入模板</button><span>已自动保存 14:32</span></div><button className="submit-button" onClick={() => setSubmitted(true)}>{submitted ? <><Icon name="check" /> 提交任务已创建</> : <>提交到 Codeforces <span>⌘ ↵</span></>}</button></div>
      </aside>
    </section>
  </AppShell>;
}
