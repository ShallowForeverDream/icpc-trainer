import { browserApiUrl } from "./browser-api";

export type AuthUser = { id: number; email: string; role: "user" | "admin"; mustChangePassword: boolean; createdAt: string };
export type AuthSession = { token: string; expiresAt: string; user: AuthUser };

const TOKEN_KEY = "icpc-trainer-auth-token";
const USER_KEY = "icpc-trainer-auth-user";

export function readAuth(): { token: string; user: AuthUser } | null {
  if (typeof window === "undefined") return null;
  const token = localStorage.getItem(TOKEN_KEY);
  const rawUser = localStorage.getItem(USER_KEY);
  if (!token || !rawUser) return null;
  try { return { token, user: JSON.parse(rawUser) as AuthUser }; } catch { clearAuth(); return null; }
}

export function saveAuth(session: AuthSession) {
  localStorage.setItem(TOKEN_KEY, session.token);
  localStorage.setItem(USER_KEY, JSON.stringify(session.user));
  window.dispatchEvent(new Event("icpc-auth-change"));
}

export function updateAuthUser(user: AuthUser) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
  window.dispatchEvent(new Event("icpc-auth-change"));
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event("icpc-auth-change"));
}

export async function authFetch(path: string, init: RequestInit = {}) {
  const auth = readAuth();
  const headers = new Headers(init.headers);
  if (auth?.token) headers.set("Authorization", `Bearer ${auth.token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(browserApiUrl(path), { ...init, headers, cache: "no-store" });
  if (response.status === 401) clearAuth();
  return response;
}
