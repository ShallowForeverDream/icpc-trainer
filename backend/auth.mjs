import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { HttpError, boundedInteger, createWindowLimiter, publicError } from "./http-utils.mjs";

const DB_PATH = process.env.DB_PATH || "/data/icpc-trainer.sqlite";
const SESSION_TTL = 30 * 24 * 60 * 60 * 1000;
const loginLimiter = createWindowLimiter({ windowMs: 15 * 60_000, limit: 10, maxEntries: 2048 });
const loginIpLimiter = createWindowLimiter({ windowMs: 15 * 60_000, limit: 30, maxEntries: 2048 });
const registrationLimiter = createWindowLimiter({ windowMs: 60 * 60_000, limit: 20, maxEntries: 2048 });
const feedbackLimiter = createWindowLimiter({ windowMs: 60 * 60_000, limit: 12, maxEntries: 2048 });

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    password_salt TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
    must_change_password INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS invites (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code_hash TEXT NOT NULL UNIQUE,
    code_prefix TEXT NOT NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    max_uses INTEGER NOT NULL DEFAULT 1,
    used_count INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    token_hash TEXT NOT NULL UNIQUE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_token_idx ON sessions(token_hash);
  CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions(user_id);
  CREATE TABLE IF NOT EXISTS training_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    handle TEXT NOT NULL,
    code TEXT NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('independent', 'hinted', 'editorial', 'unsolved')),
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    hint_level INTEGER NOT NULL DEFAULT 0,
    difficulty TEXT NOT NULL DEFAULT 'right' CHECK (difficulty IN ('easy', 'right', 'hard')),
    reflection TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS training_events_client_idx ON training_events(client_id, handle, created_at DESC);
  CREATE INDEX IF NOT EXISTS training_events_code_idx ON training_events(client_id, handle, code, created_at DESC);
  CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    client_id TEXT NOT NULL,
    category TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    message TEXT NOT NULL,
    page TEXT NOT NULL DEFAULT '/',
    status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'reviewed', 'planned', 'done')),
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS feedback_created_idx ON feedback(created_at DESC);
`);

class AuthError extends HttpError {}

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const now = () => Date.now();

function normalizeEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) throw new AuthError(400, "请输入有效邮箱地址");
  return email;
}

function validatePassword(value) {
  const password = String(value || "");
  if (password.length < 10 || password.length > 128 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/\d/.test(password)) throw new AuthError(400, "密码需为 10–128 位，并包含大小写字母和数字");
  return password;
}

function passwordRecord(password) {
  const salt = randomBytes(16).toString("hex");
  return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

function passwordMatches(password, salt, expectedHex) {
  try {
    const actual = scryptSync(String(password || ""), String(salt || ""), 64);
    const expected = Buffer.from(String(expectedHex || ""), "hex");
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

const DUMMY_PASSWORD = passwordRecord(randomBytes(24).toString("base64url"));

function publicUser(user) {
  return { id: Number(user.id), email: user.email, role: user.role, mustChangePassword: Boolean(user.must_change_password), createdAt: new Date(user.created_at).toISOString() };
}

function createSession(user) {
  const token = randomBytes(32).toString("base64url");
  const createdAt = now();
  db.prepare("DELETE FROM sessions WHERE expires_at <= ?").run(createdAt);
  db.prepare("INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)").run(sha256(token), user.id, createdAt + SESSION_TTL, createdAt);
  db.prepare("DELETE FROM sessions WHERE user_id = ? AND id NOT IN (SELECT id FROM sessions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10)").run(user.id, user.id);
  return { token, expiresAt: new Date(createdAt + SESSION_TTL).toISOString(), user: publicUser(user) };
}

function bearerToken(request) {
  const header = String(request.headers.authorization || "");
  return header.startsWith("Bearer ") ? header.slice(7).trim() : "";
}

export function authenticateRequest(request) {
  const token = bearerToken(request);
  if (!token) throw new AuthError(401, "请先登录");
  const user = db.prepare(`SELECT users.* FROM sessions JOIN users ON users.id = sessions.user_id WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(sha256(token), now());
  if (!user) throw new AuthError(401, "登录已过期，请重新登录");
  return user;
}

function requireAdmin(request) {
  const user = authenticateRequest(request);
  if (user.role !== "admin") throw new AuthError(403, "仅管理员可访问");
  if (user.must_change_password) throw new AuthError(403, "请先在账号中心修改初始密码");
  return user;
}

function optionalUser(request) {
  if (!bearerToken(request)) return null;
  try { return authenticateRequest(request); } catch { return null; }
}

function normalizeClientId(value) {
  const clientId = String(value || "").trim();
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(clientId)) throw new AuthError(400, "训练设备标识无效");
  return clientId;
}

function normalizeHandle(value) {
  const handle = String(value || "ShallowDream2").trim();
  if (!/^[A-Za-z0-9_.-]{3,24}$/.test(handle)) throw new AuthError(400, "Codeforces Handle 无效");
  return handle;
}

function normalizeProblemCode(value) {
  const code = String(value || "").replace(/^CF\s*/i, "").toUpperCase().trim();
  if (!/^\d{1,7}[A-Z][0-9]?$/.test(code)) throw new AuthError(400, "题号格式无效");
  return code;
}

function publicTrainingEvent(item) {
  return {
    id: Number(item.id),
    code: `CF ${item.code}`,
    outcome: item.outcome,
    durationMinutes: Number(item.duration_minutes),
    hintLevel: Number(item.hint_level),
    difficulty: item.difficulty,
    reflection: item.reflection,
    createdAt: new Date(item.created_at).toISOString(),
  };
}

function latestTrainingRows(clientId, handle, limit = 500) {
  const rows = db.prepare("SELECT * FROM training_events WHERE client_id = ? AND lower(handle) = lower(?) ORDER BY created_at DESC LIMIT ?").all(clientId, handle, limit);
  const seen = new Set();
  return rows.filter((item) => {
    if (seen.has(item.code)) return false;
    seen.add(item.code);
    return true;
  });
}

function reviewDelay(outcome, difficulty) {
  if (outcome === "unsolved") return 24 * 60 * 60 * 1000;
  if (outcome === "editorial") return 3 * 24 * 60 * 60 * 1000;
  if (outcome === "hinted") return 7 * 24 * 60 * 60 * 1000;
  return difficulty === "hard" ? 14 * 24 * 60 * 60 * 1000 : 30 * 24 * 60 * 60 * 1000;
}

export function getTrainingSignals(clientIdValue, handleValue) {
  if (!clientIdValue) return { completedCodes: new Set(), unsolvedCodes: new Set(), dueCodes: new Set(), latestByCode: new Map(), stats: { total: 0, independent: 0, hinted: 0, editorial: 0, unsolved: 0 } };
  let clientId;
  let handle;
  try { clientId = normalizeClientId(clientIdValue); handle = normalizeHandle(handleValue); }
  catch { return { completedCodes: new Set(), unsolvedCodes: new Set(), dueCodes: new Set(), latestByCode: new Map(), stats: { total: 0, independent: 0, hinted: 0, editorial: 0, unsolved: 0 } }; }
  const rows = latestTrainingRows(clientId, handle);
  const completedCodes = new Set();
  const unsolvedCodes = new Set();
  const dueCodes = new Set();
  const latestByCode = new Map();
  const stats = { total: rows.length, independent: 0, hinted: 0, editorial: 0, unsolved: 0 };
  for (const item of rows) {
    latestByCode.set(item.code, item);
    stats[item.outcome] += 1;
    if (item.outcome === "unsolved") unsolvedCodes.add(item.code); else completedCodes.add(item.code);
    if (item.created_at + reviewDelay(item.outcome, item.difficulty) <= now()) dueCodes.add(item.code);
  }
  return { completedCodes, unsolvedCodes, dueCodes, latestByCode, stats };
}

function checkLoginLimit(ip, email) {
  const ipResult = loginIpLimiter(ip);
  if (!ipResult.allowed) throw new AuthError(429, `登录尝试过多，请 ${Math.ceil(ipResult.retryAfterSeconds / 60)} 分钟后重试`);
  const key = `${ip}:${email}`;
  const result = loginLimiter(key);
  if (!result.allowed) throw new AuthError(429, `登录尝试过多，请 ${Math.ceil(result.retryAfterSeconds / 60)} 分钟后重试`);
}

function clearLoginLimit(ip, email) { loginLimiter.reset(`${ip}:${email}`); }

function inviteCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  const chunk = (offset) => Array.from(bytes.subarray(offset, offset + 4), (value) => alphabet[value % alphabet.length]).join("");
  return `ICPC-${chunk(0)}-${chunk(4)}-${chunk(8)}`;
}

function bootstrapAdmin() {
  const configuredEmail = String(process.env.ADMIN_EMAIL || "").trim();
  const configuredPassword = String(process.env.ADMIN_PASSWORD || "");
  if (!configuredEmail || !configuredPassword) return;
  const existing = db.prepare("SELECT id FROM users WHERE role = 'admin' LIMIT 1").get();
  if (existing) return;
  const email = normalizeEmail(configuredEmail);
  const password = validatePassword(configuredPassword);
  const record = passwordRecord(password);
  db.prepare("INSERT INTO users (email, password_hash, password_salt, role, must_change_password, created_at) VALUES (?, ?, ?, 'admin', 1, ?)").run(email, record.hash, record.salt, now());
  console.log("bootstrap admin created");
}

bootstrapAdmin();

export function createAuthHandler({ json, readBody, clientIp }) {
  return async function handleAuth(request, response, url) {
    if (!url.pathname.startsWith("/auth/") && !url.pathname.startsWith("/admin/") && !url.pathname.startsWith("/training/") && url.pathname !== "/feedback") return false;
    try {
      if (request.method === "POST" && url.pathname === "/auth/register") {
        const registrationRate = registrationLimiter(clientIp(request));
        if (!registrationRate.allowed) throw new AuthError(429, `注册尝试过多，请 ${Math.ceil(registrationRate.retryAfterSeconds / 60)} 分钟后重试`);
        const body = await readBody(request);
        const email = normalizeEmail(body.email);
        const password = validatePassword(body.password);
        const code = String(body.inviteCode || "").trim().toUpperCase();
        if (!code) throw new AuthError(400, "请输入管理员提供的邀请码");
        const invite = db.prepare("SELECT * FROM invites WHERE code_hash = ?").get(sha256(code));
        if (!invite || invite.expires_at <= now() || invite.used_count >= invite.max_uses) throw new AuthError(400, "邀请码无效、已过期或已用完");
        if (db.prepare("SELECT id FROM users WHERE email = ?").get(email)) throw new AuthError(409, "该邮箱已注册");
        const record = passwordRecord(password);
        let userId;
        db.exec("BEGIN IMMEDIATE");
        try {
          const freshInvite = db.prepare("SELECT * FROM invites WHERE id = ?").get(invite.id);
          if (!freshInvite || freshInvite.expires_at <= now() || freshInvite.used_count >= freshInvite.max_uses) throw new AuthError(400, "邀请码已用完");
          const result = db.prepare("INSERT INTO users (email, password_hash, password_salt, role, created_at) VALUES (?, ?, ?, 'user', ?)").run(email, record.hash, record.salt, now());
          userId = result.lastInsertRowid;
          db.prepare("UPDATE invites SET used_count = used_count + 1 WHERE id = ?").run(invite.id);
          db.exec("COMMIT");
        } catch (error) {
          db.exec("ROLLBACK");
          throw error;
        }
        const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
        json(response, 201, createSession(user));
        return true;
      }

      if (request.method === "POST" && url.pathname === "/auth/login") {
        const body = await readBody(request);
        const email = normalizeEmail(body.email);
        checkLoginLimit(clientIp(request), email);
        const user = db.prepare("SELECT * FROM users WHERE email = ?").get(email);
        const validPassword = user
          ? passwordMatches(body.password, user.password_salt, user.password_hash)
          : passwordMatches(body.password, DUMMY_PASSWORD.salt, DUMMY_PASSWORD.hash);
        if (!user || !validPassword) throw new AuthError(401, "邮箱或密码错误");
        clearLoginLimit(clientIp(request), email);
        json(response, 200, createSession(user));
        return true;
      }

      if (request.method === "GET" && url.pathname === "/auth/me") {
        json(response, 200, { user: publicUser(authenticateRequest(request)) });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/auth/logout") {
        const token = bearerToken(request);
        if (token) db.prepare("DELETE FROM sessions WHERE token_hash = ?").run(sha256(token));
        json(response, 200, { ok: true });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/auth/change-password") {
        const user = authenticateRequest(request);
        const body = await readBody(request);
        if (!passwordMatches(body.currentPassword, user.password_salt, user.password_hash)) throw new AuthError(400, "当前密码不正确");
        const newPassword = validatePassword(body.newPassword);
        if (passwordMatches(newPassword, user.password_salt, user.password_hash)) throw new AuthError(400, "新密码不能与当前密码相同");
        const record = passwordRecord(newPassword);
        db.prepare("UPDATE users SET password_hash = ?, password_salt = ?, must_change_password = 0 WHERE id = ?").run(record.hash, record.salt, user.id);
        db.prepare("DELETE FROM sessions WHERE user_id = ? AND token_hash != ?").run(user.id, sha256(bearerToken(request)));
        const updated = db.prepare("SELECT * FROM users WHERE id = ?").get(user.id);
        json(response, 200, { ok: true, user: publicUser(updated) });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/training/events") {
        const body = await readBody(request);
        const clientId = normalizeClientId(body.clientId);
        const handle = normalizeHandle(body.handle);
        const code = normalizeProblemCode(body.code);
        const outcome = String(body.outcome || "");
        const difficulty = ["easy", "right", "hard"].includes(body.difficulty) ? body.difficulty : "right";
        if (!["independent", "hinted", "editorial", "unsolved"].includes(outcome)) throw new AuthError(400, "训练结果无效");
        const durationMinutes = Math.max(0, Math.min(600, Math.round(Number(body.durationMinutes) || 0)));
        const hintLevel = Math.max(0, Math.min(4, Math.round(Number(body.hintLevel) || 0)));
        const reflection = String(body.reflection || "").trim().slice(0, 1000);
        const createdAt = now();
        const result = db.prepare("INSERT INTO training_events (client_id, handle, code, outcome, duration_minutes, hint_level, difficulty, reflection, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)").run(clientId, handle, code, outcome, durationMinutes, hintLevel, difficulty, reflection, createdAt);
        const event = db.prepare("SELECT * FROM training_events WHERE id = ?").get(result.lastInsertRowid);
        json(response, 201, { event: publicTrainingEvent(event) });
        return true;
      }

      if (request.method === "GET" && url.pathname === "/training/summary") {
        const clientId = normalizeClientId(url.searchParams.get("clientId"));
        const handle = normalizeHandle(url.searchParams.get("handle"));
        const rows = latestTrainingRows(clientId, handle);
        const signals = getTrainingSignals(clientId, handle);
        const dueReviews = rows.filter((item) => signals.dueCodes.has(item.code)).slice(0, 20).map(publicTrainingEvent);
        json(response, 200, { stats: signals.stats, dueReviews, recent: rows.slice(0, 12).map(publicTrainingEvent) });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/feedback") {
        const feedbackRate = feedbackLimiter(clientIp(request));
        if (!feedbackRate.allowed) throw new AuthError(429, "本小时反馈提交过多，请稍后再试");
        const body = await readBody(request);
        const clientId = normalizeClientId(body.clientId);
        const category = String(body.category || "体验建议").trim().slice(0, 40);
        const rating = Math.max(1, Math.min(5, Math.round(Number(body.rating) || 0)));
        const message = String(body.message || "").trim();
        const page = String(body.page || "/").trim().slice(0, 200);
        if (message.length < 8 || message.length > 2000) throw new AuthError(400, "建议请填写 8–2000 个字符");
        const user = optionalUser(request);
        const createdAt = now();
        const result = db.prepare("INSERT INTO feedback (user_id, client_id, category, rating, message, page, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)").run(user?.id || null, clientId, category, rating, message, page, createdAt);
        json(response, 201, { id: Number(result.lastInsertRowid), ok: true });
        return true;
      }

      if (request.method === "GET" && url.pathname === "/admin/users") {
        requireAdmin(request);
        const users = db.prepare("SELECT id, email, role, must_change_password, created_at FROM users ORDER BY created_at DESC LIMIT 500").all().map(publicUser);
        json(response, 200, { users });
        return true;
      }

      if (request.method === "GET" && url.pathname === "/admin/invites") {
        requireAdmin(request);
        const invites = db.prepare("SELECT id, code_prefix, max_uses, used_count, expires_at, created_at FROM invites ORDER BY created_at DESC LIMIT 200").all().map((item) => ({ id: Number(item.id), codePrefix: item.code_prefix, maxUses: item.max_uses, usedCount: item.used_count, expiresAt: new Date(item.expires_at).toISOString(), createdAt: new Date(item.created_at).toISOString(), status: item.expires_at <= now() ? "expired" : item.used_count >= item.max_uses ? "used" : "active" }));
        json(response, 200, { invites });
        return true;
      }

      if (request.method === "GET" && url.pathname === "/admin/feedback") {
        requireAdmin(request);
        const feedback = db.prepare("SELECT feedback.*, users.email FROM feedback LEFT JOIN users ON users.id = feedback.user_id ORDER BY feedback.created_at DESC LIMIT 300").all().map((item) => ({ id: Number(item.id), email: item.email || null, category: item.category, rating: Number(item.rating), message: item.message, page: item.page, status: item.status, createdAt: new Date(item.created_at).toISOString() }));
        json(response, 200, { feedback });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/admin/invites") {
        const admin = requireAdmin(request);
        const body = await readBody(request);
        const maxUses = boundedInteger(body.maxUses, { min: 1, max: 100, fallback: 1 });
        const expiresInDays = boundedInteger(body.expiresInDays, { min: 1, max: 365, fallback: 7 });
        const code = inviteCode();
        const createdAt = now();
        const expiresAt = createdAt + expiresInDays * 24 * 60 * 60 * 1000;
        const result = db.prepare("INSERT INTO invites (code_hash, code_prefix, created_by, max_uses, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(sha256(code), code.slice(0, 10), admin.id, maxUses, expiresAt, createdAt);
        json(response, 201, { invite: { id: Number(result.lastInsertRowid), code, maxUses, usedCount: 0, expiresAt: new Date(expiresAt).toISOString(), createdAt: new Date(createdAt).toISOString(), status: "active" } });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/admin/invites/revoke") {
        requireAdmin(request);
        const body = await readBody(request);
        const id = boundedInteger(body.id, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
        if (!id) throw new AuthError(400, "邀请码记录无效");
        const result = db.prepare("UPDATE invites SET expires_at = ? WHERE id = ? AND expires_at > ? AND used_count < max_uses").run(now(), id, now());
        if (!result.changes) throw new AuthError(404, "邀请码不存在或已经失效");
        json(response, 200, { ok: true });
        return true;
      }

      if (request.method === "POST" && url.pathname === "/admin/feedback/status") {
        requireAdmin(request);
        const body = await readBody(request);
        const id = boundedInteger(body.id, { min: 1, max: Number.MAX_SAFE_INTEGER, fallback: 0 });
        const status = String(body.status || "");
        if (!id || !["new", "reviewed", "planned", "done"].includes(status)) throw new AuthError(400, "反馈状态无效");
        const result = db.prepare("UPDATE feedback SET status = ? WHERE id = ?").run(status, id);
        if (!result.changes) throw new AuthError(404, "反馈不存在");
        json(response, 200, { ok: true });
        return true;
      }

      json(response, 404, { error: "Not found" });
    } catch (error) {
      const exposed = publicError(error, "账号服务暂时不可用");
      const status = exposed.status;
      if (status === 500) console.error(new Date().toISOString(), request.method, url.pathname, error);
      json(response, status, { error: exposed.message });
    }
    return true;
  };
}
