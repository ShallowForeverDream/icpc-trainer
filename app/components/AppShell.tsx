"use client";

import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { authFetch, readAuth, type AuthUser } from "../lib/auth-client";
import { applyArchiveJudgeVerdict } from "../lib/archive-vp-session";
import { updatePlatformSubmission } from "../lib/platform-submissions";
import { getTrainingClientId } from "../lib/training-client";

export function Icon({ name }: { name: string }) {
  const icons: Record<string, string> = { grid: "▦", search: "⌕", trophy: "♜", code: "⌘", history: "↻", star: "☆", play: "▶", fire: "♨", clock: "◷", shuffle: "⤨", spark: "✦", bell: "◉", chevron: "›", check: "✓", lock: "▣", team: "♟", book: "▤", filter: "≡", upload: "↑" };
  return <span className={`icon icon-${name}`} aria-hidden="true">{icons[name] ?? "·"}</span>;
}

export function AppShell({ children, active }: { children: ReactNode; active: string }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackRating, setFeedbackRating] = useState(5);
  const [feedbackCategory, setFeedbackCategory] = useState("训练体验");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackState, setFeedbackState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const feedbackTrigger = useRef<HTMLButtonElement>(null);
  const feedbackClose = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const refresh = () => setUser(readAuth()?.user ?? null);
    refresh(); window.addEventListener("icpc-auth-change", refresh);
    return () => window.removeEventListener("icpc-auth-change", refresh);
  }, []);
  useEffect(() => {
    const receiveJudgeStatus = (event: MessageEvent) => {
      const data = event.data;
      if (event.source !== window || event.origin !== window.location.origin || data?.source !== "icpc-trainer-extension" || data.type !== "ICPC_TRAINER_SUBMIT_RESULT" || typeof data.requestId !== "string") return;
      if (data.stage === "judged" && ["AC", "WA"].includes(data.verdict)) {
        const status = data.verdict === "AC" ? "accepted" : "rejected";
        void updatePlatformSubmission(data.requestId, status, typeof data.message === "string" ? data.message : data.verdict);
        if (["ucup", "codeforces"].includes(data.judge) && typeof data.archiveContestId === "string" && typeof data.slot === "string") {
          void applyArchiveJudgeVerdict({ contestId: data.archiveContestId, slot: data.slot, verdict: data.verdict, requestId: data.requestId });
        }
      }
    };
    window.addEventListener("message", receiveJudgeStatus);
    return () => window.removeEventListener("message", receiveJudgeStatus);
  }, []);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") { event.preventDefault(); location.assign("/problem"); }
      if (event.key === "Escape") {
        if (feedbackOpen) { setFeedbackOpen(false); feedbackTrigger.current?.focus(); }
        setMobileOpen(false);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [feedbackOpen]);
  useEffect(() => {
    if (!feedbackOpen) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    feedbackClose.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; };
  }, [feedbackOpen]);
  const nav = [
    ["训练台", "/", "grid"], ["沈阳冲刺", "/sprint", "fire"], ["题库", "/problem", "search"], ["模拟赛", "/vp", "trophy"],
    ["模板库", "/templates", "code"], ["提交记录", "/submissions", "history"], ["收藏", "/favorites", "star"],
  ];
  if (user?.role === "admin") nav.push(["管理", "/admin", "team"]);

  async function submitFeedback(event: FormEvent) {
    event.preventDefault();
    setFeedbackState("sending");
    try {
      const response = await authFetch("/feedback", { method: "POST", body: JSON.stringify({ clientId: getTrainingClientId(), category: feedbackCategory, rating: feedbackRating, message: feedbackMessage, page: location.pathname }) });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "提交失败");
      setFeedbackState("sent");
      setFeedbackMessage("");
    } catch { setFeedbackState("error"); }
  }

  return (
    <div className="app-frame">
      <aside className={`sidebar ${mobileOpen ? "mobile-open" : ""}`}>
        <Link className="brand" href="/"><span className="brand-mark"><i /><i /><i /></span><span>icpc-<em>trainer</em></span></Link>
        <nav id="primary-navigation">
          {nav.map(([label, href, icon]) => <Link key={label} href={href} onClick={() => setMobileOpen(false)} className={active === label ? "active" : ""}><Icon name={icon} /><span>{label}</span>{active === label && <i className="nav-indicator" />}</Link>)}
        </nav>
        <Link className="profile-mini" href={user ? "/account" : "/login"}><span>{user ? user.email.slice(0, 2).toUpperCase() : "S2"}</span><div><b>{user ? user.email : "登录 / 注册"}</b><small>{user ? (user.role === "admin" ? "管理员账号" : "训练账号") : "邀请码注册"}</small></div><Icon name="chevron" /></Link>
      </aside>
      {mobileOpen ? <button className="sidebar-backdrop" aria-label="关闭菜单" onClick={() => setMobileOpen(false)} /> : null}
      <main>
        <header className="topbar">
          <button className="mobile-menu" onClick={() => setMobileOpen(!mobileOpen)} aria-expanded={mobileOpen} aria-controls="primary-navigation" aria-label={mobileOpen ? "关闭菜单" : "打开菜单"}>☰</button>
          <div className="crumb"><b>{active}</b></div>
          <div className="top-actions">
            <Link className="account-button" href={user ? "/account" : "/login"}>{user ? "账号" : "登录"}</Link>
            <Link className="quick-button" href="/vp">创建 VP</Link>
          </div>
        </header>
        <div className="page-content">{children}</div>
      </main>
      <button ref={feedbackTrigger} className="feedback-fab" onClick={() => { setFeedbackOpen(true); setFeedbackState("idle"); }} aria-label="提交体验建议"><Icon name="spark" /> 体验建议</button>
      {feedbackOpen ? <div className="feedback-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setFeedbackOpen(false); }}>
        <form className="feedback-dialog" onSubmit={submitFeedback} role="dialog" aria-modal="true" aria-labelledby="feedback-title">
          <button ref={feedbackClose} className="feedback-close" type="button" onClick={() => { setFeedbackOpen(false); feedbackTrigger.current?.focus(); }} aria-label="关闭">×</button>
          {feedbackState === "sent" ? <div className="feedback-thanks"><span>✓</span><h2 id="feedback-title">建议已收到</h2><p>我们会按“影响训练效率”的优先级整理和改进。</p><button className="button button-primary" type="button" onClick={() => setFeedbackOpen(false)}>完成</button></div> : <>
            <span className="micro-label">HELP US TRAIN BETTER</span><h2 id="feedback-title">哪里影响了你的训练？</h2><p>欢迎指出选题不准、题面难读、流程打断或希望增加的训练方式。</p>
            <div className="feedback-rating" role="group" aria-label="体验评分">{[1, 2, 3, 4, 5].map((value) => <button type="button" aria-pressed={feedbackRating === value} className={feedbackRating === value ? "active" : ""} key={value} onClick={() => setFeedbackRating(value)} aria-label={`${value} 分`}>{value}</button>)}</div>
            <label>问题类型<select value={feedbackCategory} onChange={(event) => setFeedbackCategory(event.target.value)}><option>训练体验</option><option>推荐不准确</option><option>题面与翻译</option><option>VP 与榜单</option><option>功能建议</option><option>故障反馈</option></select></label>
            <label>你的建议<textarea value={feedbackMessage} onChange={(event) => setFeedbackMessage(event.target.value)} minLength={8} maxLength={2000} placeholder="例如：推荐题为什么不适合、在哪一步卡住、你希望怎样训练……" required /></label>
            {feedbackState === "error" ? <p className="form-error">暂时未能提交，请稍后重试。</p> : null}
            <button className="button button-primary" disabled={feedbackState === "sending"}>{feedbackState === "sending" ? "正在提交…" : "提交建议"}</button>
          </>}
        </form>
      </div> : null}
    </div>
  );
}

export function MetricCard({ label, value, delta, tone }: { label: string; value: string; delta: string; tone: string }) {
  return <div className={`metric-card tone-${tone}`}><div><span>{label}</span><b>{value}</b></div><em>{delta}</em><i /></div>;
}

export function Pill({ children }: { children: ReactNode }) { return <span className="pill">{children}</span>; }

export function ProblemRow({ problem, index, training = false, concealMeta = false }: { problem: { code: string; title: string; titleZh?: string; rating: number; tags: string[]; status?: string }; index: number; training?: boolean; concealMeta?: boolean }) {
  const query = training ? "?training=1" : "";
  return <Link className={`problem-row${concealMeta ? " concealed-problem" : ""}`} href={`/problem/${problem.code.replace("CF ", "")}${query}`}><span className="problem-index">{String(index).padStart(2, "0")}</span><div className="problem-main"><span>{problem.code}</span><b>{problem.titleZh ? `${problem.titleZh} · ${problem.title}` : problem.title}</b><div>{concealMeta ? <Pill>赛场模式 · 标签已隐藏</Pill> : problem.tags.map(tag => <Pill key={tag}>{tag}</Pill>)}</div></div><div className="rating"><small>{concealMeta ? "CHALLENGE" : "RATING"}</small><b>{concealMeta ? "?" : problem.rating}</b></div><span className="problem-arrow">→</span></Link>;
}
