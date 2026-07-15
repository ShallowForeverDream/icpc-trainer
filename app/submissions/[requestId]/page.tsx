"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppShell, Icon } from "../../components/AppShell";
import { archivePracticeProblem, findArchiveContest } from "../../data/archive-contests";
import { SUBMIT_EXTENSION_LABEL, SUBMIT_EXTENSION_VERSION } from "../../lib/extension-config";
import { createSubmissionRequestId, loadPlatformSubmissionDetail, recordPlatformSubmission, subscribePlatformSubmissions, type PlatformSubmissionDetail } from "../../lib/platform-submissions";

const STATUS_LABEL: Record<PlatformSubmissionDetail["status"], string> = {
  queued: "连接评测站", submitted: "正在评测", accepted: "Accepted", rejected: "未通过", failed: "提交失败", needs_login: "需要登录",
};

function sourceFileName(language: string) {
  if (/Python|PyPy/.test(language)) return "main.py";
  if (/Java/.test(language)) return "Main.java";
  if (/Kotlin/.test(language)) return "Main.kt";
  if (/Rust/.test(language)) return "main.rs";
  if (/C11/.test(language)) return "main.c";
  return "main.cpp";
}

function archiveLanguageValue(language: string) {
  if (/C\+\+23/.test(language)) return "C++23";
  if (/C\+\+17/.test(language)) return "C++17";
  if (/C11/.test(language)) return "C11";
  if (/PyPy/.test(language)) return "PyPy3";
  if (/Python/.test(language)) return "Python3";
  if (/Java 21/.test(language)) return "Java21";
  if (/Java/.test(language)) return "Java17";
  if (/Kotlin/.test(language)) return "Kotlin";
  if (/Rust/.test(language)) return "Rust";
  return "C++20";
}

async function copyText(value: string) {
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

export default function SubmissionDetailPage() {
  const params = useParams<{ requestId: string }>();
  const requestId = decodeURIComponent(params.requestId || "");
  const [submission, setSubmission] = useState<PlatformSubmissionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [extensionReady, setExtensionReady] = useState(false);
  const [retryState, setRetryState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [retryMessage, setRetryMessage] = useState("");
  const [retryRequestId, setRetryRequestId] = useState("");
  const retryRequestIdRef = useRef("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadPlatformSubmissionDetail(requestId).then((value) => {
      if (!active) return;
      setSubmission(value);
      setLoading(false);
    });
    return () => { active = false; };
  }, [requestId]);

  useEffect(() => subscribePlatformSubmissions((rows) => {
    const updated = rows.find((row) => row.requestId === requestId);
    if (updated) setSubmission((current) => current ? { ...current, ...updated } : { ...updated, sourceCode: "" });
  }), [requestId]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== "icpc-trainer-extension") return;
      if (event.data.type === "ICPC_TRAINER_PONG") setExtensionReady(event.data.version === SUBMIT_EXTENSION_VERSION);
      if (event.data.type !== "ICPC_TRAINER_SUBMIT_RESULT" || event.data.requestId !== retryRequestIdRef.current) return;
      const stage = String(event.data.stage || "");
      setRetryMessage(typeof event.data.message === "string" ? event.data.message : "重试提交状态已更新");
      setRetryState(["queued", "submitted", "judged"].includes(stage) ? "sent" : "error");
    };
    window.addEventListener("message", receive);
    window.postMessage({ source: "icpc-trainer", type: "ICPC_TRAINER_PING" }, window.location.origin);
    return () => window.removeEventListener("message", receive);
  }, []);

  async function retrySubmission() {
    if (!submission?.sourceCode) return;
    setRetryState("sending");
    setRetryMessage("正在重新创建提交任务…");
    const nextRequestId = createSubmissionRequestId();
    retryRequestIdRef.current = nextRequestId;
    setRetryRequestId(nextRequestId);
    try {
      const archiveContest = submission.judge !== "codeforces" && submission.archiveContestId ? findArchiveContest(submission.archiveContestId) : null;
      const archiveProblem = archiveContest && submission.slot ? archivePracticeProblem(archiveContest, submission.slot) : null;
      if (submission.judge !== "codeforces" && (!archiveContest || !archiveProblem)) throw new Error("这条记录缺少历届赛评测映射，无法自动重试");
      await recordPlatformSubmission({
        requestId: nextRequestId,
        judge: submission.judge,
        problemCode: submission.problemCode,
        problemTitle: submission.problemTitle,
        problemHref: submission.problemHref,
        contestId: submission.contestId,
        problemIndex: submission.problemIndex,
        language: submission.language,
        status: "queued",
        message: "正在重新连接评测站",
        archiveContestId: submission.archiveContestId,
        slot: submission.slot,
        sourceCode: submission.sourceCode,
      });
      if (submission.judge === "codeforces") {
        const archiveScoped = Boolean(submission.archiveContestId && submission.slot);
        window.postMessage({
          source: "icpc-trainer",
          type: "ICPC_TRAINER_SUBMIT",
          payload: {
            requestId: nextRequestId,
            contestId: submission.contestId,
            index: submission.problemIndex,
            languageLabel: submission.language,
            sourceCode: submission.sourceCode,
            isGym: archiveScoped,
            archiveContestId: archiveScoped ? submission.archiveContestId : undefined,
            slot: archiveScoped ? submission.slot : undefined,
            autoSubmit: true,
          },
        }, window.location.origin);
      } else {
        const contest = archiveContest!;
        const problem = archiveProblem!;
        window.postMessage({
          source: "icpc-trainer",
          type: "ICPC_TRAINER_ARCHIVE_SUBMIT",
          payload: {
            requestId: nextRequestId,
            judge: problem.judge,
            archiveContestId: contest.id,
            qojContestId: problem.judge === "ucup" ? contest.qojContestId : undefined,
            problemId: problem.id,
            luoguContestId: problem.judge === "luogu" ? contest.luoguContestId : undefined,
            luoguProblemId: problem.judge === "luogu" ? problem.luoguProblemId : undefined,
            slot: submission.slot,
            submitUrl: problem.submitUrl,
            sourceCode: submission.sourceCode,
            languageValue: archiveLanguageValue(submission.language),
            languageLabel: submission.language,
            autoSubmit: true,
          },
        }, window.location.origin);
      }
      setRetryMessage("已重新交给浏览器扩展，正在连接评测站…");
    } catch (error) {
      setRetryState("error");
      setRetryMessage(error instanceof Error ? error.message : "重试提交失败");
    }
  }

  return <AppShell active="提交记录">
    <div className="submission-detail-back"><Link href="/submissions">← 返回提交记录</Link></div>
    {loading ? <div className="panel submission-detail-empty"><div className="statement-loader" /><h2>正在读取提交记录</h2></div> : !submission ? <div className="panel submission-detail-empty"><Icon name="history" /><h2>没有找到这条提交</h2><p>它可能属于另一账号，或尚未同步到服务器。</p><Link className="button button-primary" href="/submissions">返回提交记录</Link></div> : <>
      <section className="submission-detail-hero">
        <div><span>{submission.judge === "codeforces" ? "Codeforces" : submission.judge === "luogu" ? "洛谷" : "Universal Cup / QOJ"}</span><h1>{submission.problemCode} · {submission.problemTitle}</h1><p>{new Date(submission.createdAt).toLocaleString("zh-CN")} · {submission.language}{submission.judgeSubmissionId ? ` · 评测站提交编号 #${submission.judgeSubmissionId}` : ""}</p></div>
        <strong className={`submission-state ${submission.status}`}>{STATUS_LABEL[submission.status]}</strong>
      </section>
      <section className="submission-detail-grid">
        <article className="submission-code-card">
          <header><div><i /> {sourceFileName(submission.language)}</div><button type="button" disabled={!submission.sourceCode} onClick={() => void copyText(submission.sourceCode).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1500); })}>{copied ? "已复制 ✓" : "复制代码"}</button></header>
          {submission.sourceCode ? <pre><code>{submission.sourceCode}</code></pre> : <div className="submission-source-missing"><b>源代码未同步</b><span>这通常是服务器尚未更新，或该记录来自旧版扩展。</span></div>}
        </article>
        <aside className="submission-result-card">
          <span>判题结果</span><h2>{STATUS_LABEL[submission.status]}</h2><p>{submission.message}</p>
          <dl><div><dt>题目</dt><dd>{submission.problemCode}</dd></div><div><dt>语言</dt><dd>{submission.language}</dd></div><div><dt>代码大小</dt><dd>{submission.sourceBytes ? `${(submission.sourceBytes / 1024).toFixed(1)} KB` : "—"}</dd></div><div><dt>最后更新</dt><dd>{new Date(submission.updatedAt).toLocaleString("zh-CN")}</dd></div></dl>
          {["failed", "needs_login"].includes(submission.status) ? <div className="submission-retry"><button type="button" onClick={() => void retrySubmission()} disabled={!submission.sourceCode || !extensionReady || retryState === "sending"}>{retryState === "sending" ? "正在重新提交…" : "重新连接并提交"}</button><small>{retryMessage || (submission.sourceCode ? extensionReady ? `${SUBMIT_EXTENSION_LABEL} 已连接，将复用这份代码` : `请先安装或重新加载 ${SUBMIT_EXTENSION_LABEL}` : "后端升级后才能读取源代码并一键重试")}</small>{retryRequestId ? <Link href={`/submissions/${retryRequestId}`}>查看新的提交记录 →</Link> : null}</div> : null}
          <Link className="button button-primary" href={submission.problemHref}>返回题面继续训练 →</Link>
        </aside>
      </section>
    </>}
  </AppShell>;
}
