import http from "node:http";
import { randomUUID } from "node:crypto";
import { readFile, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createAuthHandler, getTrainingSignals, optionalAuthenticateRequest } from "./auth.mjs";
import { createArchiveScoreboardHandler } from "./archive-scoreboards.mjs";
import { createStatementHandler } from "./statements.mjs";
import { HttpError, boundedInteger, createWindowLimiter, publicError, readJsonBody } from "./http-utils.mjs";
import { buildParticipantVpRows, rankVpRows, summarizeVpStates } from "./vp-scoring.mjs";
import {
  finishVpSession,
  ownerKeys,
  persistVpSession,
  persistenceStats,
  readActiveVpSession,
  readPersonalState,
  readRuntimeCache,
  readVpSession,
  readVpSnapshot,
  runtimeCacheStats,
  standingSnapshotKey,
  startVpSession,
  writePersonalState,
  writeRuntimeCache,
  writeVpSnapshot,
} from "./persistence.mjs";

const PORT = Number(process.env.PORT || 8787);
const CF_BASE = "https://codeforces.com/api";
const USER_AGENT = "icpc-trainer-backend/0.1";
const CF_STANDINGS_CACHE_DIR = join(dirname(process.env.DB_PATH || "./data/icpc-trainer.sqlite"), "cf-standings");
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || "https://icpc-trainer-shallowdream.safe-chime-4451.chatgpt.site,http://localhost:3000,http://localhost:5173").split(",").map((value) => value.trim()).filter(Boolean));
const inFlightCodeforces = new Map();
let apiQueue = Promise.resolve();
let lastApiCall = 0;
let apiQueueDepth = 0;
const requestLimiter = createWindowLimiter({ windowMs: 60_000, limit: 90, maxEntries: 4096 });

const json = (response, status, value, extra = {}) => {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "cross-origin",
    ...extra,
  });
  response.end(JSON.stringify(value));
};

function clientIp(request) {
  const realIp = String(request.headers["x-real-ip"] || "").trim();
  return realIp || request.socket.remoteAddress || "unknown";
}

async function runCodeforces(method, params) {
  const previous = apiQueue;
  let release;
  apiQueue = new Promise((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    const wait = Math.max(0, 2100 - (Date.now() - lastApiCall));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      lastApiCall = Date.now();
      const response = await fetch(`${CF_BASE}/${method}?${params}`, { headers: { "User-Agent": USER_AGENT, Accept: "application/json" }, signal: controller.signal });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.status !== "OK") throw new HttpError(502, "Codeforces 暂时不可用，请稍后重试", { expose: true });
      return payload.result;
    } finally {
      clearTimeout(timeout);
    }
  } finally {
    release();
  }
}

function codeforces(method, params) {
  const key = `${method}?${params}`;
  const current = inFlightCodeforces.get(key);
  if (current) return current;
  if (apiQueueDepth >= 40) throw new HttpError(503, "Codeforces 同步队列繁忙，请稍后重试", { expose: true });
  apiQueueDepth += 1;
  const job = runCodeforces(method, params).finally(() => {
    apiQueueDepth -= 1;
    inFlightCodeforces.delete(key);
  });
  inFlightCodeforces.set(key, job);
  return job;
}

async function getProblemset() {
  const cached = readRuntimeCache("problemset", "all");
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  try {
    const result = await codeforces("problemset.problems", new URLSearchParams({ lang: "en" }));
    if (!Array.isArray(result?.problems)) throw new HttpError(502, "Codeforces 题库响应无效");
    const now = Date.now();
    writeRuntimeCache("problemset", "all", result.problems, { itemCount: result.problems.length, fetchedAt: now, expiresAt: now + 30 * 60_000, staleUntil: now + 24 * 60 * 60_000, maxEntries: 1 });
    return result.problems;
  } catch (error) {
    if (Array.isArray(cached?.value) && cached.staleUntil > Date.now()) return cached.value;
    throw error;
  }
}

async function getSubmissions(handle, count = 1000, maxAgeMs = 60_000) {
  const key = handle.toLowerCase();
  const requestedCount = boundedInteger(count, { min: 1, max: 1000, fallback: 100 });
  const requestedMaxAge = boundedInteger(maxAgeMs, { min: 5_000, max: 60_000, fallback: 60_000 });
  const cached = readRuntimeCache("submissions", key);
  if (cached && Date.now() - cached.fetchedAt <= requestedMaxAge && cached.itemCount >= requestedCount) return cached.value.slice(0, requestedCount);
  try {
    const fetchedCount = Math.max(requestedCount, cached?.itemCount || 0);
    const value = await codeforces("user.status", new URLSearchParams({ handle, from: "1", count: String(fetchedCount) }));
    if (!Array.isArray(value)) throw new HttpError(502, "Codeforces 提交记录响应无效");
    const fetchedAt = Date.now();
    writeRuntimeCache("submissions", key, value, { itemCount: fetchedCount, fetchedAt, expiresAt: fetchedAt + 60_000, staleUntil: fetchedAt + 10 * 60_000, maxEntries: 500 });
    return value.slice(0, requestedCount);
  } catch (error) {
    if (cached && cached.staleUntil > Date.now() && cached.itemCount >= requestedCount) return cached.value.slice(0, requestedCount);
    throw error;
  }
}

async function getContestStandings(contestId) {
  const normalizedId = boundedInteger(contestId, { min: 1, max: 10_000_000, fallback: 0 });
  if (!normalizedId) throw new HttpError(400, "原比赛编号无效");
  const cacheKey = String(normalizedId);
  let cached = readRuntimeCache("contest-standings", cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const cachePath = join(CF_STANDINGS_CACHE_DIR, `${normalizedId}.json`);
  if (!cached) {
    try {
      const persisted = JSON.parse(await readFile(cachePath, "utf8"));
      if (persisted?.value?.contest && Array.isArray(persisted.value.problems) && Array.isArray(persisted.value.rows)) {
        const now = Date.now();
        persisted.value.rows = persisted.value.rows.slice(0, 500);
        writeRuntimeCache("contest-standings", cacheKey, persisted.value, { itemCount: persisted.value.rows.length, fetchedAt: Number(persisted.cachedAt) || now, expiresAt: now + 6 * 60 * 60_000, staleUntil: now + 90 * 24 * 60 * 60_000, maxEntries: 512 });
        cached = readRuntimeCache("contest-standings", cacheKey);
        void unlink(cachePath).catch(() => undefined);
        return persisted.value;
      }
    } catch { /* Cache miss. */ }
  }
  try {
    const value = await codeforces("contest.standings", new URLSearchParams({ contestId: String(normalizedId) }));
    if (!value?.contest || !Array.isArray(value.problems) || !Array.isArray(value.rows)) throw new HttpError(502, "原比赛榜单数据无效");
    value.rows = value.rows.slice(0, 500);
    const now = Date.now();
    writeRuntimeCache("contest-standings", cacheKey, value, { itemCount: value.rows.length, fetchedAt: now, expiresAt: now + 6 * 60 * 60_000, staleUntil: now + 90 * 24 * 60 * 60_000, maxEntries: 512 });
    return value;
  } catch (error) {
    if (cached && cached.staleUntil > Date.now()) return cached.value;
    throw error;
  }
}

function hashSeed(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}

function randomFromSeed(seed) {
  let state = hashSeed(seed) || 1;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ value >>> 15, value | 1);
    value ^= value + Math.imul(value ^ value >>> 7, value | 61);
    return ((value ^ value >>> 14) >>> 0) / 4294967296;
  };
}

function publicProblem(problem) {
  return { code: `CF ${problem.contestId}${problem.index}`, contestId: problem.contestId, index: problem.index, title: problem.name, rating: problem.rating || 0, tags: problem.tags, status: "未尝试" };
}

const THINKING_TAGS = new Set(["constructive algorithms", "greedy", "math", "number theory", "combinatorics", "games", "bitmasks", "two pointers", "binary search", "brute force", "probabilities", "meet-in-the-middle", "ternary search"]);

function isThinkingProblem(problem) {
  return problem.tags.some((tag) => THINKING_TAGS.has(tag));
}

function publicSubmission(item) {
  return {
    id: item.id,
    createdAt: new Date(item.creationTimeSeconds * 1000).toISOString(),
    code: item.problem.contestId ? `CF ${item.problem.contestId}${item.problem.index}` : item.problem.index,
    contestId: item.problem.contestId,
    index: item.problem.index,
    title: item.problem.name,
    language: item.programmingLanguage,
    verdict: item.verdict || "TESTING",
    timeMs: item.timeConsumedMillis,
    memoryBytes: item.memoryConsumedBytes,
  };
}

function validHandle(value) {
  return /^[A-Za-z0-9_.-]{3,24}$/.test(String(value || ""));
}

function normalizeParticipants(value, fallback = "ShallowDream2") {
  const source = Array.isArray(value) ? value : String(value || fallback).split(/[\s,;]+/);
  const handles = [...new Set(source.map((item) => String(item).trim()).filter(Boolean))].slice(0, 12);
  if (!handles.length || handles.some((handle) => !validHandle(handle))) throw new HttpError(400, "参赛 Handle 列表无效");
  return handles;
}

function median(values) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
}

async function recommendProblems(url) {
  const handle = (url.searchParams.get("handle") || "ShallowDream2").trim();
  if (!validHandle(handle)) throw new HttpError(400, "Codeforces Handle 无效");
  const min = boundedInteger(url.searchParams.get("min"), { min: 800, max: 3500, fallback: 1200 });
  const max = Math.max(min, boundedInteger(url.searchParams.get("max"), { min: 800, max: 3500, fallback: 1800 }));
  const limit = boundedInteger(url.searchParams.get("limit"), { min: 6, max: 40, fallback: 20 });
  const query = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 120);
  const mode = ["balanced", "weakness", "upsolve", "speed", "boss", "review"].includes(url.searchParams.get("mode")) ? url.searchParams.get("mode") : "balanced";
  const clientId = (url.searchParams.get("clientId") || "").trim().slice(0, 80);
  const requestedTags = [...new Set((url.searchParams.get("tags") || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
  const [problemset, submissions] = await Promise.all([getProblemset(), getSubmissions(handle, 1000)]);
  const training = getTrainingSignals(clientId, handle);
  const attempted = new Map();
  for (const item of submissions) {
    if (!item.problem?.contestId) continue;
    const key = `${item.problem.contestId}${item.problem.index}`;
    const state = attempted.get(key) || { solved: false, wrong: 0, lastAt: 0, problem: item.problem };
    state.lastAt = Math.max(state.lastAt, Number(item.creationTimeSeconds) || 0);
    state.problem = item.problem;
    if (item.verdict === "OK") state.solved = true;
    else if (!["COMPILATION_ERROR", "SKIPPED", "TESTING"].includes(item.verdict || "")) state.wrong += 1;
    attempted.set(key, state);
  }
  const solved = new Set([...attempted].filter(([, state]) => state.solved).map(([key]) => key));
  const recentRatings = [...attempted.values()].filter((state) => state.solved).sort((a, b) => b.lastAt - a.lastAt).slice(0, 180).map((state) => Number(state.problem.rating) || 0).filter(Boolean);
  const profileRating = percentile(recentRatings, 0.7) || median(recentRatings) || Math.round((min + max) / 200) * 100;
  const targetOffset = mode === "speed" ? -100 : mode === "boss" ? 400 : mode === "upsolve" || mode === "review" ? 0 : 100;
  const targetRating = Math.max(min, Math.min(max, Math.round((profileRating + targetOffset) / 100) * 100));
  const tagCounts = new Map();
  const weaknessScores = new Map();
  for (const state of attempted.values()) {
    for (const tag of state.problem.tags || []) {
      if (state.solved) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
      const pain = state.wrong + (state.solved ? 0 : 2);
      weaknessScores.set(tag, (weaknessScores.get(tag) || 0) + pain);
    }
  }
  const problemByCode = new Map(problemset.filter((item) => item.contestId).map((item) => [`${item.contestId}${item.index}`, item]));
  for (const [code, event] of training.latestByCode) {
    const problem = problemByCode.get(code);
    if (!problem) continue;
    const pain = event.outcome === "unsolved" ? 5 : event.outcome === "editorial" ? 3 : event.outcome === "hinted" ? 1 : 0;
    for (const tag of problem.tags || []) weaknessScores.set(tag, (weaknessScores.get(tag) || 0) + pain);
  }
  const familiarTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([tag]) => tag);
  const weakTags = [...weaknessScores.entries()].filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1] || (tagCounts.get(a[0]) || 0) - (tagCounts.get(b[0]) || 0)).slice(0, 5).map(([tag]) => tag);
  const cfUpsolveCodes = new Set([...attempted].filter(([, state]) => !state.solved).map(([key]) => key));
  const upsolveCodes = new Set([...cfUpsolveCodes, ...training.unsolvedCodes]);
  const reviewCodes = training.dueCodes;
  const baseCandidates = problemset.filter((problem) => {
    if (problem.type !== "PROGRAMMING" || !problem.contestId || !problem.rating || problem.tags.includes("interactive")) return false;
    const key = `${problem.contestId}${problem.index}`;
    if (problem.rating < min || problem.rating > max || solved.has(key)) return false;
    if (training.completedCodes.has(key) && mode !== "review") return false;
    if (mode === "upsolve" && !upsolveCodes.has(key)) return false;
    if (mode === "review" && !reviewCodes.has(key)) return false;
    if (requestedTags.length && !requestedTags.some((tag) => problem.tags.includes(tag))) return false;
    return !query || `${problem.contestId}${problem.index} ${problem.name} ${problem.tags.join(" ")}`.toLowerCase().includes(query);
  }).map((problem) => {
    const key = `${problem.contestId}${problem.index}`;
    const requested = problem.tags.filter((tag) => requestedTags.includes(tag));
    const weak = problem.tags.filter((tag) => weakTags.includes(tag));
    const stableNoise = hashSeed(`${handle}:${problem.contestId}${problem.index}`) % 80;
    let score = Math.abs(problem.rating - targetRating) * (mode === "boss" ? 7 : 5) - requested.length * 450 + stableNoise;
    if (mode === "weakness") score -= weak.length * 650;
    else if (mode === "balanced") score -= weak.length * 180;
    if (mode === "upsolve") score -= (attempted.get(key)?.wrong || 0) * 140 + (attempted.get(key)?.lastAt || 0) / 1e8;
    if (mode === "review") score -= (training.latestByCode.get(key)?.created_at || 0) / 1e8;
    const reason = mode === "upsolve"
      ? `补回做错或未完成的题${attempted.get(key)?.wrong ? ` · ${attempted.get(key).wrong} 次未通过` : ""}`
      : mode === "review"
        ? "已到复盘时间 · 再做一次检验是否真正掌握"
        : mode === "boss"
          ? `挑战题 · 高于近期舒适区约 ${Math.max(0, problem.rating - profileRating)} Rating`
          : mode === "speed"
            ? `限时巩固 · 目标在 25 分钟内独立完成`
            : requested.length
      ? `匹配标签：${requested.slice(0, 2).join(" / ")}`
      : weak.length
        ? `${weak[0]} 弱项训练 · 接近挑战位 ${targetRating}`
        : `接近建议挑战位 ${targetRating}`;
    return { problem, score, reason };
  }).sort((a, b) => a.score - b.score || b.problem.contestId - a.problem.contestId);
  const candidates = baseCandidates.slice(0, limit);
  return {
    source: "codeforces",
    handle,
    profile: {
      solvedCount: solved.size,
      attemptedCount: attempted.size,
      estimatedRating: profileRating,
      targetRating,
      familiarTags,
      weakTags,
      upsolveCount: upsolveCodes.size,
      dueReviewCount: reviewCodes.size,
      mode,
      methodology: "优先补题与弱项；普通训练选择近期舒适区上方约 100 Rating，Boss 题上移约 400。",
    },
    total: baseCandidates.length,
    problems: candidates.map(({ problem, reason }) => ({ ...publicProblem(problem), reason })),
  };
}

function pickRandomSet(pool, count, target, random) {
  const selected = [];
  const used = new Set();
  for (let index = 0; index < count; index++) {
    const desired = Math.round((target - 500 + index * 1000 / Math.max(1, count - 1)) / 100) * 100;
    const candidates = pool.filter((problem) => !used.has(`${problem.contestId}${problem.index}`)).sort((a, b) => Math.abs((a.rating || target) - desired) - Math.abs((b.rating || target) - desired));
    const window = candidates.slice(0, Math.min(24, candidates.length));
    const chosen = window[Math.floor(random() * window.length)];
    if (!chosen) break;
    selected.push(chosen);
    used.add(`${chosen.contestId}${chosen.index}`);
  }
  return selected;
}

function pickThinkingSet(pool, count, target, thinkingRatio, random) {
  const selected = [];
  const used = new Set();
  const contestUsage = new Map();
  const tagUsage = new Map();
  const thinkingTarget = Math.min(count, Math.max(0, Math.round(count * thinkingRatio)));
  let thinkingPicked = 0;
  for (let index = 0; index < count; index++) {
    const desired = Math.round((target - 500 + index * 1000 / Math.max(1, count - 1)) / 100) * 100;
    const remaining = count - index;
    const scheduledThinking = Math.floor((index + 1) * thinkingTarget / count) > Math.floor(index * thinkingTarget / count);
    const mustPickThinking = thinkingPicked < thinkingTarget && (scheduledThinking || thinkingTarget - thinkingPicked >= remaining);
    const candidates = pool.filter((problem) => !used.has(`${problem.contestId}${problem.index}`));
    const thinkingCandidates = mustPickThinking ? candidates.filter(isThinkingProblem) : [];
    const candidatePool = thinkingCandidates.length ? thinkingCandidates : candidates;
    candidatePool.sort((left, right) => {
      const score = (problem) => Math.abs((problem.rating || target) - desired)
        + (contestUsage.get(problem.contestId) || 0) * 90
        + problem.tags.reduce((sum, tag) => sum + (tagUsage.get(tag) || 0) * 14, 0)
        - (thinkingPicked < thinkingTarget && isThinkingProblem(problem) ? 24 : 0);
      return score(left) - score(right);
    });
    const window = candidatePool.slice(0, Math.min(16, candidatePool.length));
    const chosen = window[Math.floor(random() * window.length)];
    if (!chosen) break;
    selected.push(chosen);
    used.add(`${chosen.contestId}${chosen.index}`);
    contestUsage.set(chosen.contestId, (contestUsage.get(chosen.contestId) || 0) + 1);
    for (const tag of chosen.tags) tagUsage.set(tag, (tagUsage.get(tag) || 0) + 1);
    if (isThinkingProblem(chosen)) thinkingPicked += 1;
  }
  return selected;
}

function replayableSourcePool(pool, count, target, random) {
  const sourceCount = Math.min(3, Math.max(2, Math.ceil(count / 4)));
  const minimumPerSource = Math.ceil(count / sourceCount);
  const groups = new Map();
  for (const problem of pool) {
    const group = groups.get(problem.contestId) || [];
    group.push(problem);
    groups.set(problem.contestId, group);
  }
  const candidates = [...groups.values()].filter((problems) => problems.length >= minimumPerSource).sort((left, right) => {
    const score = (problems) => {
      const average = problems.reduce((sum, problem) => sum + (problem.rating || target), 0) / problems.length;
      const thinking = problems.filter(isThinkingProblem).length / problems.length;
      return Math.abs(average - target) - thinking * 120 - Math.min(8, problems.length) * 8;
    };
    return score(left) - score(right);
  });
  if (candidates.length < sourceCount) return pool;
  const window = candidates.slice(0, Math.min(14, candidates.length));
  const chosen = [];
  while (chosen.length < sourceCount && window.length) chosen.push(window.splice(Math.floor(random() * window.length), 1)[0]);
  const restricted = chosen.flat();
  return restricted.length >= count ? restricted : pool;
}

function pickMirror(pool, desiredCount, target, random) {
  const groups = new Map();
  for (const problem of pool) {
    const group = groups.get(problem.contestId) || [];
    group.push(problem);
    groups.set(problem.contestId, group);
  }
  const candidates = [...groups.entries()].map(([contestId, problems]) => ({ contestId, problems: problems.sort((a, b) => a.index.localeCompare(b.index)), average: problems.reduce((sum, item) => sum + (item.rating || target), 0) / problems.length })).filter((item) => item.problems.length >= 5 && item.problems.length <= 13).sort((a, b) => (Math.abs(a.problems.length - desiredCount) * 200 + Math.abs(a.average - target)) - (Math.abs(b.problems.length - desiredCount) * 200 + Math.abs(b.average - target)));
  return candidates[Math.floor(random() * Math.min(12, candidates.length))] || null;
}

function pickCombined(pool, desiredCount, target, random) {
  const groups = new Map();
  for (const problem of pool) {
    const group = groups.get(problem.contestId) || [];
    group.push(problem);
    groups.set(problem.contestId, group);
  }
  const candidates = [...groups.entries()].map(([contestId, problems]) => ({
    contestId,
    problems,
    average: problems.reduce((sum, item) => sum + (item.rating || target), 0) / problems.length,
  })).filter((item) => item.problems.length >= 2).sort((a, b) => Math.abs(a.average - target) - Math.abs(b.average - target));
  const sourceCount = Math.min(4, Math.max(2, Math.ceil(desiredCount / 4)));
  const chosenGroups = [];
  const window = candidates.slice(0, Math.min(24, candidates.length));
  while (chosenGroups.length < sourceCount && window.length) chosenGroups.push(window.splice(Math.floor(random() * window.length), 1)[0]);
  if (chosenGroups.length < 2) return null;
  const selected = [];
  const used = new Set();
  for (let index = 0; index < chosenGroups.length; index++) {
    const desired = target - 400 + index * 800 / Math.max(1, chosenGroups.length - 1);
    const choices = chosenGroups[index].problems.filter((item) => !used.has(`${item.contestId}${item.index}`)).sort((a, b) => Math.abs((a.rating || target) - desired) - Math.abs((b.rating || target) - desired));
    if (choices[0]) { selected.push(choices[0]); used.add(`${choices[0].contestId}${choices[0].index}`); }
  }
  const union = chosenGroups.flatMap((item) => item.problems).filter((item) => !used.has(`${item.contestId}${item.index}`));
  const rest = pickRandomSet(union, Math.max(0, desiredCount - selected.length), target, random);
  return { selected: [...selected, ...rest].sort((a, b) => (a.rating || 0) - (b.rating || 0)), contestIds: chosenGroups.map((item) => item.contestId) };
}

const readBody = (request) => readJsonBody(request, { maxBytes: 64 * 1024 });
const handleAuth = createAuthHandler({ json, readBody, clientIp });
const handleArchiveScoreboards = createArchiveScoreboardHandler({ json });
const handleStatements = createStatementHandler({ json, clientIp });

function requestOwners(request, clientIdValue, { allowGuest = false } = {}) {
  try { return ownerKeys(optionalAuthenticateRequest(request), clientIdValue, { allowGuest }); }
  catch (error) { throw new HttpError(400, error instanceof Error ? error.message : "设备标识无效"); }
}

function personalStateKey(value) {
  const key = String(value || "").trim();
  if (["preferences", "dashboard", "favorites", "active-vp", "archive-vp"].includes(key)) return key;
  if (/^problem:\d{1,7}[A-Z][0-9]?$/.test(key)) return key;
  throw new HttpError(400, "个人数据类型无效");
}

async function generateVp(body, ownerKey) {
  const participants = normalizeParticipants(body.participants || body.handle, "ShallowDream2");
  const handle = participants[0];
  const count = boundedInteger(body.count, { min: 5, max: 13, fallback: 10 });
  const targetRating = boundedInteger(body.targetRating, { min: 800, max: 3000, fallback: 1600 });
  const thinkingRatio = Math.max(0.4, Math.min(0.8, Number(body.thinkingRatio) || 0.6));
  const durationMinutes = boundedInteger(body.durationMinutes, { min: 60, max: 300, fallback: 180 });
  const seed = String(body.seed || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`).slice(0, 64);
  const random = randomFromSeed(seed);
  const [problemset, submissions] = await Promise.all([getProblemset(), getSubmissions(handle, 1000)]);
  const solved = new Set(submissions.filter((item) => item.verdict === "OK" && item.problem.contestId).map((item) => `${item.problem.contestId}${item.problem.index}`));
  const pool = problemset.filter((problem) => problem.type === "PROGRAMMING" && problem.contestId && problem.rating && problem.rating >= Math.max(800, targetRating - 800) && problem.rating <= targetRating + 900 && !problem.tags.includes("interactive") && !solved.has(`${problem.contestId}${problem.index}`));
  let selected;
  let sourceContestId = null;
  let sourceContestIds = [];
  if (body.mode === "原场镜像") {
    const mirror = pickMirror(pool, count, targetRating, random);
    if (!mirror) throw new HttpError(422, "没有找到符合条件的历史比赛");
    selected = mirror.problems;
    sourceContestId = mirror.contestId;
    sourceContestIds = [mirror.contestId];
  } else if (body.mode === "多场组合") {
    const combined = pickCombined(pool, count, targetRating, random);
    if (!combined) throw new HttpError(422, "没有找到足够的历史比赛用于组合");
    selected = combined.selected;
    sourceContestIds = combined.contestIds;
  } else selected = pickThinkingSet(replayableSourcePool(pool, count, targetRating, random), count, targetRating, thinkingRatio, random);
  if (selected.length < 5) throw new HttpError(422, "可用题目不足，请调整组卷条件");
  if (!sourceContestIds.length) sourceContestIds = [...new Set(selected.map((problem) => problem.contestId))];
  const sourceContests = sourceContestIds.map((contestId) => {
    const sourceProblems = selected.filter((problem) => problem.contestId === contestId);
    return { contestId, problemCount: sourceProblems.length, averageRating: Math.round(sourceProblems.reduce((sum, item) => sum + (item.rating || targetRating), 0) / Math.max(1, sourceProblems.length)), url: `https://codeforces.com/contest/${contestId}/standings` };
  });
  void Promise.allSettled(sourceContestIds.map((contestId) => getContestStandings(contestId)));
  const mode = body.mode === "原场镜像" ? "原场镜像" : body.mode === "多场组合" ? "多场组合" : "自由组卷";
  const contest = { id: `vp-${randomUUID()}`, handle, participants, mode, seed, durationMinutes, targetRating, thinkingRatio, thinkingCount: selected.filter(isThinkingProblem).length, sourceContestId, sourceContests, excludedSolved: solved.size, createdAt: new Date().toISOString(), problems: selected.map((problem, index) => ({ slot: String.fromCharCode(65 + index), ...publicProblem(problem), thinking: isThinkingProblem(problem) })) };
  persistVpSession(ownerKey, contest);
  return contest;
}

function vpProblemKey(problem) {
  return `${problem.contestId}${problem.index}`;
}

function emptyVpStates(problems) {
  return Object.fromEntries(problems.map((problem) => [vpProblemKey(problem), { solved: false, wrongAttempts: 0, pendingAttempts: 0, solvedMinutes: null, penalty: 0 }]));
}

function originalPartyIdentity(party) {
  if (party?.participantType && party.participantType !== "CONTESTANT") return null;
  const handles = (party?.members || []).map((member) => String(member?.handle || "").trim()).filter(Boolean);
  if (!handles.length) return null;
  const identity = [...handles].map((handle) => handle.toLowerCase()).sort().join("+");
  return { id: `original:${identity}`, handle: String(party.teamName || handles.join(" + ")) };
}

function buildOriginalVpRows(problems, sourceBoards, elapsedSeconds) {
  const combined = new Map();
  for (const source of sourceBoards) {
    const selected = problems.filter((problem) => problem.contestId === source.contest.id);
    if (!selected.length) continue;
    const positions = new Map(source.problems.map((problem, index) => [problem.index, index]));
    for (const sourceRow of source.rows) {
      const identity = originalPartyIdentity(sourceRow.party);
      if (!identity) continue;
      let row = combined.get(identity.id);
      if (!row) {
        row = { ...identity, solved: 0, penalty: 0, problems: emptyVpStates(problems), sourceContests: new Set(), origin: "original", mine: false };
        combined.set(identity.id, row);
      }
      row.sourceContests.add(source.contest.id);
      for (const problem of selected) {
        const position = positions.get(problem.index);
        const result = position === undefined ? null : sourceRow.problemResults?.[position];
        if (!result) continue;
        const solvedAt = Number(result.bestSubmissionTimeSeconds);
        const rejected = Math.max(0, Number(result.rejectedAttemptCount) || 0);
        const state = row.problems[vpProblemKey(problem)];
        if (Number(result.points) > 0 && Number.isFinite(solvedAt) && solvedAt >= 0 && solvedAt <= elapsedSeconds) {
          state.solved = true;
          state.wrongAttempts = rejected;
          state.solvedMinutes = Math.floor(solvedAt / 60);
          state.penalty = state.solvedMinutes + rejected * 20;
        } else if (elapsedSeconds >= Number(source.contest.durationSeconds || 0)) state.wrongAttempts = rejected;
      }
    }
  }
  return [...combined.values()].map((row) => {
    return { ...row, sourceCount: row.sourceContests.size, sourceContests: [...row.sourceContests], ...summarizeVpStates(row.problems) };
  });
}

async function buildVpStandings(body, ownerKey) {
  const participants = normalizeParticipants(body.participants || body.handle, "ShallowDream2");
  const startedAt = Number(body.startedAt);
  const durationMinutes = boundedInteger(body.durationMinutes, { min: 60, max: 600, fallback: 180 });
  if (!Number.isFinite(startedAt) || startedAt <= 0 || startedAt > Date.now() + 60_000) throw new HttpError(400, "比赛开始时间无效");
  const problems = Array.isArray(body.problems) ? body.problems.slice(0, 20).filter((item) => Number(item?.contestId) && /^[A-Z][0-9]?$/.test(String(item?.index || ""))).map((item, index) => ({ contestId: Number(item.contestId), index: String(item.index), slot: String(item.slot || String.fromCharCode(65 + index)) })) : [];
  if (!problems.length) throw new HttpError(400, "比赛题目为空");
  const durationSeconds = durationMinutes * 60;
  const elapsedSeconds = Math.max(0, Math.min(durationSeconds, Math.floor((Date.now() - startedAt) / 1000)));
  const freezeAtSeconds = Math.max(0, durationSeconds - 60 * 60);
  const finished = elapsedSeconds >= durationSeconds;
  const frozen = !finished && elapsedSeconds >= freezeAtSeconds;
  const boardElapsedSeconds = frozen ? freezeAtSeconds : elapsedSeconds;
  const pollAfterSeconds = Math.max(15, Math.ceil(participants.length * 2.5));
  const sessionId = typeof body.vpId === "string" && /^vp-[a-f0-9-]{16,64}$/i.test(body.vpId) ? body.vpId : null;
  if (sessionId && !readVpSession(sessionId, ownerKey)) throw new HttpError(404, "VP 记录不存在或不属于当前账号");
  const snapshotKey = sessionId ? `session:${sessionId}` : standingSnapshotKey({ participants, startedAt, durationMinutes, problems });
  const elapsedBucket = Math.floor(elapsedSeconds / pollAfterSeconds);
  const cachedSnapshot = readVpSnapshot(snapshotKey, elapsedBucket);
  if (cachedSnapshot) return { ...cachedSnapshot.value, cacheHit: true };
  const contestIds = [...new Set(problems.map((problem) => problem.contestId))];
  const [sourceResults, submissionSets] = await Promise.all([
    Promise.allSettled(contestIds.map((contestId) => getContestStandings(contestId))),
    Promise.all(participants.map((handle) => getSubmissions(handle, 1000, 15_000))),
  ]);
  const sourceBoards = sourceResults.flatMap((result) => result.status === "fulfilled" ? [result.value] : []);
  const unavailableContestIds = contestIds.filter((_, index) => sourceResults[index].status === "rejected");
  const originalRows = buildOriginalVpRows(problems, sourceBoards, boardElapsedSeconds);
  const participantRows = buildParticipantVpRows(participants, problems, startedAt, submissionSets, elapsedSeconds);
  const boardParticipantRows = frozen ? buildParticipantVpRows(participants, problems, startedAt, submissionSets, freezeAtSeconds) : participantRows;
  const ranked = rankVpRows(originalRows, boardParticipantRows, originalRows.length);
  const rows = ranked.rows;
  const rankedById = new Map(rows.map((row) => [row.id, row]));
  const liveParticipantRows = participantRows.map((row) => ({ ...row, rank: rankedById.get(row.id)?.rank || rows.length, medal: rankedById.get(row.id)?.medal || null }));
  const visible = rows.slice(0, 120);
  for (const row of boardParticipantRows) if (!visible.some((item) => item.id === row.id)) visible.push(rankedById.get(row.id) || row);
  const result = {
    updatedAt: new Date().toISOString(),
    startedAt,
    durationMinutes,
    elapsedSeconds,
    freezeAtSeconds,
    frozen,
    finished,
    pollAfterSeconds,
    totalRows: rows.length,
    originalTeams: originalRows.length,
    unavailableContestIds,
    sourceBoards: sourceBoards.map((source) => ({ contestId: source.contest.id, name: source.contest.name, selectedProblems: problems.filter((problem) => problem.contestId === source.contest.id).map((problem) => problem.slot), sampledTeams: source.rows.length })),
    medalCutoffs: ranked.cutoffs,
    participantRows: liveParticipantRows,
    rows: visible,
  };
  writeVpSnapshot(snapshotKey, sessionId, elapsedBucket, result);
  return result;
}

const server = http.createServer(async (request, response) => {
  const requestId = randomUUID();
  response.setHeader("X-Request-Id", requestId);
  response.setHeader("Referrer-Policy", "no-referrer");
  response.setHeader("X-Frame-Options", "DENY");
  if (String(request.url || "").length > 4096) return json(response, 414, { error: "请求地址过长", requestId });
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const origin = String(request.headers.origin || "");
  if (ALLOWED_ORIGINS.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Access-Control-Expose-Headers", "X-Request-Id, Retry-After");
    response.setHeader("Access-Control-Max-Age", "600");
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") return response.writeHead(ALLOWED_ORIGINS.has(origin) ? 204 : 403).end();
  if (url.pathname === "/health") {
    if (request.method !== "GET") return json(response, 405, { error: "Method not allowed", requestId }, { Allow: "GET" });
    const memory = process.memoryUsage();
    const caches = runtimeCacheStats();
    return json(response, 200, {
      status: "ok",
      service: "icpc-trainer-api",
      uptime: Math.round(process.uptime()),
      memory: {
        rssMiB: Math.round(memory.rss / 1024 / 1024),
        heapUsedMiB: Math.round(memory.heapUsed / 1024 / 1024),
        heapTotalMiB: Math.round(memory.heapTotal / 1024 / 1024),
      },
      caches: {
        storage: "sqlite",
        problemsets: caches.problemset || 0,
        submissions: caches.submissions || 0,
        contestStandings: caches["contest-standings"] || 0,
        archiveScoreboardSources: caches["archive-scoreboard-source"] || 0,
        archiveScoreboardViews: caches["archive-scoreboard-view"] || 0,
        codeforcesInFlight: inFlightCodeforces.size,
      },
      persistence: persistenceStats(),
    });
  }
  const rate = requestLimiter(clientIp(request));
  response.setHeader("RateLimit-Limit", "90");
  response.setHeader("RateLimit-Remaining", String(rate.remaining));
  if (!rate.allowed) return json(response, 429, { error: "请求过于频繁", requestId }, { "Retry-After": String(rate.retryAfterSeconds) });
  try {
    if (await handleAuth(request, response, url)) return;
    if (await handleStatements(request, response, url)) return;
    if (await handleArchiveScoreboards(request, response, url)) return;
    if (request.method === "GET" && url.pathname === "/state") {
      const key = personalStateKey(url.searchParams.get("key"));
      const owners = requestOwners(request, url.searchParams.get("clientId"));
      return json(response, 200, readPersonalState(owners, key));
    }
    if (request.method === "POST" && url.pathname === "/state") {
      const body = await readBody(request);
      const key = personalStateKey(body.key);
      const owners = requestOwners(request, body.clientId);
      writePersonalState(owners.primary, key, body.value ?? null);
      return json(response, 200, { ok: true, updatedAt: new Date().toISOString() });
    }
    if (request.method === "GET" && url.pathname === "/vp/sessions/active") {
      const owners = requestOwners(request, url.searchParams.get("clientId"), { allowGuest: true });
      let session = readActiveVpSession(owners.primary);
      if (!session && owners.fallback) {
        session = readActiveVpSession(owners.fallback);
        if (session) persistVpSession(owners.primary, session);
      }
      return json(response, 200, { session });
    }
    if (request.method === "POST" && url.pathname === "/vp/sessions/start") {
      const body = await readBody(request);
      const owners = requestOwners(request, body.clientId, { allowGuest: true });
      const session = startVpSession(String(body.id || ""), owners.primary, body.startedAt);
      return session ? json(response, 200, { session }) : json(response, 404, { error: "VP 记录不存在或不属于当前账号" });
    }
    if (request.method === "POST" && url.pathname === "/vp/sessions/finish") {
      const body = await readBody(request);
      const owners = requestOwners(request, body.clientId, { allowGuest: true });
      return finishVpSession(String(body.id || ""), owners.primary) ? json(response, 200, { ok: true }) : json(response, 404, { error: "VP 记录不存在或不属于当前账号" });
    }
    if (request.method === "GET" && url.pathname === "/problemset") return json(response, 200, { problems: await getProblemset() }, { "Cache-Control": "public, max-age=600" });
    if (request.method === "GET" && url.pathname === "/codeforces/problems") {
      const all = await getProblemset();
      const scope = url.searchParams.get("scope") || "all";
      if (scope === "single") {
        const code = (url.searchParams.get("code") || "").replace(/^CF\s*/i, "").toLowerCase();
        const problem = all.find((item) => `${item.contestId}${item.index}`.toLowerCase() === code);
        return problem ? json(response, 200, { source: "codeforces", problem: publicProblem(problem) }) : json(response, 404, { error: "题目不存在" });
      }
      const min = boundedInteger(url.searchParams.get("min"), { min: 800, max: 3500, fallback: 800 });
      const max = Math.max(min, boundedInteger(url.searchParams.get("max"), { min: 800, max: 3500, fallback: 3500 }));
      const page = boundedInteger(url.searchParams.get("page"), { min: 1, max: 10_000, fallback: 1 });
      const limit = boundedInteger(url.searchParams.get("limit"), { min: 20, max: 100, fallback: 60 });
      const query = (url.searchParams.get("q") || "").trim().toLowerCase().slice(0, 120);
      const tags = [...new Set((url.searchParams.get("tags") || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))].slice(0, 8);
      const filtered = all.filter((problem) => problem.type === "PROGRAMMING" && problem.contestId && problem.rating && problem.rating >= min && problem.rating <= max && !problem.tags.includes("interactive") && (!tags.length || tags.some((tag) => problem.tags.includes(tag))) && (!query || `${problem.contestId}${problem.index} ${problem.name} ${problem.tags.join(" ")}`.toLowerCase().includes(query))).sort((a, b) => (a.rating || 0) - (b.rating || 0) || (b.contestId || 0) - (a.contestId || 0) || a.index.localeCompare(b.index));
      const offset = (page - 1) * limit;
      return json(response, 200, { source: "codeforces", page, total: filtered.length, problems: filtered.slice(offset, offset + limit).map(publicProblem) }, { "Cache-Control": "public, max-age=600" });
    }
    if (request.method === "GET" && url.pathname === "/codeforces/recommendations") return json(response, 200, await recommendProblems(url), { "Cache-Control": "private, max-age=60" });
    if (request.method === "GET" && url.pathname === "/submissions/raw") {
      const handle = (url.searchParams.get("handle") || "").trim();
      const count = boundedInteger(url.searchParams.get("count"), { min: 1, max: 1000, fallback: 100 });
      if (!/^[A-Za-z0-9_.-]{3,24}$/.test(handle)) return json(response, 400, { error: "Handle 无效" });
      return json(response, 200, { submissions: await getSubmissions(handle, count) });
    }
    if (request.method === "GET" && url.pathname === "/codeforces/submissions") {
      const handle = (url.searchParams.get("handle") || "").trim();
      if (!/^[A-Za-z0-9_.-]{3,24}$/.test(handle)) return json(response, 400, { error: "请输入有效的 Codeforces Handle" });
      const submissions = (await getSubmissions(handle, 100)).map(publicSubmission);
      return json(response, 200, { source: "codeforces", handle, syncedAt: new Date().toISOString(), submissions });
    }
    if (request.method === "POST" && url.pathname === "/vp/generate") {
      const body = await readBody(request);
      const owners = requestOwners(request, body.clientId, { allowGuest: true });
      return json(response, 200, await generateVp(body, owners.primary));
    }
    if (request.method === "POST" && url.pathname === "/vp/standings") {
      const body = await readBody(request);
      const owners = requestOwners(request, body.clientId, { allowGuest: true });
      return json(response, 200, await buildVpStandings(body, owners.primary));
    }
    return json(response, 404, { error: "Not found", requestId });
  } catch (error) {
    const exposed = publicError(error, "服务暂时不可用，请稍后重试");
    if (exposed.status >= 500) console.error(new Date().toISOString(), requestId, request.method, url.pathname, error);
    return json(response, exposed.status, { error: exposed.message, requestId });
  }
});

server.requestTimeout = 70_000;
server.headersTimeout = 15_000;
server.keepAliveTimeout = 5_000;
server.maxRequestsPerSocket = 1_000;
server.on("clientError", (_error, socket) => {
  if (socket.writable) socket.end("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n");
});
server.listen(PORT, "0.0.0.0", () => console.log(`icpc-trainer-api listening on ${PORT}`));

function shutdown(signal) {
  console.log(`${signal}: closing icpc-trainer-api`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.once("SIGTERM", () => shutdown("SIGTERM"));
process.once("SIGINT", () => shutdown("SIGINT"));
