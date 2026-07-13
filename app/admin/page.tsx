"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";
import { authFetch, readAuth, type AuthUser } from "../lib/auth-client";

type Invite = { id: number; code?: string; codePrefix?: string; maxUses: number; usedCount: number; expiresAt: string; createdAt: string; status: "active" | "used" | "expired" };

export default function AdminPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [generated, setGenerated] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const auth = readAuth();
    if (!auth) { location.replace("/login"); return; }
    if (auth.user.role !== "admin") { location.replace("/account"); return; }
    try {
      const [usersResponse, invitesResponse] = await Promise.all([authFetch("/admin/users"), authFetch("/admin/invites")]);
      if (!usersResponse.ok || !invitesResponse.ok) throw new Error("管理员登录已失效");
      setUsers(((await usersResponse.json()) as { users: AuthUser[] }).users);
      setInvites(((await invitesResponse.json()) as { invites: Invite[] }).invites);
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

  return <AppShell active="管理"><section className="admin-hero"><div><span className="eyebrow"><span className="live-dot" /> ADMIN CONTROL</span><h1>邀请码与用户管理</h1><p>仅管理员可以创建注册资格。每个邀请码都可以设置有效期和最大使用次数。</p></div><div className="admin-metrics"><span><b>{users.length}</b>注册用户</span><span><b>{invites.filter((item) => item.status === "active").length}</b>有效邀请码</span></div></section><div className="admin-grid"><form className="panel admin-create" onSubmit={createInvite}><span className="micro-label">NEW INVITATION</span><h2>生成邀请码</h2><label>最大使用次数<input type="number" min="1" max="100" value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} /></label><label>有效天数<input type="number" min="1" max="365" value={expiresInDays} onChange={(event) => setExpiresInDays(Number(event.target.value))} /></label><button className="button button-primary">生成邀请码</button>{generated && <div className="invite-result"><small>仅本次显示</small><code>{generated}</code><button type="button" onClick={copyCode}>复制</button></div>}{message && <p className={message.includes("失败") || message.includes("失效") ? "form-error" : "form-success"}>{message}</p>}</form><section className="panel admin-table"><div className="panel-head"><div><span className="micro-label">INVITATIONS</span><h2>邀请码记录</h2></div></div>{loading ? <div className="loading-panel">正在加载…</div> : invites.length ? <div className="admin-list">{invites.map((invite) => <div key={invite.id}><code>{invite.codePrefix}••••••••</code><span>{invite.usedCount} / {invite.maxUses} 次</span><span>{new Date(invite.expiresAt).toLocaleDateString("zh-CN")}</span><Pill>{invite.status === "active" ? "有效" : invite.status === "used" ? "已用完" : "已过期"}</Pill></div>)}</div> : <div className="loading-panel">还没有邀请码</div>}</section></div><section className="panel users-panel"><div className="panel-head"><div><span className="micro-label">MEMBERS</span><h2>注册用户</h2></div></div><div className="admin-list user-list">{users.map((user) => <div key={user.id}><span className="user-avatar">{user.email.slice(0, 2).toUpperCase()}</span><b>{user.email}</b><Pill>{user.role === "admin" ? "管理员" : "用户"}</Pill><span>{new Date(user.createdAt).toLocaleString("zh-CN")}</span></div>)}</div></section></AppShell>;
}
