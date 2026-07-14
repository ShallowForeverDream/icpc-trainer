import { authFetch } from "./auth-client";
import { getDeviceId } from "./device-id";
import { readStoredJson, removeStoredValue, writeStoredJson } from "./storage";

type PersistentPayload = { exists?: boolean; value?: unknown; error?: string };

async function remoteState(stateKey: string) {
  const query = new URLSearchParams({ key: stateKey, clientId: getDeviceId() });
  const response = await authFetch(`/state?${query}`, { cache: "no-store" });
  const payload = await response.json() as PersistentPayload;
  if (!response.ok) throw new Error(payload.error || "个人数据读取失败");
  return payload;
}

export async function loadPersistentJson<T>(stateKey: string, localKey: string, fallback: T, validate?: (value: unknown) => value is T) {
  const local = readStoredJson(localKey, fallback, validate);
  try {
    const remote = await remoteState(stateKey);
    if (!remote.exists) {
      await savePersistentJson(stateKey, localKey, local);
      return local;
    }
    if (validate && !validate(remote.value)) throw new Error("服务器个人数据格式无效");
    const value = remote.value as T;
    writeStoredJson(localKey, value);
    return value;
  } catch {
    return local;
  }
}

export async function savePersistentJson(stateKey: string, localKey: string, value: unknown) {
  const savedLocally = writeStoredJson(localKey, value);
  try {
    const response = await authFetch("/state", { method: "POST", body: JSON.stringify({ clientId: getDeviceId(), key: stateKey, value }) });
    if (!response.ok) throw new Error("个人数据保存失败");
    return true;
  } catch {
    return savedLocally;
  }
}

export async function clearPersistentJson(stateKey: string, localKey: string) {
  removeStoredValue(localKey);
  try {
    const response = await authFetch("/state", { method: "POST", body: JSON.stringify({ clientId: getDeviceId(), key: stateKey, value: null }) });
    return response.ok;
  } catch { return false; }
}
