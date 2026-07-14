import { browserApiUrl } from "./browser-api";

export async function apiFetch(path: string, init: RequestInit = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const callerSignal = init.signal;
  const abortFromCaller = () => controller.abort(callerSignal?.reason);
  if (callerSignal?.aborted) abortFromCaller();
  else callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  const timeout = window.setTimeout(() => controller.abort(new DOMException("Request timed out", "TimeoutError")), timeoutMs);
  try {
    return await fetch(browserApiUrl(path), { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export async function apiJson<T>(path: string, init: RequestInit = {}, timeoutMs = 15_000) {
  const response = await apiFetch(path, init, timeoutMs);
  const data = await response.json().catch(() => ({})) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || `请求失败（${response.status}）`);
  return data;
}
