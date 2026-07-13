"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell, Icon } from "../components/AppShell";
import { readAuth, saveAuth, type AuthSession } from "../lib/auth-client";
import { browserApiUrl } from "../lib/browser-api";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => { const auth = readAuth(); if (auth) location.replace(auth.user.role === "admin" ? "/admin" : "/account"); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus("loading"); setMessage("");
    try {
      const response = await fetch(browserApiUrl("/auth/login"), { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      const data = await response.json() as AuthSession & { error?: string };
      if (!response.ok) throw new Error(data.error || "登录失败");
      saveAuth(data);
      location.href = data.user.mustChangePassword ? "/account" : data.user.role === "admin" ? "/admin" : "/";
    } catch (error) { setMessage(error instanceof Error ? error.message : "登录失败"); setStatus("error"); }
  }

  return <AppShell active="登录">
    <section className="auth-layout"><div className="auth-intro"><span className="eyebrow"><span className="live-dot" /> INVITE-ONLY ACCESS</span><h1>登录训练账号</h1><p>账号由邀请码创建。登录后可进入个人中心；管理员可以生成邀请码并查看注册用户。</p><div className="auth-points"><span><Icon name="lock" /> HTTPS 加密连接</span><span><Icon name="check" /> 30 天登录会话</span><span><Icon name="team" /> 管理员控制注册</span></div></div>
      <form className="auth-card" onSubmit={submit}><span className="micro-label">ACCOUNT LOGIN</span><h2>欢迎回来</h2><label>邮箱<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>密码<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{message && <p className="form-error">{message}</p>}<button className="button button-primary" disabled={status === "loading"}>{status === "loading" ? "正在登录…" : "登录"}</button><small>还没有账号？<a href="/register">使用邀请码注册</a></small></form>
    </section>
  </AppShell>;
}
