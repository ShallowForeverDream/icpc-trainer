import { authFetch } from "./auth-client";
import { browserApiUrl } from "./browser-api";

export type TrainingOutcome = "independent" | "hinted" | "editorial" | "unsolved";
export type TrainingDifficulty = "easy" | "right" | "hard";

export type TrainingEvent = {
  id: number;
  code: string;
  outcome: TrainingOutcome;
  durationMinutes: number;
  hintLevel: number;
  difficulty: TrainingDifficulty;
  reflection: string;
  createdAt: string;
};

export type TrainingSummary = {
  stats: { total: number; independent: number; hinted: number; editorial: number; unsolved: number };
  dueReviews: TrainingEvent[];
  recent: TrainingEvent[];
};

const CLIENT_ID_KEY = "icpc-trainer-client-id";

export function getTrainingClientId() {
  if (typeof window === "undefined") return "";
  let value = localStorage.getItem(CLIENT_ID_KEY);
  if (!value) {
    value = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `device_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
    localStorage.setItem(CLIENT_ID_KEY, value);
  }
  return value;
}

export async function saveTrainingEvent(input: {
  handle?: string;
  code: string;
  outcome: TrainingOutcome;
  durationMinutes: number;
  hintLevel: number;
  difficulty: TrainingDifficulty;
  reflection: string;
}) {
  const response = await authFetch("/training/events", {
    method: "POST",
    body: JSON.stringify({ clientId: getTrainingClientId(), handle: input.handle ?? "ShallowDream2", ...input }),
  });
  const data = await response.json() as { event?: TrainingEvent; error?: string };
  if (!response.ok || !data.event) throw new Error(data.error || "训练记录保存失败");
  return data.event;
}

export async function loadTrainingSummary(handle = "ShallowDream2") {
  const query = new URLSearchParams({ clientId: getTrainingClientId(), handle });
  const response = await fetch(browserApiUrl(`/training/summary?${query}`), { cache: "no-store" });
  const data = await response.json() as TrainingSummary & { error?: string };
  if (!response.ok) throw new Error(data.error || "训练复盘加载失败");
  return data;
}

