import type { ArchiveContest } from "../data/archive-contests";

type RawConfig = {
  contest_name?: string;
  start_time?: number;
  end_time?: number;
  penalty?: number;
  frozen_time?: number;
  problem_id?: Array<string | number>;
  group?: Record<string, string>;
  organizations?: { url?: string };
  options?: { submission_timestamp_unit?: "second" | "millisecond" | "microsecond" | "nanosecond"; calculation_of_penalty?: string };
};
type RawTeam = { id?: string; team_id?: string; name?: unknown; team_name?: unknown; organization?: string; organization_id?: string; group?: string[] };
type RawOrganization = { id?: string; organization_id?: string; name?: unknown };
type RawRun = { id?: string; submission_id?: string; team_id: string; problem_id: string | number; timestamp: number; status: string; is_ignore?: boolean };
type RawData = { config: RawConfig; teams: RawTeam[]; runs: RawRun[]; organizations: RawOrganization[] };

export type ArchiveProblemState = { solved: boolean; wrongAttempts: number; pendingAttempts: number; solvedMinutes: number | null };
export type ArchiveStandingRow = {
  rank: number;
  teamId: string;
  name: string;
  organization: string;
  groups: string[];
  solved: number;
  penalty: number;
  lastSolvedMinutes: number | null;
  problems: Record<string, ArchiveProblemState>;
};

const cache = new Map<string, { expiresAt: number; data: RawData }>();
const ignoredStatuses = new Set(["COMPILATION_ERROR", "PRESENTATION_ERROR", "CONFIGURATION_ERROR", "SYSTEM_ERROR", "CANCELED", "SKIPPED", "UNKNOWN", "UNDEFINED"]);
const pendingStatuses = new Set(["PENDING", "WAITING", "COMPILING", "JUDGING", "FROZEN"]);
const acceptedStatuses = new Set(["OK", "AC", "ACCEPTED", "CORRECT"]);

function list<T>(value: T[] | Record<string, T>): T[] {
  return Array.isArray(value) ? value : Object.values(value || {});
}

function text(value: unknown): string {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  const item = value as { fallback?: string; fallback_lang?: string; texts?: Record<string, string> };
  return item.fallback || (item.fallback_lang && item.texts?.[item.fallback_lang]) || Object.values(item.texts || {})[0] || "";
}

function unixMs(value = 0) {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function runSeconds(value: number, unit = "second") {
  if (unit === "nanosecond") return Math.floor(value / 1_000_000_000);
  if (unit === "microsecond") return Math.floor(value / 1_000_000);
  if (unit === "millisecond") return Math.floor(value / 1000);
  return Math.floor(value);
}

async function fetchJson(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { headers: { "User-Agent": "icpc-trainer-archive/0.1", Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`XCPCIO 数据源 HTTP ${response.status}`);
    return response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function loadRaw(contest: ArchiveContest): Promise<RawData> {
  const cached = cache.get(contest.boardPath);
  if (cached && cached.expiresAt > Date.now()) return cached.data;
  const base = `https://board.xcpcio.com/data/${contest.boardPath}`;
  const config = await fetchJson(`${base}/config.json`) as RawConfig;
  const organizationUrl = config.organizations?.url;
  const [teams, runs, organizations] = await Promise.all([
    fetchJson(`${base}/team.json`),
    fetchJson(`${base}/run.json`),
    organizationUrl ? fetchJson(new URL(organizationUrl, `${base}/`).toString()).catch(() => []) : Promise.resolve([]),
  ]);
  const data = { config, teams: list(teams as RawTeam[] | Record<string, RawTeam>), runs: list(runs as RawRun[] | Record<string, RawRun>), organizations: list(organizations as RawOrganization[] | Record<string, RawOrganization>) };
  cache.set(contest.boardPath, { expiresAt: Date.now() + 60 * 60_000, data });
  return data;
}

export function calculateArchiveStandings(raw: RawData, elapsedSeconds: number, reveal: boolean, group = "all") {
  const { config } = raw;
  const start = unixMs(config.start_time);
  const end = unixMs(config.end_time);
  const durationSeconds = Math.max(1, Math.floor((end - start) / 1000));
  const elapsed = Math.max(0, Math.min(durationSeconds, Math.floor(elapsedSeconds)));
  const freezeSeconds = Math.max(0, Number(config.frozen_time) || 0);
  const freezeAt = Math.max(0, durationSeconds - freezeSeconds);
  const isFrozen = !reveal && elapsed > freezeAt;
  const slots = (config.problem_id?.length ? config.problem_id : Array.from({ length: 13 }, (_, index) => String.fromCharCode(65 + index))).map(String);
  const unit = config.options?.submission_timestamp_unit || "second";
  const penaltySeconds = Number(config.penalty) || 1200;
  const teamMap = new Map<string, ArchiveStandingRow>();
  const organizationMap = new Map(raw.organizations.map((organization) => [String(organization.id ?? organization.organization_id ?? ""), text(organization.name)]));

  for (const team of raw.teams) {
    const groups = Array.isArray(team.group) ? team.group : [];
    if (group !== "all" && !groups.includes(group)) continue;
    const teamId = String(team.id ?? team.team_id ?? "");
    if (!teamId) continue;
    teamMap.set(teamId, {
      rank: 0,
      teamId,
      name: text(team.name ?? team.team_name) || teamId,
      organization: organizationMap.get(String(team.organization ?? team.organization_id ?? "")) || String(team.organization ?? team.organization_id ?? ""),
      groups,
      solved: 0,
      penalty: 0,
      lastSolvedMinutes: null,
      problems: Object.fromEntries(slots.map((slot) => [slot, { solved: false, wrongAttempts: 0, pendingAttempts: 0, solvedMinutes: null }])),
    });
  }

  const runs = [...raw.runs].sort((left, right) => left.timestamp - right.timestamp || String(left.id ?? left.submission_id ?? "").localeCompare(String(right.id ?? right.submission_id ?? "")));
  for (const run of runs) {
    const second = runSeconds(Number(run.timestamp) || 0, unit);
    if (second > elapsed) break;
    const row = teamMap.get(String(run.team_id));
    const slot = slots[Number(run.problem_id)] ?? String(run.problem_id);
    const state = row?.problems[slot];
    if (!row || !state || state.solved || run.is_ignore) continue;
    const status = String(run.status || "UNKNOWN").toUpperCase().replaceAll(" ", "_");
    if (isFrozen && second > freezeAt) {
      state.pendingAttempts += 1;
      continue;
    }
    if (ignoredStatuses.has(status)) continue;
    if (pendingStatuses.has(status)) {
      state.pendingAttempts += 1;
      continue;
    }
    if (acceptedStatuses.has(status)) {
      state.solved = true;
      state.solvedMinutes = Math.floor(second / 60);
      row.solved += 1;
      row.penalty += state.solvedMinutes + state.wrongAttempts * Math.floor(penaltySeconds / 60);
      row.lastSolvedMinutes = state.solvedMinutes;
    } else {
      state.wrongAttempts += 1;
    }
  }

  const rows = [...teamMap.values()].sort((left, right) => right.solved - left.solved || left.penalty - right.penalty || (left.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) - (right.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, "zh-CN"));
  let previous: ArchiveStandingRow | undefined;
  rows.forEach((row, index) => {
    row.rank = previous && previous.solved === row.solved && previous.penalty === row.penalty && previous.lastSolvedMinutes === row.lastSolvedMinutes ? previous.rank : index + 1;
    previous = row;
  });
  return { rows, slots, elapsedSeconds: elapsed, durationSeconds, freezeAtSeconds: freezeAt, frozen: isFrozen };
}

export async function archiveScoreboard(contest: ArchiveContest, elapsedSeconds: number, reveal: boolean, group = "all") {
  const raw = await loadRaw(contest);
  const calculated = calculateArchiveStandings(raw, elapsedSeconds, reveal, group);
  const startTime = unixMs(raw.config.start_time);
  const endTime = unixMs(raw.config.end_time);
  return {
    contest: {
      ...contest,
      officialName: raw.config.contest_name || contest.name,
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      boardUrl: `https://board.xcpcio.com/${contest.boardPath}`,
      groups: raw.config.group || {},
      teamCount: raw.teams.length,
      runCount: raw.runs.length,
    },
    ...calculated,
    generatedAt: new Date().toISOString(),
  };
}
