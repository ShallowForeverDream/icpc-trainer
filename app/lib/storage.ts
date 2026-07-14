export function readStoredJson<T>(key: string, fallback: T, validate?: (value: unknown) => value is T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const value: unknown = JSON.parse(raw);
    if (validate && !validate(value)) throw new Error("invalid stored value");
    return value as T;
  } catch {
    try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
    return fallback;
  }
}

export function writeStoredJson(key: string, value: unknown) {
  if (typeof window === "undefined") return false;
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function removeStoredValue(key: string) {
  if (typeof window === "undefined") return;
  try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
}

export function readStoredString(key: string, fallback = "") {
  if (typeof window === "undefined") return fallback;
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}

export function writeStoredString(key: string, value: string) {
  if (typeof window === "undefined") return false;
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}
