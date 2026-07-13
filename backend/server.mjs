import http from "node:http";

const PORT = Number(process.env.PORT || 8787);
const CF_BASE = "https://codeforces.com/api";
const USER_AGENT = "icpc-trainer-backend/0.1";
let problemCache = null;
const submissionCache = new Map();
let apiQueue = Promise.resolve();
let lastApiCall = 0;
const requestWindows = new Map();

const json = (response, status, value, extra = {}) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extra });
  response.end(JSON.stringify(value));
};

function allowRequest(request) {
  const ip = request.socket.remoteAddress || "unknown";
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

async function generateVp(body) {
  const handle = String(body.handle || "ShallowDream2").trim();
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(handle)) throw new Error("Codeforces Handle 无效");
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
  if (body.mode === "原场镜像") {
    const mirror = pickMirror(pool, count, targetRating, random);
    if (!mirror) throw new Error("没有找到符合条件的历史比赛");
    selected = mirror.problems;
    sourceContestId = mirror.contestId;
  } else selected = pickRandomSet(pool, count, targetRating, random);
  if (selected.length < 5) throw new Error("可用题目不足，请调整组卷条件");
  return { id: `vp-${hashSeed(`${seed}:${handle}`).toString(16)}`, handle, mode: body.mode === "原场镜像" ? "原场镜像" : "随机组卷", seed, durationMinutes, targetRating, sourceContestId, excludedSolved: solved.size, createdAt: new Date().toISOString(), problems: selected.map((problem, index) => ({ slot: String.fromCharCode(65 + index), ...publicProblem(problem) })) };
}

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
  if (url.pathname === "/health") return json(response, 200, { status: "ok", service: "icpc-trainer-api", uptime: Math.round(process.uptime()) });
  if (!allowRequest(request)) return json(response, 429, { error: "请求过于频繁" });
  try {
    if (request.method === "GET" && url.pathname === "/problemset") return json(response, 200, { problems: await getProblemset() });
    if (request.method === "GET" && url.pathname === "/submissions/raw") {
      const handle = (url.searchParams.get("handle") || "").trim();
      const count = Math.min(1000, Math.max(1, Number(url.searchParams.get("count")) || 100));
      if (!/^[A-Za-z0-9_.-]{3,24}$/.test(handle)) return json(response, 400, { error: "Handle 无效" });
      return json(response, 200, { submissions: await getSubmissions(handle, count) });
    }
    if (request.method === "POST" && url.pathname === "/vp/generate") return json(response, 200, await generateVp(await readBody(request)));
    return json(response, 404, { error: "Not found" });
  } catch (error) {
    console.error(new Date().toISOString(), request.method, url.pathname, error);
    return json(response, 502, { error: error instanceof Error ? error.message : "Upstream failure" });
  }
});

server.listen(PORT, "0.0.0.0", () => console.log(`icpc-trainer-api listening on ${PORT}`));
