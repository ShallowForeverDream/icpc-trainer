"use client";

import { FormEvent, useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";

type Submission = { id: number; createdAt: string; code: string; contestId?: number; index: string; title: string; verdict: string; language: string; timeMs: number };
const verdictLabel: Record<string, string> = { OK: "Accepted", WRONG_ANSWER: "Wrong answer", TIME_LIMIT_EXCEEDED: "Time limit", MEMORY_LIMIT_EXCEEDED: "Memory limit", RUNTIME_ERROR: "Runtime error", TESTING: "Testing" };

export default function SubmissionsPage() {
  const [handle, setHandle] = useState("ShallowDream2");
  const [rows, setRows] = useState<Submission[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("无需 API Key，仅同步 Codeforces 公开提交记录。");

  async function sync(event: FormEvent) {
    event.preventDefault();
    setStatus("loading");
    try {
      const response = await fetch(`/api/codeforces/submissions?handle=${encodeURIComponent(handle.trim())}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "同步失败");
      setRows(data.submissions);
      setMessage(`已同步 ${data.handle} 最近 ${data.submissions.length} 条公开提交`);
      setStatus("ready");
    } catch (error) {
      setRows([]);
      setMessage(error instanceof Error ? error.message : "同步失败");
      setStatus("error");
    }
  }

  return <AppShell active="提交记录">
    <section className="library-hero"><div><span className="eyebrow"><span className="live-dot" /> CODEFORCES PUBLIC API</span><h1>提交记录</h1><p>输入 Codeforces Handle，读取最近 50 条公开提交。邮箱和 API Key 都不会发送到本站。</p></div></section>
    <form className="handle-form" onSubmit={sync}>
      <label><span>Codeforces Handle</span><input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="例如 tourist" autoComplete="off" /></label>
      <button className="button button-primary" type="submit" disabled={status === "loading"}><Icon name="history" /> {status === "loading" ? "同步中…" : "绑定并同步"}</button>
      <small className={status === "error" ? "form-error" : ""}>{message}</small>
    </form>
    {rows.length ? <section className="submission-table"><div className="submission-table-head"><span>提交 ID</span><span>题目</span><span>状态</span><span>语言</span><span>耗时</span><span>时间</span></div>{rows.map((row) => <a href={`/problem/${row.contestId ?? ""}${row.index}`} className="submission-table-row" key={row.id}><span>#{row.id}</span><span><b>{row.code}</b><small>{row.title}</small></span><span><Pill>{verdictLabel[row.verdict] ?? row.verdict}</Pill></span><span>{row.language}</span><span>{row.timeMs} ms</span><span>{new Date(row.createdAt).toLocaleDateString("zh-CN")}</span></a>)}</section> : <div className="panel empty-state submissions-empty"><Icon name="history" /><h3>{status === "ready" ? "没有公开提交" : "等待绑定 Handle"}</h3><p>这里不会使用你提供的邮箱作为 Codeforces 用户名，因为二者不是同一个字段。</p></div>}
  </AppShell>;
}
