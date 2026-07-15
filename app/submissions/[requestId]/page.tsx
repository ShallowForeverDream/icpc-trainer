"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { AppShell, Icon } from "../../components/AppShell";
import { loadPlatformSubmissionDetail, subscribePlatformSubmissions, type PlatformSubmissionDetail } from "../../lib/platform-submissions";

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

  return <AppShell active="提交记录">
    <div className="submission-detail-back"><Link href="/submissions">← 返回提交记录</Link></div>
    {loading ? <div className="panel submission-detail-empty"><div className="statement-loader" /><h2>正在读取提交记录</h2></div> : !submission ? <div className="panel submission-detail-empty"><Icon name="history" /><h2>没有找到这条提交</h2><p>它可能属于另一账号，或尚未同步到服务器。</p><Link className="button button-primary" href="/submissions">返回提交记录</Link></div> : <>
      <section className="submission-detail-hero">
        <div><span>{submission.judge === "codeforces" ? "Codeforces" : "Universal Cup / QOJ"}</span><h1>{submission.problemCode} · {submission.problemTitle}</h1><p>{new Date(submission.createdAt).toLocaleString("zh-CN")} · {submission.language}{submission.judgeSubmissionId ? ` · 评测站提交编号 #${submission.judgeSubmissionId}` : ""}</p></div>
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
          <Link className="button button-primary" href={submission.problemHref}>返回题面继续训练 →</Link>
        </aside>
      </section>
    </>}
  </AppShell>;
}
