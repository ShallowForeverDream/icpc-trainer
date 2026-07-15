"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SUBMIT_EXTENSION_LABEL, SUBMIT_EXTENSION_VERSION } from "../lib/extension-config";
import type { PlatformJudge } from "../lib/platform-submissions";

type JudgeSession = { status?: "ready" | "signed_out" | "challenge" | "unreachable" | "unknown"; message?: string };
type SessionMap = Partial<Record<PlatformJudge, JudgeSession>>;

const JUDGE_NAME: Record<PlatformJudge, string> = { codeforces: "Codeforces", ucup: "Universal Cup", luogu: "洛谷" };

export function JudgeReadiness({ judges, label = "提交环境" }: { judges: PlatformJudge[]; label?: string }) {
  const required = useMemo(() => [...new Set(judges)], [judges]);
  const [extensionState, setExtensionState] = useState<"checking" | "ready" | "old" | "missing">("checking");
  const [sessions, setSessions] = useState<SessionMap>({});
  const timeoutRef = useRef<number | null>(null);

  const check = useCallback(() => {
    setExtensionState("checking");
    window.postMessage({ source: "icpc-trainer", type: "ICPC_TRAINER_PING" }, window.location.origin);
    window.postMessage({ source: "icpc-trainer", type: "ICPC_TRAINER_HEALTH_CHECK" }, window.location.origin);
    if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    timeoutRef.current = window.setTimeout(() => setExtensionState((current) => current === "checking" ? "missing" : current), 1800);
  }, []);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.source !== window || event.origin !== window.location.origin || event.data?.source !== "icpc-trainer-extension") return;
      if (event.data.type === "ICPC_TRAINER_PONG") setExtensionState(event.data.version === SUBMIT_EXTENSION_VERSION ? "ready" : "old");
      if (event.data.type === "ICPC_TRAINER_HEALTH_RESULT") {
        setExtensionState(event.data.version === SUBMIT_EXTENSION_VERSION ? "ready" : "old");
        setSessions(event.data.sessions && typeof event.data.sessions === "object" ? event.data.sessions : {});
      }
    };
    window.addEventListener("message", receive);
    window.postMessage({ source: "icpc-trainer", type: "ICPC_TRAINER_PING" }, window.location.origin);
    window.postMessage({ source: "icpc-trainer", type: "ICPC_TRAINER_HEALTH_CHECK" }, window.location.origin);
    timeoutRef.current = window.setTimeout(() => setExtensionState((current) => current === "checking" ? "missing" : current), 1800);
    return () => {
      window.removeEventListener("message", receive);
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
    };
  }, [check]);

  const unready = required.filter((judge) => sessions[judge]?.status !== "ready");
  const ready = extensionState === "ready" && unready.length === 0;
  const detail = extensionState === "missing"
    ? `未检测到 ${SUBMIT_EXTENSION_LABEL}`
    : extensionState === "old"
      ? `${SUBMIT_EXTENSION_LABEL} 版本过旧`
      : extensionState === "checking"
        ? "正在检测扩展和评测站登录状态"
        : unready.length
          ? unready.map((judge) => sessions[judge]?.message || `${JUDGE_NAME[judge]} 会话未就绪`).join(" · ")
          : `${required.map((judge) => JUDGE_NAME[judge]).join(" / ")} 可直接提交`;

  return <section className={`judge-readiness${ready ? " ready" : extensionState === "checking" ? " checking" : " warning"}`} aria-live="polite">
    <span>{ready ? "✓" : extensionState === "checking" ? "…" : "!"}</span>
    <div><b>{label}{ready ? "已就绪" : "需要检查"}</b><small>{detail}</small></div>
    {ready ? <button type="button" onClick={check}>重新检测</button> : <Link href="/extension">修复提交环境 →</Link>}
  </section>;
}
