"use client";

import { FormEvent, useState } from "react";
import { AppShell } from "../components/AppShell";
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

  return <AppShell active="注册"><section className="auth-layout auth-single"><form className="auth-card" onSubmit={submit}><h1>注册</h1><p>需要管理员邀请码</p><label>邀请码<input value={inviteCode} onChange={(event) => setInviteCode(event.target.value.toUpperCase())} placeholder="ICPC-XXXX-XXXX-XXXX" required /></label><label>邮箱<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>密码<input type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 10 位，含大小写字母和数字" required /></label><label>确认密码<input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>{message && <p className="form-error">{message}</p>}<button className="button button-primary" disabled={status === "loading"}>{status === "loading" ? "正在注册…" : "注册"}</button><small>已有账号？<a href="/login">登录</a></small></form></section></AppShell>;
}
