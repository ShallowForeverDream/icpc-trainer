import { readStoredJson, writeStoredJson } from "./storage";
import { loadPersistentJson, savePersistentJson } from "./persistent-state";

const PREFERENCES_KEY = "icpc-trainer-preferences-v1";
const LEGACY_DASHBOARD_KEY = "icpc-trainer-dashboard";
const HANDLE_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/;

export type TrainerPreferences = {
  version: 2;
  codeforcesHandle: string;
  teamHandles: string[];
  dailyGoal: number;
};

type LegacyTrainerPreferences = Omit<TrainerPreferences, "version" | "teamHandles"> & { version: 1 };
type StoredTrainerPreferences = TrainerPreferences | LegacyTrainerPreferences;

export const defaultTrainerPreferences: TrainerPreferences = {
  version: 2,
  codeforcesHandle: "ShallowDream2",
  teamHandles: ["ShallowDream2"],
  dailyGoal: 4,
};

function isStoredPreferences(value: unknown): value is StoredTrainerPreferences {
  if (!value || typeof value !== "object") return false;
  const item = value as Omit<Partial<TrainerPreferences>, "version"> & { version?: 1 | 2 };
  const validBase = (item.version === 1 || item.version === 2) && typeof item.codeforcesHandle === "string" && HANDLE_PATTERN.test(item.codeforcesHandle)
    && Number.isInteger(item.dailyGoal) && Number(item.dailyGoal) >= 1 && Number(item.dailyGoal) <= 20;
  if (!validBase) return false;
  return item.version === 1 || (Array.isArray(item.teamHandles) && item.teamHandles.length >= 1 && item.teamHandles.length <= 3
    && item.teamHandles.every((handle) => typeof handle === "string" && HANDLE_PATTERN.test(handle)));
}

export function validCodeforcesHandle(value: string) {
  return HANDLE_PATTERN.test(value.trim());
}

export function normalizeTeamHandles(value: string[] | string, primaryHandle: string) {
  const requested = Array.isArray(value) ? value : value.split(/[\s,;]+/);
  const primary = primaryHandle.trim();
  const seen = new Set<string>();
  const result: string[] = [];
  for (const candidate of [primary, ...requested]) {
    const handle = candidate.trim();
    const normalized = handle.toLowerCase();
    if (!validCodeforcesHandle(handle) || seen.has(normalized)) continue;
    seen.add(normalized);
    result.push(handle);
    if (result.length === 3) break;
  }
  return result;
}

function normalizePreferences(value: StoredTrainerPreferences): TrainerPreferences {
  return {
    version: 2,
    codeforcesHandle: value.codeforcesHandle.trim(),
    teamHandles: normalizeTeamHandles(value.version === 2 ? value.teamHandles : [value.codeforcesHandle], value.codeforcesHandle),
    dailyGoal: Math.min(20, Math.max(1, Math.round(value.dailyGoal))),
  };
}

export function readTrainerPreferences() {
  const stored = readStoredJson(PREFERENCES_KEY, null as StoredTrainerPreferences | null, isStoredPreferences);
  if (stored) return normalizePreferences(stored);
  const legacy = readStoredJson<{ goal?: number }>(LEGACY_DASHBOARD_KEY, {});
  const dailyGoal = Number.isInteger(legacy.goal) ? Math.min(20, Math.max(1, Number(legacy.goal))) : defaultTrainerPreferences.dailyGoal;
  return { ...defaultTrainerPreferences, dailyGoal };
}

export function syncTrainerPreferences() {
  return loadPersistentJson<StoredTrainerPreferences>("preferences", PREFERENCES_KEY, readTrainerPreferences(), isStoredPreferences).then((stored) => {
    const preferences = normalizePreferences(stored);
    if (stored.version !== 2) void savePersistentJson("preferences", PREFERENCES_KEY, preferences);
    writeStoredJson(PREFERENCES_KEY, preferences);
    return preferences;
  });
}

export function saveTrainerPreferences(input: Pick<TrainerPreferences, "codeforcesHandle" | "dailyGoal"> & { teamHandles?: string[] }) {
  const previous = readTrainerPreferences();
  const requestedTeam = input.teamHandles || [input.codeforcesHandle, ...previous.teamHandles.filter((handle) => handle.toLowerCase() !== previous.codeforcesHandle.toLowerCase())];
  const preferences: TrainerPreferences = {
    version: 2,
    codeforcesHandle: input.codeforcesHandle.trim(),
    teamHandles: normalizeTeamHandles(requestedTeam, input.codeforcesHandle),
    dailyGoal: Math.min(20, Math.max(1, Math.round(input.dailyGoal))),
  };
  if (!validCodeforcesHandle(preferences.codeforcesHandle)) throw new Error("请输入有效的 Codeforces Handle");
  if (!preferences.teamHandles.length || preferences.teamHandles.length > 3 || preferences.teamHandles.some((handle) => !validCodeforcesHandle(handle))) throw new Error("请输入 1–3 个有效的队员 Handle");
  if (!writeStoredJson(PREFERENCES_KEY, preferences)) throw new Error("浏览器无法保存训练偏好");
  void savePersistentJson("preferences", PREFERENCES_KEY, preferences);
  window.dispatchEvent(new CustomEvent("icpc-preferences-change", { detail: preferences }));
  return preferences;
}
