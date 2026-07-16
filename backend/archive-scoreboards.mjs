import { createHash } from "node:crypto";
import { HttpError, boundedInteger } from "./http-utils.mjs";
import { readRuntimeCache, writeRuntimeCache } from "./persistence.mjs";

const XCPCIO_BASE_URL = String(process.env.XCPCIO_BASE_URL || "https://board.xcpcio.com/data").replace(/\/$/, "");
const SOURCE_NAMESPACE = "archive-scoreboard-source";
const SNAPSHOT_NAMESPACE = "archive-scoreboard-view";
const sourceJobs = new Map();
const ignoredStatuses = new Set(["COMPILATION_ERROR", "PRESENTATION_ERROR", "CONFIGURATION_ERROR", "SYSTEM_ERROR", "CANCELED", "SKIPPED", "UNKNOWN", "UNDEFINED"]);
const pendingStatuses = new Set(["PENDING", "WAITING", "COMPILING", "JUDGING", "FROZEN"]);
const acceptedStatuses = new Set(["OK", "AC", "ACCEPTED", "CORRECT"]);

function list(value) {
  return Array.isArray(value) ? value : Object.values(value || {});
}

function text(value) {
  if (typeof value === "string") return value;
  if (!value || typeof value !== "object") return "";
  return value.fallback || (value.fallback_lang && value.texts?.[value.fallback_lang]) || Object.values(value.texts || {})[0] || "";
}

function unixMs(value = 0) {
  return value < 10_000_000_000 ? value * 1000 : value;
}

function runSeconds(value, unit = "second") {
  if (unit === "nanosecond") return Math.floor(value / 1_000_000_000);
  if (unit === "microsecond") return Math.floor(value / 1_000_000);
  if (unit === "millisecond") return Math.floor(value / 1000);
  return Math.floor(value);
}

function safeBoardPath(value) {
  const path = String(value || "").trim();
  if (!/^[a-z0-9-]+(?:\/[a-z0-9-]+){1,5}$/.test(path) || path.length > 120) throw new HttpError(400, "历届赛事榜单路径无效");
  return path;
}

function safeContestId(value) {
  const id = String(value || "").trim();
  if (!/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/.test(id)) throw new HttpError(400, "历届赛事标识无效");
  return id;
}

function safeLabel(value, fallback, maxLength = 180) {
  const label = String(value || "").replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, maxLength);
  return label || fallback;
}

async function fetchJson(url, maxBytes = 40 * 1024 * 1024) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { headers: { "User-Agent": "icpc-trainer-archive/0.2", Accept: "application/json" }, signal: controller.signal });
    if (!response.ok) throw new Error(`XCPCIO 数据源 HTTP ${response.status}`);
    const declared = Number(response.headers.get("content-length") || 0);
    if (declared > maxBytes) throw new Error("XCPCIO 榜单数据过大");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > maxBytes) throw new Error("XCPCIO 榜单数据过大");
    return JSON.parse(buffer.toString("utf8"));
  } finally {
    clearTimeout(timer);
  }
}

function safeOrganizationUrl(value, base) {
  if (!value) return null;
  try {
    const root = new URL(`${XCPCIO_BASE_URL}/`);
    const url = new URL(value, `${base}/`);
    if (url.origin !== root.origin || !url.pathname.startsWith(root.pathname)) return null;
    return url.toString();
  } catch { return null; }
}

async function fetchSource(boardPath) {
  const base = `${XCPCIO_BASE_URL}/${boardPath}`;
  const config = await fetchJson(`${base}/config.json`, 2 * 1024 * 1024);
  const organizationUrl = safeOrganizationUrl(config.organizations?.url, base);
  const [teams, runs, organizations] = await Promise.all([
    fetchJson(`${base}/team.json`),
    fetchJson(`${base}/run.json`),
    organizationUrl ? fetchJson(organizationUrl).catch(() => []) : Promise.resolve([]),
  ]);
  return {
    config,
    teams: list(teams),
    runs: list(runs),
    organizations: list(organizations),
  };
}

async function loadSource(boardPath) {
  const timestamp = Date.now();
  const cached = readRuntimeCache(SOURCE_NAMESPACE, boardPath);
  if (cached && cached.expiresAt > timestamp) return { ...cached, cacheHit: true };
  if (sourceJobs.has(boardPath)) return sourceJobs.get(boardPath);
  if (sourceJobs.size >= 8) throw new HttpError(503, "真实榜单同步队列繁忙，请稍后重试", { expose: true });
  const job = (async () => {
    try {
      const value = await fetchSource(boardPath);
      const fetchedAt = Date.now();
      writeRuntimeCache(SOURCE_NAMESPACE, boardPath, value, {
        itemCount: value.runs.length,
        fetchedAt,
        expiresAt: fetchedAt + 7 * 24 * 60 * 60_000,
        staleUntil: fetchedAt + 90 * 24 * 60 * 60_000,
        maxEntries: 128,
      });
      return { value, fetchedAt, expiresAt: fetchedAt + 7 * 24 * 60 * 60_000, staleUntil: fetchedAt + 90 * 24 * 60 * 60_000, cacheHit: false };
    } catch (error) {
      if (cached && cached.staleUntil > timestamp) return { ...cached, cacheHit: true, stale: true };
      throw error;
    }
  })().finally(() => sourceJobs.delete(boardPath));
  sourceJobs.set(boardPath, job);
  return job;
}

function codeforcesTeamId(party, index) {
  return codeforcesPartyKeys(party)[0] || `cf-party-${index + 1}`;
}

function codeforcesPartyKeys(party) {
  const keys = [];
  if (Number.isInteger(party?.teamId)) keys.push(`cf-team-${party.teamId}`);
  const teamName = String(party?.teamName || "").trim().replace(/\s+/g, " ");
  if (teamName) keys.push(`cf-name-${createHash("sha256").update(teamName.toLocaleLowerCase("en-US")).digest("hex").slice(0, 20)}`);
  const handles = Array.isArray(party?.members)
    ? party.members.map((member) => String(member?.handle || "").trim().toLocaleLowerCase("en-US")).filter(Boolean).sort()
    : [];
  if (handles.length) keys.push(`cf-members-${createHash("sha256").update(handles.join("\n")).digest("hex").slice(0, 20)}`);
  return [...new Set(keys)];
}

function codeforcesTeamName(party, index) {
  const teamName = String(party?.teamName || "").trim();
  if (teamName) return teamName;
  const handles = Array.isArray(party?.members) ? party.members.map((member) => String(member?.handle || "").trim()).filter(Boolean) : [];
  return handles.join(", ") || `Team ${index + 1}`;
}

export function normalizeCodeforcesArchiveStandings(value, contestId, submissions = null, contestKind = "gym") {
  if (!value?.contest || !Array.isArray(value.problems) || !Array.isArray(value.rows)) throw new Error("Codeforces 赛事榜单数据无效");
  const durationSeconds = Math.max(60, Number(value.contest.durationSeconds) || 5 * 60 * 60);
  const startTimeSeconds = Number(value.contest.startTimeSeconds) || 0;
  const slots = value.problems.map((problem, index) => safeLabel(problem?.index, String.fromCharCode(65 + index), 8));
  const teams = [];
  const runs = [];
  const officialPartyIds = new Map();
  let runId = 0;
  let expectedJudgedSubmissions = 0;

  value.rows.forEach((row, rowIndex) => {
    const party = row?.party || {};
    const participantType = String(party.participantType || "").toUpperCase();
    if (!party.ghost && participantType !== "CONTESTANT") return;
    const teamId = codeforcesTeamId(party, rowIndex);
    const members = Array.isArray(party.members) ? party.members.map((member) => String(member?.handle || "").trim()).filter(Boolean) : [];
    codeforcesPartyKeys(party).forEach((key) => officialPartyIds.set(key, teamId));
    officialPartyIds.set(teamId, teamId);
    teams.push({ id: teamId, name: codeforcesTeamName(party, rowIndex), organization_id: members.join(", "), group: ["official"] });
    slots.forEach((_, problemIndex) => {
      const result = row.problemResults?.[problemIndex] || {};
      const rejected = Math.max(0, Math.min(1000, Number(result.rejectedAttemptCount) || 0));
      const best = Number(result.bestSubmissionTimeSeconds);
      const solved = Number(result.points) > 0 || Number.isFinite(best) && best >= 0;
      expectedJudgedSubmissions += rejected + (solved ? 1 : 0);
    });
  });

  if (Array.isArray(submissions)) {
    const problemIndexes = new Map(slots.map((slot, index) => [slot, index]));
    submissions.forEach((submission, submissionIndex) => {
      const author = submission?.author || {};
      const participantType = String(author.participantType || "").toUpperCase();
      if (!author.ghost && participantType !== "CONTESTANT") return;
      const partyKeys = codeforcesPartyKeys(author);
      const teamId = partyKeys.map((key) => officialPartyIds.get(key)).find(Boolean)
        || officialPartyIds.get(codeforcesTeamId(author, submissionIndex));
      const problemIndex = problemIndexes.get(String(submission?.problem?.index || ""));
      if (!teamId || problemIndex === undefined) return;
      const timestamp = Math.max(0, Math.min(durationSeconds, Math.floor(Number(submission.relativeTimeSeconds) || 0)));
      runs.push({
        id: `cf-${contestId}-${Number.isInteger(submission.id) ? submission.id : ++runId}`,
        team_id: teamId,
        problem_id: problemIndex,
        timestamp,
        status: String(submission.verdict || "UNKNOWN"),
      });
    });
  }

  const matchedJudgedSubmissions = runs.filter((run) => {
    const status = String(run.status || "UNKNOWN").toUpperCase();
    return acceptedStatuses.has(status) || !ignoredStatuses.has(status) && !pendingStatuses.has(status);
  }).length;
  const exactTimeline = Array.isArray(submissions) && (expectedJudgedSubmissions === 0 || matchedJudgedSubmissions >= expectedJudgedSubmissions);
  if (!exactTimeline) {
    runs.length = 0;
    value.rows.forEach((row, rowIndex) => {
      const party = row?.party || {};
      const participantType = String(party.participantType || "").toUpperCase();
      if (!party.ghost && participantType !== "CONTESTANT") return;
      const teamId = codeforcesTeamId(party, rowIndex);
      slots.forEach((_, problemIndex) => {
        const result = row.problemResults?.[problemIndex] || {};
        const rejected = Math.max(0, Math.min(1000, Number(result.rejectedAttemptCount) || 0));
        const best = Number(result.bestSubmissionTimeSeconds);
        const solved = Number(result.points) > 0 || Number.isFinite(best) && best >= 0;
        const timestamp = solved ? Math.max(0, Math.min(durationSeconds, Math.floor(best))) : durationSeconds;
        if (rejected) runs.push({ id: `cf-${contestId}-${++runId}`, team_id: teamId, problem_id: problemIndex, timestamp, status: "WRONG_ANSWER", attempts: rejected });
        if (solved) runs.push({ id: `cf-${contestId}-${++runId}`, team_id: teamId, problem_id: problemIndex, timestamp, status: "ACCEPTED" });
      });
    });
  }

  const submissionCount = runs.reduce((total, run) => total + Math.max(1, Math.floor(Number(run.attempts) || 1)), 0);
  const isGym = contestKind !== "contest";
  return {
    config: {
      contest_name: String(value.contest.name || `Codeforces ${isGym ? "Gym " : ""}${contestId}`),
      start_time: startTimeSeconds,
      end_time: startTimeSeconds + durationSeconds,
      frozen_time: Math.min(3600, durationSeconds),
      penalty: 1200,
      problem_id: slots,
      group: { official: "正式队伍" },
      options: { submission_timestamp_unit: "second" },
    },
    teams,
    runs,
    submissionCount,
    organizations: [],
    boardUrl: `https://codeforces.com/${isGym ? "gym" : "contest"}/${contestId}/standings`,
    sourceFidelity: exactTimeline ? "Codeforces 原场逐提交时间轴" : "Codeforces 原榜解题时间与最终罚时重放",
  };
}

async function loadCodeforcesSubmissions(contestId, codeforces, authenticated) {
  const submissions = [];
  const pageSize = 10_000;
  for (let from = 1; from <= 100_000; from += pageSize) {
    const page = await codeforces("contest.status", new URLSearchParams({ contestId: String(contestId), from: String(from), count: String(pageSize) }), { authenticated });
    if (!Array.isArray(page)) throw new Error("Codeforces 提交时间轴数据无效");
    submissions.push(...page);
    if (page.length < pageSize) return submissions;
  }
  throw new Error("Codeforces 提交时间轴超过安全上限");
}

async function loadCodeforcesSource(contestId, contestKind, codeforces) {
  if (typeof codeforces !== "function") throw new Error("Codeforces 榜单服务未配置");
  const cacheKey = `codeforces-v3:${contestKind}:${contestId}`;
  const timestamp = Date.now();
  const cached = readRuntimeCache(SOURCE_NAMESPACE, cacheKey);
  if (cached && cached.expiresAt > timestamp) return { ...cached, cacheHit: true };
  if (sourceJobs.has(cacheKey)) return sourceJobs.get(cacheKey);
  if (sourceJobs.size >= 8) throw new HttpError(503, "真实榜单同步队列繁忙，请稍后重试", { expose: true });
  const job = (async () => {
    try {
      const authenticated = contestKind === "gym";
      const standingsParams = authenticated
        ? new URLSearchParams({ contestId: String(contestId), from: "1", count: "5000", showUnofficial: "true" })
        : new URLSearchParams({ contestId: String(contestId) });
      const standings = await codeforces("contest.standings", standingsParams, { authenticated });
      let submissions = null;
      try {
        submissions = await loadCodeforcesSubmissions(contestId, codeforces, authenticated);
      } catch (error) {
        console.warn(`Codeforces contest ${contestId} submission timeline unavailable; using final standings`, error instanceof Error ? error.message : error);
      }
      const value = normalizeCodeforcesArchiveStandings(standings, contestId, submissions, contestKind);
      const fetchedAt = Date.now();
      writeRuntimeCache(SOURCE_NAMESPACE, cacheKey, value, {
        itemCount: value.runs.length,
        fetchedAt,
        expiresAt: fetchedAt + 7 * 24 * 60 * 60_000,
        staleUntil: fetchedAt + 90 * 24 * 60 * 60_000,
        maxEntries: 128,
      });
      return { value, fetchedAt, expiresAt: fetchedAt + 7 * 24 * 60 * 60_000, staleUntil: fetchedAt + 90 * 24 * 60 * 60_000, cacheHit: false };
    } catch (error) {
      if (cached && cached.staleUntil > timestamp) return { ...cached, cacheHit: true, stale: true };
      throw error;
    }
  })().finally(() => sourceJobs.delete(cacheKey));
  sourceJobs.set(cacheKey, job);
  return job;
}

export function calculateArchiveStandings(raw, elapsedSeconds, reveal, group = "all") {
  const config = raw.config || {};
  const start = unixMs(Number(config.start_time) || 0);
  const end = unixMs(Number(config.end_time) || 0);
  const durationSeconds = Math.max(1, Math.floor((end - start) / 1000));
  const elapsed = Math.max(0, Math.min(durationSeconds, Math.floor(elapsedSeconds)));
  const freezeSeconds = Math.max(0, Number(config.frozen_time) || 0);
  const freezeAt = Math.max(0, durationSeconds - freezeSeconds);
  const isFrozen = !reveal && elapsed > freezeAt;
  const slots = (config.problem_id?.length ? config.problem_id : Array.from({ length: 13 }, (_, index) => String.fromCharCode(65 + index))).map(String);
  const unit = config.options?.submission_timestamp_unit || "second";
  const penaltySeconds = Number(config.penalty) || 1200;
  const organizations = new Map(list(raw.organizations).map((organization) => [String(organization.id ?? organization.organization_id ?? ""), text(organization.name)]));
  const rowsByTeam = new Map();

  for (const team of list(raw.teams)) {
    const groups = Array.isArray(team.group) ? team.group.map(String) : [];
    if (group !== "all" && !groups.includes(group)) continue;
    const teamId = String(team.id ?? team.team_id ?? "");
    if (!teamId) continue;
    rowsByTeam.set(teamId, {
      rank: 0,
      teamId,
      name: text(team.name ?? team.team_name) || teamId,
      organization: organizations.get(String(team.organization ?? team.organization_id ?? "")) || String(team.organization ?? team.organization_id ?? ""),
      groups,
      solved: 0,
      penalty: 0,
      lastSolvedMinutes: null,
      problems: Object.fromEntries(slots.map((slot) => [slot, { solved: false, wrongAttempts: 0, pendingAttempts: 0, solvedMinutes: null }])),
    });
  }

  const runs = [...list(raw.runs)].sort((left, right) => Number(left.timestamp) - Number(right.timestamp) || String(left.id ?? left.submission_id ?? "").localeCompare(String(right.id ?? right.submission_id ?? "")));
  for (const run of runs) {
    const second = runSeconds(Number(run.timestamp) || 0, unit);
    if (second > elapsed) break;
    const row = rowsByTeam.get(String(run.team_id));
    const slot = slots[Number(run.problem_id)] ?? String(run.problem_id);
    const state = row?.problems[slot];
    if (!row || !state || state.solved || run.is_ignore) continue;
    const status = String(run.status || "UNKNOWN").toUpperCase().replaceAll(" ", "_");
    const attemptCount = Math.max(1, Math.min(1000, Math.floor(Number(run.attempts) || 1)));
    if (isFrozen && second > freezeAt) {
      state.pendingAttempts += attemptCount;
    } else if (ignoredStatuses.has(status)) {
      continue;
    } else if (pendingStatuses.has(status)) {
      state.pendingAttempts += 1;
    } else if (acceptedStatuses.has(status)) {
      state.solved = true;
      state.solvedMinutes = Math.floor(second / 60);
      row.solved += 1;
      row.penalty += state.solvedMinutes + state.wrongAttempts * Math.floor(penaltySeconds / 60);
      row.lastSolvedMinutes = state.solvedMinutes;
    } else {
      state.wrongAttempts += attemptCount;
    }
  }

  const rows = [...rowsByTeam.values()].sort((left, right) => right.solved - left.solved || left.penalty - right.penalty || (left.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) - (right.lastSolvedMinutes ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name, "zh-CN"));
  let previous;
  rows.forEach((row, index) => {
    row.rank = previous && previous.solved === row.solved && previous.penalty === row.penalty && previous.lastSolvedMinutes === row.lastSolvedMinutes ? previous.rank : index + 1;
    previous = row;
  });
  return { rows, slots, elapsedSeconds: elapsed, durationSeconds, freezeAtSeconds: freezeAt, frozen: isFrozen };
}

function snapshotKey({ sourceKey, elapsedBucket, reveal, group, sourceFetchedAt }) {
  return createHash("sha256").update(JSON.stringify({ sourceKey, elapsedBucket, reveal, group, sourceFetchedAt })).digest("hex");
}

async function scoreboard(url, codeforces) {
  const sourceKind = url.searchParams.get("source") === "codeforces" ? "codeforces" : "xcpcio";
  const boardPath = sourceKind === "xcpcio" ? safeBoardPath(url.searchParams.get("boardPath")) : null;
  const gymId = sourceKind === "codeforces" ? boundedInteger(url.searchParams.get("gymId"), { min: 1, max: 10_000_000, fallback: 0 }) : 0;
  const regularContestId = sourceKind === "codeforces" ? boundedInteger(url.searchParams.get("contestId"), { min: 1, max: 10_000_000, fallback: 0 }) : 0;
  const codeforcesContestId = regularContestId || gymId;
  const contestKind = regularContestId ? "contest" : "gym";
  if (sourceKind === "codeforces" && !codeforcesContestId) throw new HttpError(400, "Codeforces 赛事编号无效");
  const id = safeContestId(url.searchParams.get("id"));
  const name = safeLabel(url.searchParams.get("name"), id);
  const group = safeLabel(url.searchParams.get("group"), "all", 100);
  const reveal = url.searchParams.get("reveal") === "1";
  const requestedElapsed = boundedInteger(url.searchParams.get("elapsed"), { min: 0, max: 24 * 60 * 60, fallback: 0 });
  const elapsedBucket = Math.floor(requestedElapsed / 10);
  const elapsed = elapsedBucket * 10;
  const sourceKey = sourceKind === "codeforces" ? `codeforces-v3:${contestKind}:${codeforcesContestId}` : `xcpcio:${boardPath}`;
  const source = sourceKind === "codeforces" ? await loadCodeforcesSource(codeforcesContestId, contestKind, codeforces) : await loadSource(boardPath);
  const key = snapshotKey({ sourceKey, elapsedBucket, reveal, group, sourceFetchedAt: source.fetchedAt });
  const cached = readRuntimeCache(SNAPSHOT_NAMESPACE, key);
  if (cached && cached.expiresAt > Date.now()) return { ...cached.value, cache: { source: true, snapshot: true, persistent: "sqlite" } };

  const calculated = calculateArchiveStandings(source.value, elapsed, reveal, group);
  const startTime = unixMs(Number(source.value.config?.start_time) || 0);
  const endTime = unixMs(Number(source.value.config?.end_time) || 0);
  const result = {
    contest: {
      id,
      name,
      officialName: safeLabel(source.value.config?.contest_name, name),
      startTime: new Date(startTime).toISOString(),
      endTime: new Date(endTime).toISOString(),
      boardUrl: source.value.boardUrl || `https://board.xcpcio.com/${boardPath}`,
      sourceFidelity: source.value.sourceFidelity || "XCPCIO 原场逐提交时间轴",
      groups: source.value.config?.group || {},
      teamCount: source.value.teams.length,
      runCount: source.value.submissionCount ?? source.value.runs.length,
    },
    ...calculated,
    generatedAt: new Date().toISOString(),
    cache: { source: Boolean(source.cacheHit), snapshot: false, persistent: "sqlite" },
  };
  const timestamp = Date.now();
  writeRuntimeCache(SNAPSHOT_NAMESPACE, key, result, {
    itemCount: result.rows.length,
    fetchedAt: timestamp,
    expiresAt: timestamp + 60 * 60_000,
    staleUntil: timestamp + 30 * 24 * 60 * 60_000,
    maxEntries: 1024,
  });
  return result;
}

export function createArchiveScoreboardHandler({ json, codeforces }) {
  return async function handleArchiveScoreboards(request, response, url) {
    if (url.pathname !== "/archive/scoreboards") return false;
    if (request.method !== "GET") {
      json(response, 405, { error: "Method not allowed" }, { Allow: "GET" });
      return true;
    }
    try {
      json(response, 200, await scoreboard(url, codeforces), { "Cache-Control": "private, max-age=5" });
    } catch (error) {
      if (error instanceof HttpError) throw error;
      const message = error instanceof Error && /(XCPCIO|Codeforces Gym|API Key)/i.test(error.message) ? error.message : "真实榜单暂时不可用，请稍后重试";
      throw new HttpError(502, message, { expose: true });
    }
    return true;
  };
}
