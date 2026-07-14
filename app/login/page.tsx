"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "../components/AppShell";
import { readAuth, saveAuth, type AuthSession } from "../lib/auth-client";
import { apiJson } from "../lib/api-client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => { const auth = readAuth(); if (auth) location.replace(auth.user.role === "admin" ? "/admin" : "/account"); }, []);

  async function submit(event: FormEvent) {
    event.preventDefault(); setStatus("loading"); setMessage("");
    try {
      const data = await apiJson<AuthSession>("/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
      saveAuth(data);
      location.href = data.user.mustChangePassword ? "/account" : data.user.role === "admin" ? "/admin" : "/";
    } catch (error) { setMessage(error instanceof Error ? error.message : "登录失败"); setStatus("error"); }
  }

  return <AppShell active="登录"><section className="auth-layout auth-single"><form className="auth-card" onSubmit={submit}><h1>登录</h1><p>继续你的训练</p><label>邮箱<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label>密码<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{message && <p className="form-error">{message}</p>}<button className="button button-primary" disabled={status === "loading"}>{status === "loading" ? "正在登录…" : "登录"}</button><small>没有账号？<a href="/register">使用邀请码注册</a></small></form></section></AppShell>;
}
