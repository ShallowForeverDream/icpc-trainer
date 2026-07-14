"use client";

import { FormEvent, useState } from "react";
import { AppShell, Icon } from "../components/AppShell";
import { saveAuth, type AuthSession } from "../lib/auth-client";
import { apiJson } from "../lib/api-client";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [inviteCode, setInviteCode] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (password !== confirm) { setStatus("error"); setMessage("两次输入的密码不一致"); return; }
    setStatus("loading");
    try {
      const data = await apiJson<AuthSession>("/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, inviteCode }) });
      saveAuth(data); location.href = "/account";
    } catch (error) { setMessage(error instanceof Error ? error.message : "注册失败"); setStatus("error"); }
  }

  return <AppShell active="注册"><section className="auth-layout"><div className="auth-intro"><span className="eyebrow"><span className="live-dot" /> ADMIN INVITATION REQUIRED</span><h1>使用邀请码注册</h1><p>本站不开放自由注册。请向管理员获取未过期的邀请码，然后创建你的训练账号。</p><div className="auth-points"><span><Icon name="check" /> 无需邮件验证</span><span><Icon name="lock" /> 密码使用 scrypt 加密</span><span><Icon name="team" /> 每个邀请码受次数限制</span></div></div><form className="auth-card" onSubmit={submit}><span className="micro-label">CREATE ACCOUNT</span><h2>创建训练账号</h2><label>管理员邀请码<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="ICPC-XXXX-XXXX-XXXX" required /></label><label>邮箱<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>密码<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 10 位，包含大小写字母和数字" required /></label><label>确认密码<input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>{message && <p className="form-error">{message}</p>}<button className="button button-primary" disabled={status === "loading"}>{status === "loading" ? "正在创建…" : "注册并登录"}</button><small>已有账号？<a href="/login">返回登录</a></small></form></section></AppShell>;
}
