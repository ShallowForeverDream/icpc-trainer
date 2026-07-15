import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { gzipSync, gunzipSync } from "node:zlib";

const DB_PATH = process.env.DB_PATH || "/data/icpc-trainer.sqlite";
const PERSONAL_STATE_LIMIT = 2 * 1024 * 1024;
const VP_SESSION_TTL = 30 * 24 * 60 * 60_000;

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;

  CREATE TABLE IF NOT EXISTS runtime_cache (
    namespace TEXT NOT NULL,
    cache_key TEXT NOT NULL,
    payload BLOB NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 0,
    fetched_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL,
    stale_until INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (namespace, cache_key)
  );
  CREATE INDEX IF NOT EXISTS runtime_cache_expiry_idx ON runtime_cache(namespace, stale_until);

  CREATE TABLE IF NOT EXISTS personal_state (
    owner_key TEXT NOT NULL,
    state_key TEXT NOT NULL,
    payload BLOB NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (owner_key, state_key)
  );
  CREATE INDEX IF NOT EXISTS personal_state_updated_idx ON personal_state(updated_at);

  CREATE TABLE IF NOT EXISTS platform_submissions (
    owner_key TEXT NOT NULL,
    request_id TEXT NOT NULL,
    judge TEXT NOT NULL CHECK (judge IN ('codeforces', 'ucup', 'luogu')),
    problem_code TEXT NOT NULL,
    problem_title TEXT NOT NULL,
    problem_href TEXT NOT NULL,
    contest_id INTEGER NOT NULL,
    problem_index TEXT NOT NULL,
    language TEXT NOT NULL,
    source_payload BLOB,
    source_bytes INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('queued', 'submitted', 'accepted', 'rejected', 'failed', 'needs_login')),
    verdict TEXT,
    message TEXT NOT NULL,
    judge_submission_id INTEGER,
    archive_contest_id TEXT,
    slot TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    PRIMARY KEY (owner_key, request_id)
  );
  CREATE INDEX IF NOT EXISTS platform_submissions_owner_updated_idx ON platform_submissions(owner_key, updated_at DESC);
  CREATE INDEX IF NOT EXISTS platform_submissions_problem_idx ON platform_submissions(owner_key, problem_code, updated_at DESC);

  CREATE TABLE IF NOT EXISTS vp_sessions (
    id TEXT PRIMARY KEY,
    owner_key TEXT NOT NULL,
    primary_handle TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ready' CHECK (status IN ('ready', 'running', 'finished')),
    payload BLOB NOT NULL,
    started_at INTEGER,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS vp_sessions_owner_idx ON vp_sessions(owner_key, status, updated_at DESC);
  CREATE INDEX IF NOT EXISTS vp_sessions_expiry_idx ON vp_sessions(expires_at);

  CREATE TABLE IF NOT EXISTS vp_standing_snapshots (
    cache_key TEXT PRIMARY KEY,
    session_id TEXT,
    elapsed_bucket INTEGER NOT NULL,
    payload BLOB NOT NULL,
    generated_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS vp_standing_snapshots_session_idx ON vp_standing_snapshots(session_id, updated_at DESC);
`);

const platformSubmissionSchema = String(db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'platform_submissions'").get()?.sql || "");
if (platformSubmissionSchema && !platformSubmissionSchema.includes("'luogu'")) {
  db.exec(`
    BEGIN IMMEDIATE;
    DROP INDEX IF EXISTS platform_submissions_owner_updated_idx;
    DROP INDEX IF EXISTS platform_submissions_problem_idx;
    ALTER TABLE platform_submissions RENAME TO platform_submissions_legacy;
    CREATE TABLE platform_submissions (
      owner_key TEXT NOT NULL,
      request_id TEXT NOT NULL,
      judge TEXT NOT NULL CHECK (judge IN ('codeforces', 'ucup', 'luogu')),
      problem_code TEXT NOT NULL,
      problem_title TEXT NOT NULL,
      problem_href TEXT NOT NULL,
      contest_id INTEGER NOT NULL,
      problem_index TEXT NOT NULL,
      language TEXT NOT NULL,
      source_payload BLOB,
      source_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('queued', 'submitted', 'accepted', 'rejected', 'failed', 'needs_login')),
      verdict TEXT,
      message TEXT NOT NULL,
      judge_submission_id INTEGER,
      archive_contest_id TEXT,
      slot TEXT,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_key, request_id)
    );
    INSERT INTO platform_submissions SELECT * FROM platform_submissions_legacy;
    DROP TABLE platform_submissions_legacy;
    CREATE INDEX platform_submissions_owner_updated_idx ON platform_submissions(owner_key, updated_at DESC);
    CREATE INDEX platform_submissions_problem_idx ON platform_submissions(owner_key, problem_code, updated_at DESC);
    COMMIT;
  `);
}

function encode(value, maxBytes = 64 * 1024 * 1024) {
  const source = JSON.stringify(value);
  if (Buffer.byteLength(source) > maxBytes) throw new Error("持久化数据超过大小限制");
  return gzipSync(source, { level: 6 });
}

function decode(payload) {
  return JSON.parse(gunzipSync(Buffer.from(payload)).toString("utf8"));
}

function decodeRow(table, where, params, row) {
  if (!row) return null;
  try { return { ...row, value: decode(row.payload) }; }
  catch {
    db.prepare(`DELETE FROM ${table} WHERE ${where}`).run(...params);
    return null;
  }
}

export function readRuntimeCache(namespace, cacheKey) {
  const row = db.prepare("SELECT payload, item_count, fetched_at, expires_at, stale_until FROM runtime_cache WHERE namespace = ? AND cache_key = ?").get(namespace, cacheKey);
  const decoded = decodeRow("runtime_cache", "namespace = ? AND cache_key = ?", [namespace, cacheKey], row);
  return decoded ? {
    value: decoded.value,
    itemCount: Number(decoded.item_count),
    fetchedAt: Number(decoded.fetched_at),
    expiresAt: Number(decoded.expires_at),
    staleUntil: Number(decoded.stale_until),
  } : null;
}

export function writeRuntimeCache(namespace, cacheKey, value, { itemCount = 0, fetchedAt = Date.now(), expiresAt, staleUntil, maxEntries = 512 } = {}) {
  const now = Date.now();
  const validExpiresAt = Number(expiresAt) || now;
  const validStaleUntil = Math.max(validExpiresAt, Number(staleUntil) || validExpiresAt);
  db.prepare(`INSERT INTO runtime_cache (namespace, cache_key, payload, item_count, fetched_at, expires_at, stale_until, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(namespace, cache_key) DO UPDATE SET payload = excluded.payload, item_count = excluded.item_count,
      fetched_at = excluded.fetched_at, expires_at = excluded.expires_at, stale_until = excluded.stale_until, updated_at = excluded.updated_at`)
    .run(namespace, cacheKey, encode(value), Math.max(0, Number(itemCount) || 0), fetchedAt, validExpiresAt, validStaleUntil, now);
  db.prepare("DELETE FROM runtime_cache WHERE namespace = ? AND stale_until <= ?").run(namespace, now);
  db.prepare(`DELETE FROM runtime_cache WHERE namespace = ? AND cache_key IN (
    SELECT cache_key FROM runtime_cache WHERE namespace = ? ORDER BY updated_at DESC LIMIT -1 OFFSET ?
  )`).run(namespace, namespace, Math.max(1, maxEntries));
}

export function runtimeCacheStats() {
  return Object.fromEntries(db.prepare("SELECT namespace, COUNT(*) AS count FROM runtime_cache GROUP BY namespace").all().map((row) => [row.namespace, Number(row.count)]));
}

export function normalizeClientId(value, { required = true } = {}) {
  const clientId = String(value || "").trim();
  if (!clientId && !required) return "";
  if (!/^[A-Za-z0-9_-]{12,80}$/.test(clientId)) throw new Error("训练设备标识无效");
  return clientId;
}

export function ownerKeys(user, clientIdValue, { allowGuest = false } = {}) {
  const clientId = normalizeClientId(clientIdValue, { required: !user && !allowGuest });
  if (user) return { primary: `user:${user.id}`, fallback: clientId ? `device:${clientId}` : null };
  if (clientId) return { primary: `device:${clientId}`, fallback: null };
  return { primary: "guest:legacy", fallback: null };
}

export function readPersonalState(owners, stateKey) {
  for (const owner of [owners.primary, owners.fallback].filter(Boolean)) {
    const row = db.prepare("SELECT payload, updated_at FROM personal_state WHERE owner_key = ? AND state_key = ?").get(owner, stateKey);
    const decoded = decodeRow("personal_state", "owner_key = ? AND state_key = ?", [owner, stateKey], row);
    if (!decoded) continue;
    if (owner !== owners.primary) writePersonalState(owners.primary, stateKey, decoded.value);
    return { exists: true, value: decoded.value, updatedAt: new Date(Number(decoded.updated_at)).toISOString() };
  }
  return { exists: false, value: null, updatedAt: null };
}

export function writePersonalState(ownerKey, stateKey, value) {
  const now = Date.now();
  if (value === null) {
    db.prepare("DELETE FROM personal_state WHERE owner_key = ? AND state_key = ?").run(ownerKey, stateKey);
    return;
  }
  db.prepare(`INSERT INTO personal_state (owner_key, state_key, payload, updated_at) VALUES (?, ?, ?, ?)
    ON CONFLICT(owner_key, state_key) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at`)
    .run(ownerKey, stateKey, encode(value, PERSONAL_STATE_LIMIT), now);
}

function publicPlatformSubmission(row, { includeSource = false } = {}) {
  if (!row) return null;
  let sourceCode;
  if (includeSource && row.source_payload) {
    try { sourceCode = decode(row.source_payload); }
    catch { sourceCode = ""; }
  }
  return {
    requestId: row.request_id,
    judge: row.judge,
    problemCode: row.problem_code,
    problemTitle: row.problem_title,
    problemHref: row.problem_href,
    contestId: Number(row.contest_id),
    problemIndex: row.problem_index,
    language: row.language,
    status: row.status,
    verdict: row.verdict || null,
    message: row.message,
    judgeSubmissionId: row.judge_submission_id === null ? null : Number(row.judge_submission_id),
    archiveContestId: row.archive_contest_id || null,
    slot: row.slot || null,
    sourceBytes: Number(row.source_bytes) || 0,
    ...(includeSource ? { sourceCode: typeof sourceCode === "string" ? sourceCode : "" } : {}),
    createdAt: new Date(Number(row.created_at)).toISOString(),
    updatedAt: new Date(Number(row.updated_at)).toISOString(),
  };
}

function copyPlatformSubmission(row, ownerKey) {
  db.prepare(`INSERT OR IGNORE INTO platform_submissions (
    owner_key, request_id, judge, problem_code, problem_title, problem_href, contest_id, problem_index,
    language, source_payload, source_bytes, status, verdict, message, judge_submission_id,
    archive_contest_id, slot, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(ownerKey, row.request_id, row.judge, row.problem_code, row.problem_title, row.problem_href,
      row.contest_id, row.problem_index, row.language, row.source_payload, row.source_bytes, row.status,
      row.verdict, row.message, row.judge_submission_id, row.archive_contest_id, row.slot, row.created_at, row.updated_at);
}

export function createPlatformSubmission(ownerKey, submission) {
  const now = Date.now();
  const sourceCode = String(submission.sourceCode || "");
  db.prepare(`INSERT INTO platform_submissions (
    owner_key, request_id, judge, problem_code, problem_title, problem_href, contest_id, problem_index,
    language, source_payload, source_bytes, status, verdict, message, judge_submission_id,
    archive_contest_id, slot, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?, ?, ?, ?)
  ON CONFLICT(owner_key, request_id) DO UPDATE SET
    problem_title = excluded.problem_title, problem_href = excluded.problem_href, language = excluded.language,
    source_payload = COALESCE(excluded.source_payload, platform_submissions.source_payload),
    source_bytes = MAX(excluded.source_bytes, platform_submissions.source_bytes), updated_at = excluded.updated_at`)
    .run(ownerKey, submission.requestId, submission.judge, submission.problemCode, submission.problemTitle,
      submission.problemHref, submission.contestId, submission.problemIndex, submission.language,
      sourceCode ? encode(sourceCode, 512 * 1024) : null, Buffer.byteLength(sourceCode), submission.status,
      submission.message, submission.archiveContestId || null, submission.slot || null, now, now);
  db.prepare(`DELETE FROM platform_submissions WHERE owner_key = ? AND request_id IN (
    SELECT request_id FROM platform_submissions WHERE owner_key = ? ORDER BY created_at DESC LIMIT -1 OFFSET 250
  )`).run(ownerKey, ownerKey);
  return readPlatformSubmission({ primary: ownerKey, fallback: null }, submission.requestId, { includeSource: true });
}

export function updatePlatformSubmissionStatus(ownerKey, requestId, update) {
  const row = db.prepare("SELECT status FROM platform_submissions WHERE owner_key = ? AND request_id = ?").get(ownerKey, requestId);
  if (!row) return null;
  const terminal = new Set(["accepted", "rejected", "failed", "needs_login"]);
  if ((terminal.has(row.status) && !terminal.has(update.status)) || (row.status === "submitted" && update.status === "queued")) {
    return readPlatformSubmission({ primary: ownerKey, fallback: null }, requestId);
  }
  db.prepare(`UPDATE platform_submissions SET status = ?, message = ?,
    verdict = COALESCE(?, verdict), judge_submission_id = COALESCE(?, judge_submission_id), updated_at = ?
    WHERE owner_key = ? AND request_id = ?`)
    .run(update.status, update.message, update.verdict || null, update.judgeSubmissionId || null, Date.now(), ownerKey, requestId);
  return readPlatformSubmission({ primary: ownerKey, fallback: null }, requestId);
}

export function listPlatformSubmissions(owners, { limit = 100, problemCode = "" } = {}) {
  const requestedLimit = Math.max(1, Math.min(250, Number(limit) || 100));
  if (owners.fallback && owners.fallback !== owners.primary) {
    const fallbackRows = db.prepare("SELECT * FROM platform_submissions WHERE owner_key = ? ORDER BY created_at ASC").all(owners.fallback);
    for (const row of fallbackRows) copyPlatformSubmission(row, owners.primary);
  }
  const rows = problemCode
    ? db.prepare("SELECT * FROM platform_submissions WHERE owner_key = ? AND problem_code = ? ORDER BY created_at DESC LIMIT ?").all(owners.primary, problemCode, requestedLimit)
    : db.prepare("SELECT * FROM platform_submissions WHERE owner_key = ? ORDER BY created_at DESC LIMIT ?").all(owners.primary, requestedLimit);
  return rows.map((row) => publicPlatformSubmission(row));
}

export function readPlatformSubmission(owners, requestId, options = {}) {
  let row = db.prepare("SELECT * FROM platform_submissions WHERE owner_key = ? AND request_id = ?").get(owners.primary, requestId);
  if (!row && owners.fallback) {
    row = db.prepare("SELECT * FROM platform_submissions WHERE owner_key = ? AND request_id = ?").get(owners.fallback, requestId);
    if (row) {
      copyPlatformSubmission(row, owners.primary);
      row = db.prepare("SELECT * FROM platform_submissions WHERE owner_key = ? AND request_id = ?").get(owners.primary, requestId);
    }
  }
  return publicPlatformSubmission(row, options);
}

export function persistVpSession(ownerKey, session) {
  const now = Date.now();
  const startedAt = Number(session.startedAt) || null;
  const status = startedAt ? "running" : "ready";
  db.prepare(`INSERT INTO vp_sessions (id, owner_key, primary_handle, status, payload, started_at, created_at, updated_at, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET owner_key = excluded.owner_key, primary_handle = excluded.primary_handle,
      status = excluded.status, payload = excluded.payload, started_at = excluded.started_at,
      updated_at = excluded.updated_at, expires_at = excluded.expires_at`)
    .run(session.id, ownerKey, session.handle, status, encode(session), startedAt, now, now, now + VP_SESSION_TTL);
  pruneVpData(now);
  return session;
}

function sessionRow(id, ownerKey) {
  return db.prepare("SELECT * FROM vp_sessions WHERE id = ? AND owner_key = ? AND expires_at > ?").get(id, ownerKey, Date.now());
}

function publicSession(row) {
  if (!row) return null;
  const decoded = decodeRow("vp_sessions", "id = ?", [row.id], row);
  if (!decoded) return null;
  const session = decoded.value;
  if (row.started_at) session.startedAt = Number(row.started_at);
  const snapshot = db.prepare("SELECT payload FROM vp_standing_snapshots WHERE session_id = ? ORDER BY updated_at DESC LIMIT 1").get(row.id);
  if (snapshot) {
    try { session.standings = decode(snapshot.payload); } catch { /* A broken snapshot is ignored. */ }
  }
  return session;
}

export function readActiveVpSession(ownerKey) {
  const row = db.prepare("SELECT * FROM vp_sessions WHERE owner_key = ? AND status IN ('ready', 'running') AND expires_at > ? ORDER BY updated_at DESC LIMIT 1").get(ownerKey, Date.now());
  return publicSession(row);
}

export function readVpSession(id, ownerKey) {
  return publicSession(sessionRow(id, ownerKey));
}

export function startVpSession(id, ownerKey, startedAt = Date.now()) {
  const row = sessionRow(id, ownerKey);
  if (!row) return null;
  const session = publicSession(row);
  const value = Math.max(Number(row.created_at), Math.min(Date.now() + 60_000, Number(startedAt) || Date.now()));
  session.startedAt = value;
  db.prepare("UPDATE vp_sessions SET status = 'running', started_at = ?, payload = ?, updated_at = ?, expires_at = ? WHERE id = ? AND owner_key = ?")
    .run(value, encode(session), Date.now(), Date.now() + VP_SESSION_TTL, id, ownerKey);
  return session;
}

export function finishVpSession(id, ownerKey) {
  const result = db.prepare("UPDATE vp_sessions SET status = 'finished', updated_at = ? WHERE id = ? AND owner_key = ?").run(Date.now(), id, ownerKey);
  return Boolean(result.changes);
}

export function standingSnapshotKey(body) {
  const normalized = {
    participants: [...(body.participants || [])].map((item) => String(item).toLowerCase()).sort(),
    startedAt: Number(body.startedAt),
    durationMinutes: Number(body.durationMinutes),
    problems: [...(body.problems || [])].map((item) => `${Number(item.contestId)}${String(item.index)}:${String(item.slot || "")}`).sort(),
  };
  return `vp-board:${createHash("sha256").update(JSON.stringify(normalized)).digest("hex")}`;
}

export function readVpSnapshot(cacheKey, elapsedBucket) {
  const row = db.prepare("SELECT payload, elapsed_bucket, generated_at FROM vp_standing_snapshots WHERE cache_key = ?").get(cacheKey);
  if (!row || Number(row.elapsed_bucket) !== Number(elapsedBucket)) return null;
  const decoded = decodeRow("vp_standing_snapshots", "cache_key = ?", [cacheKey], row);
  return decoded ? { value: decoded.value, generatedAt: Number(decoded.generated_at) } : null;
}

export function writeVpSnapshot(cacheKey, sessionId, elapsedBucket, value) {
  const now = Date.now();
  db.prepare(`INSERT INTO vp_standing_snapshots (cache_key, session_id, elapsed_bucket, payload, generated_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(cache_key) DO UPDATE SET session_id = excluded.session_id, elapsed_bucket = excluded.elapsed_bucket,
      payload = excluded.payload, generated_at = excluded.generated_at, updated_at = excluded.updated_at`)
    .run(cacheKey, sessionId || null, elapsedBucket, encode(value), now, now);
  db.prepare("DELETE FROM vp_standing_snapshots WHERE updated_at < ?").run(now - VP_SESSION_TTL);
  db.prepare("DELETE FROM vp_standing_snapshots WHERE cache_key IN (SELECT cache_key FROM vp_standing_snapshots ORDER BY updated_at DESC LIMIT -1 OFFSET 1000)").run();
}

function pruneVpData(now = Date.now()) {
  db.prepare("DELETE FROM vp_sessions WHERE expires_at <= ?").run(now);
  db.prepare("DELETE FROM vp_standing_snapshots WHERE session_id IS NOT NULL AND session_id NOT IN (SELECT id FROM vp_sessions)").run();
}

export function persistenceStats() {
  const row = db.prepare(`SELECT
    (SELECT COUNT(*) FROM personal_state) AS personal_states,
    (SELECT COUNT(*) FROM platform_submissions) AS platform_submissions,
    (SELECT COUNT(*) FROM vp_sessions WHERE status IN ('ready', 'running')) AS active_vps,
    (SELECT COUNT(*) FROM vp_standing_snapshots) AS vp_snapshots`).get();
  return { personalStates: Number(row.personal_states), platformSubmissions: Number(row.platform_submissions), activeVps: Number(row.active_vps), vpSnapshots: Number(row.vp_snapshots) };
}

export function closePersistenceForTests() {
  if (process.env.NODE_ENV === "test") db.close();
}
