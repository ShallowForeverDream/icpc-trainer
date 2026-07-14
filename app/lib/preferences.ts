import { readStoredJson, writeStoredJson } from "./storage";
import { loadPersistentJson, savePersistentJson } from "./persistent-state";

const PREFERENCES_KEY = "icpc-trainer-preferences-v1";
const LEGACY_DASHBOARD_KEY = "icpc-trainer-dashboard";
const HANDLE_PATTERN = /^[A-Za-z0-9_.-]{3,24}$/;

export type TrainerPreferences = {
  version: 1;
  codeforcesHandle: string;
  dailyGoal: number;
};

export const defaultTrainerPreferences: TrainerPreferences = {
  version: 1,
  codeforcesHandle: "ShallowDream2",
  dailyGoal: 4,
};

function isPreferences(value: unknown): value is TrainerPreferences {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<TrainerPreferences>;
  return item.version === 1 && typeof item.codeforcesHandle === "string" && HANDLE_PATTERN.test(item.codeforcesHandle)
    && Number.isInteger(item.dailyGoal) && Number(item.dailyGoal) >= 1 && Number(item.dailyGoal) <= 20;
}

export function validCodeforcesHandle(value: string) {
  return HANDLE_PATTERN.test(value.trim());
}

export function readTrainerPreferences() {
  const stored = readStoredJson(PREFERENCES_KEY, null as TrainerPreferences | null, isPreferences);
  if (stored) return stored;
  const legacy = readStoredJson<{ goal?: number }>(LEGACY_DASHBOARD_KEY, {});
  const dailyGoal = Number.isInteger(legacy.goal) ? Math.min(20, Math.max(1, Number(legacy.goal))) : defaultTrainerPreferences.dailyGoal;
  return { ...defaultTrainerPreferences, dailyGoal };
}

export function syncTrainerPreferences() {
  return loadPersistentJson("preferences", PREFERENCES_KEY, readTrainerPreferences(), isPreferences);
}

export function saveTrainerPreferences(input: Pick<TrainerPreferences, "codeforcesHandle" | "dailyGoal">) {
  const preferences: TrainerPreferences = {
    version: 1,
    codeforcesHandle: input.codeforcesHandle.trim(),
    dailyGoal: Math.min(20, Math.max(1, Math.round(input.dailyGoal))),
  };
  if (!validCodeforcesHandle(preferences.codeforcesHandle)) throw new Error("请输入有效的 Codeforces Handle");
  if (!writeStoredJson(PREFERENCES_KEY, preferences)) throw new Error("浏览器无法保存训练偏好");
  void savePersistentJson("preferences", PREFERENCES_KEY, preferences);
  window.dispatchEvent(new CustomEvent("icpc-preferences-change", { detail: preferences }));
  return preferences;
}
