"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell, Pill } from "../components/AppShell";
import { authFetch, readAuth, type AuthUser } from "../lib/auth-client";

type Invite = { id: number; code?: string; codePrefix?: string; maxUses: number; usedCount: number; expiresAt: string; createdAt: string; status: "active" | "used" | "expired" };
type Feedback = { id: number; email: string | null; category: string; rating: number; message: string; page: string; status: string; createdAt: string };
type StatementReview = { kind: "codeforces" | "archive"; id: string; title: string; source: string; reviewed: boolean; official: boolean; href: string; reviewedAt: string | null; updatedAt: string };
type SystemHealth = {
  status: "ok";
  uptime: number;
  memory: { rssMiB: number; heapUsedMiB: number; heapTotalMiB: number; limitMiB?: number };
  caches: { storage: string; problemsets: number; submissions: number; contestStandings: number; archiveScoreboardSources: number; archiveScoreboardViews: number; codeforcesInFlight: number };
  persistence: { personalStates: number; platformSubmissions: number; activeVps: number; vpSnapshots: number };
  versions?: { api: number; statementTranslation: number; archiveStatementTranslation: number };
};

function uptimeText(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor(seconds % 86_400 / 3_600);
  const minutes = Math.floor(seconds % 3_600 / 60);
  return days ? `${days} 天 ${hours} 小时` : hours ? `${hours} 小时 ${minutes} 分` : `${minutes} 分钟`;
}

export default function AdminPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [statementReviews, setStatementReviews] = useState<StatementReview[]>([]);
  const [reviewServiceReady, setReviewServiceReady] = useState(true);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [healthCheckedAt, setHealthCheckedAt] = useState("");
  const [healthLoading, setHealthLoading] = useState(false);
  const [generated, setGenerated] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [view, setView] = useState<"invites" | "users" | "statements" | "feedback" | "system">("invites");

  const load = useCallback(async () => {
    const auth = readAuth();
    if (!auth) { location.replace("/login"); return; }
    if (auth.user.role !== "admin") { location.replace("/account"); return; }
    if (auth.user.mustChangePassword) { location.replace("/account"); return; }
    setLoading(true);
    try {
      const [usersResponse, invitesResponse, feedbackResponse, reviewsResponse, healthResponse] = await Promise.all([authFetch("/admin/users"), authFetch("/admin/invites"), authFetch("/admin/feedback"), authFetch("/codeforces/statements/review-queue?limit=300"), authFetch("/health").catch(() => null)]);
      if (!usersResponse.ok || !invitesResponse.ok || !feedbackResponse.ok) throw new Error("管理员登录已失效");
      setUsers(((await usersResponse.json()) as { users: AuthUser[] }).users);
      setInvites(((await invitesResponse.json()) as { invites: Invite[] }).invites);
      setFeedback(((await feedbackResponse.json()) as { feedback: Feedback[] }).feedback);
      if (reviewsResponse.ok) {
        setStatementReviews(((await reviewsResponse.json()) as { items: StatementReview[] }).items || []);
        setReviewServiceReady(true);
      } else {
        setStatementReviews([]);
        setReviewServiceReady(false);
      }
      if (healthResponse?.ok) {
        setSystemHealth((await healthResponse.json()) as SystemHealth);
        setHealthCheckedAt(new Date().toISOString());
      }
    } catch (error) { setMessage(error instanceof Error ? error.message : "加载失败"); } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function createInvite(event: FormEvent) {
    event.preventDefault(); setMessage(""); setGenerated("");
    try {
      const response = await authFetch("/admin/invites", { method: "POST", body: JSON.stringify({ maxUses, expiresInDays }) });
      const data = await response.json() as { invite?: Invite; error?: string };
      if (!response.ok || !data.invite?.code) throw new Error(data.error || "生成失败");
      setGenerated(data.invite.code); setMessage("邀请码已生成，请立即复制并发送给用户。邀请码明文不会再次显示。"); await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "生成失败"); }
  }

  async function copyCode() { if (generated) { await navigator.clipboard.writeText(generated); setMessage("邀请码已复制到剪贴板"); } }

  async function revokeInvite(invite: Invite) {
    if (!window.confirm(`确认撤销邀请码 ${invite.codePrefix}••••••••？撤销后不能恢复。`)) return;
    setActionId(invite.id); setMessage("");
    try {
      await mutateAdmin("/admin/invites/revoke", { id: invite.id });
      setMessage("邀请码已撤销");
      await load();
    } catch (error) { setMessage(error instanceof Error ? error.message : "撤销失败"); }
    finally { setActionId(null); }
  }

  async function updateFeedbackStatus(id: number, status: string) {
    setActionId(id); setMessage("");
    try {
      await mutateAdmin("/admin/feedback/status", { id, status });
      setFeedback((current) => current.map((item) => item.id === id ? { ...item, status } : item));
      setMessage("反馈状态已更新");
    } catch (error) { setMessage(error instanceof Error ? error.message : "更新失败"); }
    finally { setActionId(null); }
  }

  async function mutateAdmin(path: string, body: object) {
    const response = await authFetch(path, { method: "POST", body: JSON.stringify(body) });
    const data = await response.json() as { error?: string };
    if (!response.ok) throw new Error(data.error || "操作失败");
  }

  async function refreshHealth() {
    setHealthLoading(true);
    try {
      const response = await authFetch("/health", {}, 10_000);
      if (!response.ok) throw new Error("服务状态读取失败");
      setSystemHealth((await response.json()) as SystemHealth);
      setHealthCheckedAt(new Date().toISOString());
    } catch (error) {
      setSystemHealth(null);
      setMessage(error instanceof Error ? error.message : "服务状态读取失败");
    } finally { setHealthLoading(false); }
  }

  return <AppShell active="管理">
    <section className="admin-hero">
      <div><h1>管理</h1><p>注册、用户与反馈</p></div>
      <div className="admin-metrics"><span><b>{users.length}</b>用户</span><span><b>{invites.filter((item) => item.status === "active").length}</b>有效邀请码</span><span><b>{statementReviews.filter((item) => !item.reviewed).length}</b>待校对题面</span></div>
    </section>
    <div className="admin-tabs" role="tablist">
      <button className={view === "invites" ? "active" : ""} onClick={() => setView("invites")}>邀请码</button>
      <button className={view === "users" ? "active" : ""} onClick={() => setView("users")}>用户</button>
      <button className={view === "statements" ? "active" : ""} onClick={() => setView("statements")}>题面校对</button>
      <button className={view === "feedback" ? "active" : ""} onClick={() => setView("feedback")}>反馈</button>
      <button className={view === "system" ? "active" : ""} onClick={() => setView("system")}>系统</button>
    </div>
    {view === "invites" ? <div className="admin-grid">
      <form className="panel admin-create" onSubmit={createInvite}>
        <h2>生成邀请码</h2>
        <label>可注册人数<input type="number" min="1" max="100" value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} /></label>
        <div className="invite-presets">{[1, 5, 10, 20].map((value) => <button type="button" className={maxUses === value ? "active" : ""} onClick={() => setMaxUses(value)} key={value}>{value} 次</button>)}</div>
        <label>有效天数<input type="number" min="1" max="365" value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))} /></label>
        <button className="button button-primary">生成</button>
        {generated ? <div className="invite-result"><small>仅显示一次</small><code>{generated}</code><button type="button" onClick={copyCode}>复制</button></div> : null}
        {message ? <p className={message.includes("失败") || message.includes("失效") ? "form-error" : "form-success"}>{message}</p> : null}
      </form>
      <section className="panel admin-table">
        <div className="panel-head"><h2>邀请码</h2></div>
        {loading ? <div className="loading-panel">加载中…</div> : invites.length ? <div className="admin-list invite-admin-list">{invites.map((invite) => <div key={invite.id}><code>{invite.codePrefix}••••••••</code><span>{invite.usedCount} / {invite.maxUses}</span><span>{new Date(invite.expiresAt).toLocaleDateString("zh-CN")}</span><Pill>{invite.status === "active" ? "有效" : invite.status === "used" ? "已用完" : "已过期"}</Pill>{invite.status === "active" ? <button type="button" disabled={actionId === invite.id} onClick={() => void revokeInvite(invite)}>撤销</button> : <span>—</span>}</div>)}</div> : <div className="loading-panel">暂无邀请码</div>}
      </section>
    </div> : null}
    {view === "users" ? <section className="panel users-panel"><div className="panel-head"><h2>注册用户</h2></div><div className="admin-list user-list">{users.map((user) => <div key={user.id}><span className="user-avatar">{user.email.slice(0, 2).toUpperCase()}</span><b>{user.email}</b><Pill>{user.role === "admin" ? "管理员" : "用户"}</Pill><span>{new Date(user.createdAt).toLocaleDateString("zh-CN")}</span></div>)}</div></section> : null}
    {view === "statements" ? <section className="panel statement-review-queue"><div className="panel-head"><div><h2>中文题面校对</h2><p>优先处理沈阳训练中实际打开的机器翻译题面。</p></div><span>{statementReviews.filter((item) => !item.reviewed).length} 待校对</span></div>{!reviewServiceReady ? <div className="loading-panel">阿里云后端升级后会启用题面校对队列。</div> : loading ? <div className="loading-panel">加载中…</div> : statementReviews.length ? <div className="statement-review-list">{statementReviews.map((item) => <a href={item.href} key={`${item.kind}:${item.id}`}><span className={`review-state${item.reviewed ? " reviewed" : ""}`}>{item.official ? "官方" : item.reviewed ? "已校对" : "待校对"}</span><div><b>{item.title}</b><small>{item.source} · 更新于 {new Date(item.updatedAt).toLocaleDateString("zh-CN")}</small></div><em>{item.reviewed && !item.official ? "重新校对 →" : item.official ? "查看题面 →" : "开始校对 →"}</em></a>)}</div> : <div className="loading-panel">目前没有需要校对的动态题面</div>}</section> : null}
    {view === "feedback" ? <section className="panel users-panel"><div className="panel-head"><h2>反馈</h2><span>{feedback.length} 条</span></div>{feedback.length ? <div className="feedback-admin-list">{feedback.map((item) => <article key={item.id}><div><Pill>{item.category}</Pill><b>{"★".repeat(item.rating)}{"☆".repeat(5 - item.rating)}</b><time>{new Date(item.createdAt).toLocaleString("zh-CN")}</time><select aria-label="反馈处理状态" value={item.status} disabled={actionId === item.id} onChange={(event) => void updateFeedbackStatus(item.id, event.target.value)}><option value="new">待处理</option><option value="reviewed">已查看</option><option value="planned">已计划</option><option value="done">已完成</option></select></div><p>{item.message}</p><small>{item.email || "匿名用户"}</small></article>)}</div> : <div className="loading-panel">暂无反馈</div>}</section> : null}
    {view === "system" ? <section className="panel system-health-panel">
      <div className="panel-head"><div><h2>系统状态</h2><p>{healthCheckedAt ? `更新于 ${new Date(healthCheckedAt).toLocaleTimeString("zh-CN")}` : "检查国内 API 与持久化存储"}</p></div><button type="button" onClick={() => void refreshHealth()} disabled={healthLoading}>{healthLoading ? "检查中…" : "刷新"}</button></div>
      {systemHealth ? <>
        <div className="system-health-status"><i /><b>运行正常</b><span>数据写入 SQLite，重启不会丢失</span></div>
        <div className="system-health-grid">
          <article><span>API 内存</span><b>{systemHealth.memory.rssMiB} <small>/ {systemHealth.memory.limitMiB || 512} MiB</small></b><em>堆内存 {systemHealth.memory.heapUsedMiB} MiB</em></article>
          <article><span>持续运行</span><b>{uptimeText(systemHealth.uptime)}</b><em>自动健康检查已启用</em></article>
          <article><span>持久化数据</span><b>{systemHealth.persistence.platformSubmissions} <small>次提交</small></b><em>{systemHealth.persistence.personalStates} 条个人状态 · {systemHealth.persistence.activeVps} 场 VP</em></article>
          <article><span>题面版本</span><b>{systemHealth.versions ? `API v${systemHealth.versions.api}` : "待升级"}</b><em>{systemHealth.versions ? `CF ${systemHealth.versions.statementTranslation} · 历届赛 ${systemHealth.versions.archiveStatementTranslation}` : "升级阿里云后显示版本"}</em></article>
        </div>
        <div className="system-cache-row"><span>题库缓存 <b>{systemHealth.caches.problemsets}</b></span><span>提交缓存 <b>{systemHealth.caches.submissions}</b></span><span>CF 榜单 <b>{systemHealth.caches.contestStandings}</b></span><span>历届榜单 <b>{systemHealth.caches.archiveScoreboardViews}</b></span><span>VP 快照 <b>{systemHealth.persistence.vpSnapshots}</b></span></div>
      </> : <div className="system-health-offline"><b>国内 API 暂时不可达</b><span>点击“刷新”重试；若持续失败，再检查阿里云容器。</span></div>}
    </section> : null}
  </AppShell>;
}
