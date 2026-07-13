import http from "node:http";
import { createAuthHandler, getTrainingSignals } from "./auth.mjs";
import { createStatementHandler } from "./statements.mjs";

const PORT = Number(process.env.PORT || 8787);
const CF_BASE = "https://codeforces.com/api";
const USER_AGENT = "icpc-trainer-backend/0.1";
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || "https://icpc-lab-trainer.zhuj7933.chatgpt.site,http://localhost:3000,http://localhost:5173").split(",").map((value) => value.trim()).filter(Boolean));
let problemCache = null;
const submissionCache = new Map();
let apiQueue = Promise.resolve();
let lastApiCall = 0;
const requestWindows = new Map();

const json = (response, status, value, extra = {}) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  response.end(JSON.stringify(value));
};

function clientIp(request) {
  const forwarded = String(request.headers["x-real-ip"] || request.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return forwarded || request.socket.remoteAddress || "unknown";
}

function allowRequest(request) {
  const ip = clientIp(request);
  const now = Date.now();
  const state = requestWindows.get(ip);
  if (!state || now - state.startedAt > 60_000) {
    requestWindows.set(ip, { startedAt: now, count: 1 });
    return true;
  }
  state.count += 1;
  return state.count <= 90;
}

async function codeforces(method, params) {
  const previous = apiQueue;
  let release;
  apiQueue = new Promise((resolve) => { release = resolve; });
  await previous.catch(() => undefined);
  try {
    const wait = Math.max(0, 2100 - (Date.now() - lastApiCall));
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const response = await fetch(`${CF_BASE}/${method}?${params}`, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
    clearTimeout(timeout);
    const payload = await response.json();
    lastApiCall = Date.now();
    if (!response.ok || payload.status !== "OK") throw new Error(payload.comment || `Codeforces HTTP ${response.status}`);
    return payload.result;
  } finally {
    release();
  }
}

async function getProblemset() {
  if (problemCache && problemCache.expiresAt > Date.now()) return problemCache.value;
  const result = await codeforces("problemset.problems", new URLSearchParams({ lang: "en" }));
  problemCache = { expiresAt: Date.now() + 30 * 60_000, value: result.problems };
  return result.problems;
}

async function getSubmissions(handle, count = 1000) {
  const key = `${handle.toLowerCase()}:${count}`;
  const cached = submissionCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = await codeforces("user.status", new URLSearchParams({ handle, from: "1", count: String(count) }));
  submissionCache.set(key, { expiresAt: Date.now() + 60_000, value });
  return value;
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
  if (!handles.length || handles.some((handle) => !validHandle(handle))) throw new Error("参赛 Handle 列表无效");
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
  if (!validHandle(handle)) throw new Error("Codeforces Handle 无效");
  const min = Math.max(800, Number(url.searchParams.get("min")) || 1200);
  const max = Math.min(3500, Math.max(min, Number(url.searchParams.get("max")) || 1800));
  const limit = Math.min(40, Math.max(6, Number(url.searchParams.get("limit")) || 20));
  const query = (url.searchParams.get("q") || "").trim().toLowerCase();
  const mode = ["balanced", "weakness", "upsolve", "speed", "boss", "review"].includes(url.searchParams.get("mode")) ? url.searchParams.get("mode") : "balanced";
  const clientId = (url.searchParams.get("clientId") || "").trim();
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

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 64 * 1024) throw new Error("Request body too large");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

const handleAuth = createAuthHandler({ json, readBody, clientIp });
const handleStatements = createStatementHandler({ json, clientIp });

async function generateVp(body) {
  const participants = normalizeParticipants(body.participants || body.handle, "ShallowDream2");
  const handle = participants[0];
  const count = Math.max(5, Math.min(13, Number(body.count) || 10));
  const targetRating = Math.max(800, Math.min(3000, Number(body.targetRating) || 1600));
  const durationMinutes = Math.max(60, Math.min(300, Number(body.durationMinutes) || 180));
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
    if (!mirror) throw new Error("没有找到符合条件的历史比赛");
    selected = mirror.problems;
    sourceContestId = mirror.contestId;
    sourceContestIds = [mirror.contestId];
  } else if (body.mode === "多场组合") {
    const combined = pickCombined(pool, count, targetRating, random);
    if (!combined) throw new Error("没有找到足够的历史比赛用于组合");
    selected = combined.selected;
    sourceContestIds = combined.contestIds;
  } else selected = pickRandomSet(pool, count, targetRating, random);
  if (selected.length < 5) throw new Error("可用题目不足，请调整组卷条件");
  if (!sourceContestIds.length) sourceContestIds = [...new Set(selected.map((problem) => problem.contestId))];
  const sourceContests = sourceContestIds.map((contestId) => {
    const sourceProblems = selected.filter((problem) => problem.contestId === contestId);
    return { contestId, problemCount: sourceProblems.length, averageRating: Math.round(sourceProblems.reduce((sum, item) => sum + (item.rating || targetRating), 0) / Math.max(1, sourceProblems.length)), url: `https://codeforces.com/contest/${contestId}/standings` };
  });
  const mode = body.mode === "原场镜像" ? "原场镜像" : body.mode === "多场组合" ? "多场组合" : "个性化组卷";
  return { id: `vp-${hashSeed(`${seed}:${handle}`).toString(16)}`, handle, participants, mode, seed, durationMinutes, targetRating, sourceContestId, sourceContests, excludedSolved: solved.size, createdAt: new Date().toISOString(), problems: selected.map((problem, index) => ({ slot: String.fromCharCode(65 + index), ...publicProblem(problem) })) };
}

async function buildVpStandings(body) {
  const participants = normalizeParticipants(body.participants || body.handle, "ShallowDream2");
  const startedAt = Number(body.startedAt);
  const durationMinutes = Math.max(60, Math.min(600, Number(body.durationMinutes) || 180));
  if (!Number.isFinite(startedAt) || startedAt <= 0) throw new Error("比赛尚未开始");
  const problems = Array.isArray(body.problems) ? body.problems.slice(0, 20).filter((item) => Number(item?.contestId) && /^[A-Z][0-9]?$/.test(String(item?.index || ""))) : [];
  if (!problems.length) throw new Error("比赛题目为空");
  const startSeconds = Math.floor(startedAt / 1000);
  const endSeconds = startSeconds + durationMinutes * 60;
  const problemKeys = new Map(problems.map((problem) => [`${problem.contestId}${problem.index}`, problem]));
  const rows = [];
  for (const handle of participants) {
    const submissions = await getSubmissions(handle, 1000);
    const states = new Map(problems.map((problem) => [`${problem.contestId}${problem.index}`, { solved: false, wrongAttempts: 0, solvedMinutes: null, penalty: 0 }]));
    const ordered = submissions.filter((item) => item.creationTimeSeconds >= startSeconds && item.creationTimeSeconds <= endSeconds && problemKeys.has(`${item.problem?.contestId}${item.problem?.index}`)).sort((a, b) => a.creationTimeSeconds - b.creationTimeSeconds);
    for (const submission of ordered) {
      const key = `${submission.problem.contestId}${submission.problem.index}`;
      const state = states.get(key);
      if (!state || state.solved) continue;
      if (submission.verdict === "OK") {
        state.solved = true;
        state.solvedMinutes = Math.max(0, Math.floor((submission.creationTimeSeconds - startSeconds) / 60));
        state.penalty = state.solvedMinutes + state.wrongAttempts * 20;
      } else if (!["COMPILATION_ERROR", "SKIPPED", "TESTING"].includes(submission.verdict || "")) state.wrongAttempts += 1;
    }
    const solved = [...states.values()].filter((state) => state.solved).length;
    const penalty = [...states.values()].reduce((sum, state) => sum + state.penalty, 0);
    rows.push({ handle, solved, penalty, problems: Object.fromEntries(states) });
  }
  rows.sort((a, b) => b.solved - a.solved || a.penalty - b.penalty || a.handle.localeCompare(b.handle));
  let previous = null;
  rows.forEach((row, index) => {
    row.rank = previous && previous.solved === row.solved && previous.penalty === row.penalty ? previous.rank : index + 1;
    previous = row;
  });
  return { updatedAt: new Date().toISOString(), startedAt, durationMinutes, rows };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  const origin = String(request.headers.origin || "");
  if (ALLOWED_ORIGINS.has(origin)) {
    response.setHeader("Access-Control-Allow-Origin", origin);
    response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    response.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    response.setHeader("Vary", "Origin");
  }
  if (request.method === "OPTIONS") return response.writeHead(ALLOWED_ORIGINS.has(origin) ? 204 : 403).end();
  if (url.pathname === "/health") return json(response, 200, { status: "ok", service: "icpc-trainer-api", uptime: Math.round(process.uptime()) });
  if (!allowRequest(request)) return json(response, 429, { error: "请求过于频繁" });
  try {
    if (await handleAuth(request, response, url)) return;
    if (await handleStatements(request, response, url)) return;
    if (request.method === "GET" && url.pathname === "/problemset") return json(response, 200, { problems: await getProblemset() });
    if (request.method === "GET" && url.pathname === "/codeforces/problems") {
      const all = await getProblemset();
      const scope = url.searchParams.get("scope") || "all";
      if (scope === "single") {
        const code = (url.searchParams.get("code") || "").replace(/^CF\s*/i, "").toLowerCase();
        const problem = all.find((item) => `${item.contestId}${item.index}`.toLowerCase() === code);
        return problem ? json(response, 200, { source: "codeforces", problem: publicProblem(problem) }) : json(response, 404, { error: "题目不存在" });
      }
      const min = Math.max(800, Number(url.searchParams.get("min")) || 800);
      const max = Math.min(3500, Number(url.searchParams.get("max")) || 3500);
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const limit = Math.min(100, Math.max(20, Number(url.searchParams.get("limit")) || 60));
      const query = (url.searchParams.get("q") || "").trim().toLowerCase();
      const tags = [...new Set((url.searchParams.get("tags") || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean))];
      const filtered = all.filter((problem) => problem.type === "PROGRAMMING" && problem.contestId && problem.rating && problem.rating >= min && problem.rating <= max && !problem.tags.includes("interactive") && (!tags.length || tags.some((tag) => problem.tags.includes(tag))) && (!query || `${problem.contestId}${problem.index} ${problem.name} ${problem.tags.join(" ")}`.toLowerCase().includes(query))).sort((a, b) => (a.rating || 0) - (b.rating || 0) || (b.contestId || 0) - (a.contestId || 0) || a.index.localeCompare(b.index));
      const offset = (page - 1) * limit;
      return json(response, 200, { source: "codeforces", page, total: filtered.length, problems: filtered.slice(offset, offset + limit).map(publicProblem) }, { "Cache-Control": "public, max-age=600" });
    }
    if (request.method === "GET" && url.pathname === "/codeforces/recommendations") return json(response, 200, await recommendProblems(url), { "Cache-Control": "private, max-age=60" });
    if (request.method === "GET" && url.pathname === "/submissions/raw") {
      const handle = (url.searchParams.get("handle") || "").trim();
      const count = Math.min(1000, Math.max(1, Number(url.searchParams.get("count")) || 100));
      if (!/^[A-Za-z0-9_.-]{3,24}$/.test(handle)) return json(response, 400, { error: "Handle 无效" });
      return json(response, 200, { submissions: await getSubmissions(handle, count) });
    }
    if (request.method === "GET" && url.pathname === "/codeforces/submissions") {
      const handle = (url.searchParams.get("handle") || "").trim();
      if (!/^[A-Za-z0-9_.-]{3,24}$/.test(handle)) return json(response, 400, { error: "请输入有效的 Codeforces Handle" });
      const submissions = (await getSubmissions(handle, 100)).map(publicSubmission);
      return json(response, 200, { source: "codeforces", handle, syncedAt: new Date().toISOString(), submissions });
    }
    if (request.method === "POST" && url.pathname === "/vp/generate") return json(response, 200, await generateVp(await readBody(request)));
    if (request.method === "POST" && url.pathname === "/vp/standings") return json(response, 200, await buildVpStandings(await readBody(request)));
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(new Date().toISOString(), request.method, url.pathname, error);
    return json(response, 502, { error: error instanceof Error ? error.message : "Upstream failure" });
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`icpc-trainer-api listening on ${PORT}`));
