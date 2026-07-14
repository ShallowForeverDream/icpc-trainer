import { readStoredString, writeStoredString } from "./storage";

const CLIENT_ID_KEY = "icpc-trainer-client-id";

export function getDeviceId() {
  if (typeof window === "undefined") return "";
  let value = readStoredString(CLIENT_ID_KEY);
  if (!value) {
    value = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    writeStoredString(CLIENT_ID_KEY, value);
  }
  return value;
}
