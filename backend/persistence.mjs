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
    (SELECT COUNT(*) FROM vp_sessions WHERE status IN ('ready', 'running')) AS active_vps,
    (SELECT COUNT(*) FROM vp_standing_snapshots) AS vp_snapshots`).get();
  return { personalStates: Number(row.personal_states), activeVps: Number(row.active_vps), vpSnapshots: Number(row.vp_snapshots) };
}

export function closePersistenceForTests() {
  if (process.env.NODE_ENV === "test") db.close();
}
