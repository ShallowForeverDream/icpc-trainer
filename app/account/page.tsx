"use client";
/* eslint-disable react-hooks/set-state-in-effect */

import { FormEvent, useEffect, useState } from "react";
import { AppShell, Icon, Pill } from "../components/AppShell";
import { authFetch, clearAuth, readAuth, updateAuthUser, type AuthUser } from "../lib/auth-client";
import { readTrainerPreferences, saveTrainerPreferences, validCodeforcesHandle } from "../lib/preferences";

export default function AccountPage() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState("");
  const [codeforcesHandle, setCodeforcesHandle] = useState("ShallowDream2");
  const [dailyGoal, setDailyGoal] = useState(4);
  const [preferenceMessage, setPreferenceMessage] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const preferences = readTrainerPreferences();
    setCodeforcesHandle(preferences.codeforcesHandle);
    setDailyGoal(preferences.dailyGoal);
    const auth = readAuth();
    if (!auth) { location.replace("/login"); return; }
    setUser(auth.user);
    authFetch("/auth/me").then(async (response) => {
      if (!response.ok) { location.replace("/login"); return; }
      const data = await response.json() as { user: AuthUser }; setUser(data.user); updateAuthUser(data.user);
    });
  }, []);

  async function changePassword(event: FormEvent) {
    event.preventDefault(); setMessage("");
    if (newPassword !== confirm) { setMessage("两次输入的新密码不一致"); return; }
    setLoading(true);
    try {
      const response = await authFetch("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword, newPassword }) });
      const data = await response.json() as { user?: AuthUser; error?: string };
      if (!response.ok || !data.user) throw new Error(data.error || "修改失败");
      setUser(data.user); updateAuthUser(data.user); setCurrentPassword(""); setNewPassword(""); setConfirm(""); setMessage("密码已更新");
    } catch (error) { setMessage(error instanceof Error ? error.message : "修改失败"); } finally { setLoading(false); }
  }

  async function logout() { await authFetch("/auth/logout", { method: "POST" }).catch(() => undefined); clearAuth(); location.href = "/login"; }

  function savePreferences(event: FormEvent) {
    event.preventDefault();
    setPreferenceMessage("");
    if (!validCodeforcesHandle(codeforcesHandle)) { setPreferenceMessage("请输入有效的 Codeforces Handle"); return; }
    try {
      const saved = saveTrainerPreferences({ codeforcesHandle, dailyGoal });
      setCodeforcesHandle(saved.codeforcesHandle);
      setDailyGoal(saved.dailyGoal);
      setPreferenceMessage("训练偏好已保存");
    } catch (error) {
      setPreferenceMessage(error instanceof Error ? error.message : "保存失败");
    }
  }

  if (!user) return <AppShell active="账号"><div className="loading-panel">正在读取账号…</div></AppShell>;
  return <AppShell active="账号">
    <section className="account-head"><div><span className="eyebrow"><span className="live-dot" /> ACCOUNT CENTER</span><h1>{user.email}</h1><p>注册于 {new Date(user.createdAt).toLocaleString("zh-CN")}</p></div><div><Pill>{user.role === "admin" ? "ADMIN" : "MEMBER"}</Pill><button className="button button-ghost" onClick={logout}>退出登录</button></div></section>
    {user.mustChangePassword ? <div className="security-banner"><Icon name="lock" /><div><b>请立即修改初始密码</b><span>管理员初始密码只用于首次登录，修改后才能使用管理与共享题面功能。</span></div></div> : null}
    <div className="account-grid">
      <form className="panel account-form" onSubmit={savePreferences}><span className="micro-label">TRAINING PROFILE</span><h2>训练偏好</h2><label>Codeforces Handle<input value={codeforcesHandle} onChange={(event) => setCodeforcesHandle(event.target.value)} autoComplete="off" maxLength={24} required /></label><label>每日目标（题）<input type="number" min="1" max="20" value={dailyGoal} onChange={(event) => setDailyGoal(Number(event.target.value))} required /></label><p className="account-form-hint">训练台、题库推荐、提交记录和 VP 会统一使用这里的 Handle。</p>{preferenceMessage ? <p className={preferenceMessage === "训练偏好已保存" ? "form-success" : "form-error"}>{preferenceMessage}</p> : null}<button className="button button-primary">保存训练偏好</button></form>
      <form className="panel account-form" onSubmit={changePassword}><span className="micro-label">SECURITY</span><h2>修改密码</h2><label>当前密码<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required /></label><label>新密码<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} placeholder="至少 10 位，包含大小写字母和数字" required /></label><label>确认新密码<input type="password" autoComplete="new-password" value={confirm} onChange={(event) => setConfirm(event.target.value)} required /></label>{message ? <p className={message === "密码已更新" ? "form-success" : "form-error"}>{message}</p> : null}<button className="button button-primary" disabled={loading}>{loading ? "正在保存…" : "保存新密码"}</button></form>
      <aside className="panel account-links account-links-wide"><span className="micro-label">QUICK ACCESS</span><h2>账号入口</h2>{user.role === "admin" ? <a href="/admin"><Icon name="team" /><div><b>管理员后台</b><small>生成邀请码、查看注册用户与反馈</small></div><Icon name="chevron" /></a> : null}<a href="/submissions"><Icon name="history" /><div><b>Codeforces 提交</b><small>同步已保存 Handle 的公开记录</small></div><Icon name="chevron" /></a><a href="/vp"><Icon name="trophy" /><div><b>创建 VP</b><small>从实时题库生成模拟赛</small></div><Icon name="chevron" /></a></aside>
    </div>
  </AppShell>;
}
