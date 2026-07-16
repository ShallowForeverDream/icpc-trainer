import { apiFetch } from "./api-client";
import { readStoredJson, readStoredString, removeStoredValue, writeStoredJson, writeStoredString } from "./storage";

export type AuthUser = { id: number; email: string; role: "user" | "admin"; mustChangePassword: boolean; createdAt: string };
export type AuthSession = { token: string; expiresAt: string; user: AuthUser };

const TOKEN_KEY = "icpc-trainer-auth-token";
const USER_KEY = "icpc-trainer-auth-user";

export function readAuth(): { token: string; user: AuthUser } | null {
  if (typeof window === "undefined") return null;
  const token = readStoredString(TOKEN_KEY);
  const user = readStoredJson<AuthUser | null>(USER_KEY, null, (value): value is AuthUser => {
    if (!value || typeof value !== "object") return false;
    const item = value as Partial<AuthUser>;
    return Number.isInteger(item.id) && typeof item.email === "string" && (item.role === "user" || item.role === "admin")
      && typeof item.mustChangePassword === "boolean" && typeof item.createdAt === "string";
  });
  if (!token && !user) return null;
  if (!token || !user) { clearAuth(); return null; }
  return { token, user };
}

export function saveAuth(session: AuthSession) {
  if (!writeStoredString(TOKEN_KEY, session.token) || !writeStoredJson(USER_KEY, session.user)) throw new Error("浏览器无法保存登录状态");
  window.dispatchEvent(new Event("icpc-auth-change"));
}

export function updateAuthUser(user: AuthUser) {
  writeStoredJson(USER_KEY, user);
  window.dispatchEvent(new Event("icpc-auth-change"));
}

export function clearAuth() {
  if (typeof window === "undefined") return;
  removeStoredValue(TOKEN_KEY);
  removeStoredValue(USER_KEY);
  window.dispatchEvent(new Event("icpc-auth-change"));
}

export async function authFetch(path: string, init: RequestInit = {}, timeoutMs = 15_000) {
  const auth = readAuth();
  const headers = new Headers(init.headers);
  if (auth?.token) headers.set("Authorization", `Bearer ${auth.token}`);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await apiFetch(path, { ...init, headers, cache: "no-store" }, timeoutMs);
  if (response.status === 401) clearAuth();
  return response;
}

export async function authJson<T>(path: string, init: RequestInit = {}, timeoutMs = 15_000) {
  const response = await authFetch(path, init, timeoutMs);
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}
