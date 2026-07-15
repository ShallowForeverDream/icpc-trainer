"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";
import { apiJson } from "../lib/api-client";
import { loadPlatformSubmissions, subscribePlatformSubmissions, type PlatformSubmission } from "../lib/platform-submissions";
import { readTrainerPreferences, saveTrainerPreferences, validCodeforcesHandle } from "../lib/preferences";

type Submission = { id: number; createdAt: string; code: string; contestId?: number; index: string; title: string; verdict: string; language: string; timeMs: number };
const verdictLabel: Record<string, string> = { OK: "Accepted", WRONG_ANSWER: "Wrong answer", TIME_LIMIT_EXCEEDED: "Time limit", MEMORY_LIMIT_EXCEEDED: "Memory limit", RUNTIME_ERROR: "Runtime error", TESTING: "Testing" };
const proxyStatus: Record<PlatformSubmission["status"], string> = { queued: "连接中", submitted: "评测中", accepted: "Accepted", rejected: "未通过", failed: "提交失败", needs_login: "需要登录" };

export default function SubmissionsPage() {
  const [tab, setTab] = useState<"platform" | "codeforces">("platform");
  const [platformRows, setPlatformRows] = useState<PlatformSubmission[]>([]);
  const [handle, setHandle] = useState("ShallowDream2");
  const [rows, setRows] = useState<Submission[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [message, setMessage] = useState("同步 Codeforces 最终判题结果");
  const requestRef = useRef<AbortController | null>(null);

  async function syncHandle(nextHandle: string, persist: boolean) {
    const normalized = nextHandle.trim();
    if (!validCodeforcesHandle(normalized)) { setStatus("error"); setMessage("请输入有效的 Codeforces Handle"); return; }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setStatus("loading");
    try {
      const data = await apiJson<{ handle: string; submissions: Submission[] }>(`/codeforces/submissions?handle=${encodeURIComponent(normalized)}`, { cache: "no-store", signal: controller.signal });
      if (persist) {
        const preferences = readTrainerPreferences();
        saveTrainerPreferences({ ...preferences, codeforcesHandle: normalized });
      }
      setRows(data.submissions);
      setMessage(`已同步 ${data.handle} 最近 ${data.submissions.length} 条记录`);
      setStatus("ready");
    } catch (error) {
      if (controller.signal.aborted) return;
      setRows([]);
      setMessage(error instanceof Error ? error.message : "同步失败");
      setStatus("error");
    }
  }

  function sync(event: FormEvent) { event.preventDefault(); void syncHandle(handle, true); }

  useEffect(() => {
    void loadPlatformSubmissions().then(setPlatformRows);
    const unsubscribe = subscribePlatformSubmissions(setPlatformRows);
    const savedHandle = readTrainerPreferences().codeforcesHandle;
    setHandle(savedHandle);
    void syncHandle(savedHandle, false);
    return () => { unsubscribe(); requestRef.current?.abort(); };
  }, []);

  return <AppShell active="提交记录">
    <section className="library-hero"><div><span className="eyebrow"><span className="live-dot" /> PLATFORM SUBMISSIONS</span><h1>提交记录</h1><p>站内提交会立即出现，最终判题结果从评测站同步。</p></div></section>
    <div className="submission-tabs" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "platform"} className={tab === "platform" ? "active" : ""} onClick={() => setTab("platform")}>平台提交 <b>{platformRows.length}</b></button>
      <button type="button" role="tab" aria-selected={tab === "codeforces"} className={tab === "codeforces" ? "active" : ""} onClick={() => setTab("codeforces")}>Codeforces 判题 <b>{rows.length}</b></button>
    </div>

    {tab === "platform" ? <>
      {platformRows.length ? <section className="submission-table"><div className="submission-table-head"><span>提交</span><span>题目</span><span>状态</span><span>语言</span><span>评测站</span><span>时间</span></div>{platformRows.map((row) => <Link href={`/submissions/${row.requestId}`} className="submission-table-row" key={row.requestId}><span>#{row.judgeSubmissionId || row.requestId.slice(0, 8)}</span><span><b>{row.problemCode}</b><small>{row.problemTitle}</small></span><span><Pill>{proxyStatus[row.status]}</Pill><small>{row.message}</small></span><span>{row.language}</span><span>{row.judge === "codeforces" ? "Codeforces" : "UCup / QOJ"}</span><span>{new Date(row.createdAt).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" })}</span></Link>)}</section> : <div className="panel empty-state submissions-empty"><Icon name="history" /><h3>还没有站内提交</h3><p>从题面或 VP 点击“直接提交”，记录会立即出现在这里。</p></div>}
    </> : <>
      <form className="handle-form" onSubmit={sync}>
        <label><span>Codeforces Handle</span><input value={handle} onChange={(event) => setHandle(event.target.value)} placeholder="例如 ShallowDream2" autoComplete="off" /></label>
        <button className="button button-primary" type="submit" disabled={status === "loading"}><Icon name="history" /> {status === "loading" ? "同步中…" : "同步最终结果"}</button>
        <small className={status === "error" ? "form-error" : ""}>{message}</small>
      </form>
      {rows.length ? <section className="submission-table"><div className="submission-table-head"><span>提交 ID</span><span>题目</span><span>状态</span><span>语言</span><span>耗时</span><span>时间</span></div>{rows.map((row) => <Link href={`/problem/${row.contestId ?? ""}${row.index}`} className="submission-table-row" key={row.id}><span>#{row.id}</span><span><b>{row.code}</b><small>{row.title}</small></span><span><Pill>{verdictLabel[row.verdict] ?? row.verdict}</Pill></span><span>{row.language}</span><span>{row.timeMs} ms</span><span>{new Date(row.createdAt).toLocaleDateString("zh-CN")}</span></Link>)}</section> : <div className="panel empty-state submissions-empty"><Icon name="history" /><h3>{status === "ready" ? "没有公开提交" : "等待同步"}</h3></div>}
    </>}
  </AppShell>;
}
