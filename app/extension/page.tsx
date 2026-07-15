"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { useCallback, useEffect, useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";
import { apiFetch } from "../lib/api-client";
import { SUBMIT_EXTENSION_LABEL, SUBMIT_EXTENSION_VERSION } from "../lib/extension-config";

type CheckState = "checking" | "ready" | "warning" | "error";
type Check = { state: CheckState; title: string; detail: string };
type JudgeSession = { status?: "ready" | "signed_out" | "challenge" | "unreachable" | "unknown"; message?: string };

const checking: Check = { state: "checking", title: "检测中", detail: "正在检查…" };

function judgeCheck(name: string, session?: JudgeSession): Check {
  if (!session?.status) return { state: "warning", title: "等待扩展", detail: `安装扩展后检测 ${name}` };
  if (session.status === "ready") return { state: "ready", title: "已登录", detail: session.message || `${name} 会话可用` };
  if (session.status === "signed_out") return { state: "warning", title: "需要登录", detail: session.message || `${name} 尚未登录` };
  if (session.status === "challenge") return { state: "warning", title: "需要验证", detail: session.message || `${name} 需要人机验证` };
  return { state: "error", title: "连接异常", detail: session.message || `无法连接 ${name}` };
}

export default function ExtensionPage() {
  const [extension, setExtension] = useState<Check>(checking);
  const [backend, setBackend] = useState<Check>(checking);
  const [sessions, setSessions] = useState<{ codeforces?: JudgeSession; ucup?: JudgeSession }>({});

  const runCheck = useCallback(() => {
    setExtension(checking);
    setSessions({});
    window.postMessage({ source: "icpc-trainer", type: "ICPC_TRAINER_PING" }, window.location.origin);
    window.postMessage({ source: "icpc-trainer", type: "ICPC_TRAINER_HEALTH_CHECK" }, window.location.origin);
    window.setTimeout(() => setExtension((current) => current.state === "checking" ? { state: "error", title: "未连接", detail: `未检测到 ${SUBMIT_EXTENSION_LABEL} 扩展` } : current), 1800);

    setBackend(checking);
    void apiFetch("/health", { cache: "no-store" }, 7_000).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { status?: string; persistence?: Record<string, unknown> };
      if (!response.ok || payload.status !== "ok") throw new Error();
      const current = Boolean(payload.persistence && Object.prototype.hasOwnProperty.call(payload.persistence, "platformSubmissions"));
      setBackend(current
        ? { state: "ready", title: "已连接", detail: "提交与训练数据可持久保存" }
        : { state: "warning", title: "需要更新", detail: "服务器在线，但仍是旧版后端" });
    }).catch(() => setBackend({ state: "error", title: "未连接", detail: "训练服务器暂时不可用" }));
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== "icpc-trainer-extension") return;
      if (event.data.type === "ICPC_TRAINER_PONG") {
        const current = event.data.version === SUBMIT_EXTENSION_VERSION;
        setExtension(current
          ? { state: "ready", title: `${SUBMIT_EXTENSION_LABEL} 已连接`, detail: "后台提交桥接正常" }
          : { state: "warning", title: "扩展需要更新", detail: `当前 ${event.data.version || "未知版本"}，需要 ${SUBMIT_EXTENSION_LABEL}` });
      }
      if (event.data.type === "ICPC_TRAINER_HEALTH_RESULT" && event.data.version === SUBMIT_EXTENSION_VERSION && event.data.sessions && typeof event.data.sessions === "object") {
        setSessions(event.data.sessions);
      }
    };
    window.addEventListener("message", receive);
    runCheck();
    return () => window.removeEventListener("message", receive);
  }, [runCheck]);

  const codeforces = judgeCheck("Codeforces", sessions.codeforces);
  const ucup = judgeCheck("Universal Cup", sessions.ucup);
  const cards: Array<{ key: string; label: string; check: Check; action?: { href: string; label: string; download?: boolean } }> = [
    { key: "extension", label: "提交扩展", check: extension, action: extension.state === "ready" ? undefined : { href: "/icpc-trainer-extension.zip", label: `下载 ${SUBMIT_EXTENSION_LABEL}`, download: true } },
    { key: "backend", label: "训练服务器", check: backend },
    { key: "codeforces", label: "Codeforces", check: codeforces, action: codeforces.state === "ready" ? undefined : { href: "https://codeforces.com/enter", label: "登录 / 验证" } },
    { key: "ucup", label: "Universal Cup / QOJ", check: ucup, action: ucup.state === "ready" ? undefined : { href: "https://contest.ucup.ac/login", label: "登录" } },
  ];

  return <AppShell active="提交扩展">
    <section className="extension-hero">
      <div><span className="eyebrow"><span className="live-dot" /> CHROME / EDGE · MANIFEST V3</span><h1>留在平台，<br /><em>直接完成提交。</em></h1><p>一次安装后，Codeforces、Gym 与 Universal Cup / QOJ 均由平台后台提交并同步判题。</p><div className="hero-actions"><a className="button button-primary" href="/icpc-trainer-extension.zip" download><Icon name="spark" /> 下载扩展包 {SUBMIT_EXTENSION_LABEL}</a><button className="button button-ghost" type="button" onClick={runCheck}><Icon name="history" /> 重新检测</button></div></div>
      <div className="extension-flow"><div><b>01</b><span>选择文件或粘贴代码</span><Pill>站内完成</Pill></div><i>→</i><div><b>02</b><span>后台代理提交</span><Pill>无需跳转</Pill></div><i>→</i><div><b>03</b><span>平台同步判题</span><Pill>统一记录</Pill></div></div>
    </section>

    <section className="panel extension-readiness">
      <header><div><h2>赛前检查</h2><p>四项均正常即可开始 VP</p></div><button type="button" onClick={runCheck}>重新检测</button></header>
      <div>{cards.map((card) => <article className={`check-${card.check.state}`} key={card.key}><span>{card.check.state === "ready" ? "✓" : card.check.state === "checking" ? "…" : "!"}</span><div><small>{card.label}</small><b>{card.check.title}</b><p>{card.check.detail}</p></div>{card.action ? <a href={card.action.href} target={card.action.href.startsWith("http") ? "_blank" : undefined} rel={card.action.href.startsWith("http") ? "noreferrer" : undefined} download={card.action.download}>{card.action.label} →</a> : null}</article>)}</div>
    </section>

    <section className="install-grid">
      <article className="panel"><h2>首次安装</h2><ol><li>下载并解压扩展包。</li><li>打开 <code>chrome://extensions</code> 或 <code>edge://extensions</code>。</li><li>开启「开发者模式」，选择「加载已解压的扩展程序」。</li><li>选择解压后的扩展文件夹；以后更新时覆盖文件并点击“重新加载”。</li></ol></article>
      <article className="panel"><h2>数据边界</h2><ul><li>仅在点击“直接提交”后连接评测站。</li><li>提交源码保存在平台数据库，便于查看记录和赛后复盘。</li><li>评测站密码、Cookie 与验证信息始终留在浏览器。</li><li>登录失效或遇到验证时停止提交并显示处理入口。</li></ul></article>
    </section>
  </AppShell>;
}
