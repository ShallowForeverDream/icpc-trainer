import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { load } from "cheerio";
import { parseArchiveStatementHtml } from "./archive-html-parser.mjs";
import { assessOfficialChineseArchive, chineseSectionTitle, parseArchivePdfText } from "./archive-pdf-parser.mjs";
import { authenticateRequest } from "./auth.mjs";
import { HttpError, createWindowLimiter, pruneMap, publicError, readJsonBody } from "./http-utils.mjs";
import { datasetRowToStatement, normalizeStatementCode, parseCodeforcesStatement, sanitizeStatementHtml } from "./statement-parser.mjs";

const execFileAsync = promisify(execFile);
const DB_PATH = process.env.DB_PATH || "/data/icpc-trainer.sqlite";
const TRANSLATOR_BASE_URL = String(process.env.TRANSLATOR_BASE_URL || process.env.OLLAMA_BASE_URL || "").replace(/\/$/, "");
const TRANSLATOR_MODEL = process.env.TRANSLATOR_MODEL || "qwen2.5-1.5b-instruct";
const TRANSLATION_VERSION = 22;
const ARCHIVE_TRANSLATION_VERSION = 3;
const FAST_TRANSLATOR_AUTH_URL = "https://edge.microsoft.com/translate/auth";
const FAST_TRANSLATOR_URL = "https://api-edge.cognitive.microsofttranslator.com/translate?api-version=3.0&from=en&to=zh-Hans";
const USER_AGENT = "icpc-trainer-statement-importer/0.4 (+https://icpc-trainer-shallowdream.safe-chime-4451.chatgpt.site)";
const importJobs = new Map();
const archiveImportJobs = new Map();
const archiveOfficialChineseJobs = new Map();
const recentArchiveOfficialChineseAttempts = new Map();
const recentTranslationAttempts = new Map();
const recentArchiveTranslationAttempts = new Map();
const queuedTranslations = new Set();
const queuedArchiveTranslations = new Set();
const ARCHIVE_PREWARM_CONCURRENCY = 3;
const ARCHIVE_PREWARM_PAUSED = process.env.ARCHIVE_PREWARM_PAUSED === "1";
const importLimiter = createWindowLimiter({ windowMs: 60 * 60_000, limit: 120, maxEntries: 2048 });
let translationQueue = Promise.resolve();
let archivePrewarmTimer = null;
let fastTranslatorToken = "";
let fastTranslatorTokenExpiresAt = 0;

mkdirSync(dirname(DB_PATH), { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  CREATE TABLE IF NOT EXISTS problem_statements (
    code TEXT PRIMARY KEY,
    contest_id INTEGER NOT NULL,
    problem_index TEXT NOT NULL,
    title TEXT,
    time_limit_text TEXT,
    memory_limit_text TEXT,
    source_url TEXT,
    source_kind TEXT,
    original_html TEXT,
    chinese_html TEXT,
    translation_version INTEGER NOT NULL DEFAULT 0,
    translation_reviewed INTEGER NOT NULL DEFAULT 0,
    reviewed_at INTEGER,
    reviewed_by TEXT,
    images_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'importing',
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS statement_assets (
    id TEXT PRIMARY KEY,
    code TEXT NOT NULL REFERENCES problem_statements(code) ON DELETE CASCADE,
    source_url TEXT NOT NULL,
    content_type TEXT NOT NULL,
    body BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS statement_assets_code_idx ON statement_assets(code);
  CREATE TABLE IF NOT EXISTS archive_statements (
    id TEXT PRIMARY KEY,
    contest_slug TEXT NOT NULL,
    slot TEXT NOT NULL,
    qoj_contest_id INTEGER NOT NULL,
    problem_id INTEGER NOT NULL,
    contest_name TEXT NOT NULL,
    title_en TEXT NOT NULL,
    title_zh TEXT,
    time_limit_text TEXT,
    memory_limit_text TEXT,
    source_url TEXT NOT NULL,
    chinese_source_url TEXT,
    original_json TEXT,
    chinese_json TEXT,
    translation_version INTEGER NOT NULL DEFAULT 0,
    translation_reviewed INTEGER NOT NULL DEFAULT 0,
    reviewed_at INTEGER,
    reviewed_by TEXT,
    images_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'importing',
    error TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL,
    UNIQUE(qoj_contest_id, problem_id)
  );
  CREATE TABLE IF NOT EXISTS archive_statement_assets (
    id TEXT PRIMARY KEY,
    statement_id TEXT NOT NULL REFERENCES archive_statements(id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    body BLOB NOT NULL,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS archive_statement_assets_statement_idx ON archive_statement_assets(statement_id);
  CREATE TABLE IF NOT EXISTS archive_statement_prewarm (
    statement_id TEXT PRIMARY KEY REFERENCES archive_statements(id) ON DELETE CASCADE,
    contest_slug TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    next_attempt_at INTEGER NOT NULL DEFAULT 0,
    requested_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS archive_statement_prewarm_contest_idx ON archive_statement_prewarm(contest_slug, requested_at);
`);
if (!db.prepare("PRAGMA table_info(problem_statements)").all().some((column) => column.name === "translation_version")) db.exec("ALTER TABLE problem_statements ADD COLUMN translation_version INTEGER NOT NULL DEFAULT 0");
if (!db.prepare("PRAGMA table_info(problem_statements)").all().some((column) => column.name === "translation_reviewed")) db.exec("ALTER TABLE problem_statements ADD COLUMN translation_reviewed INTEGER NOT NULL DEFAULT 0");
if (!db.prepare("PRAGMA table_info(problem_statements)").all().some((column) => column.name === "reviewed_at")) db.exec("ALTER TABLE problem_statements ADD COLUMN reviewed_at INTEGER");
if (!db.prepare("PRAGMA table_info(problem_statements)").all().some((column) => column.name === "reviewed_by")) db.exec("ALTER TABLE problem_statements ADD COLUMN reviewed_by TEXT");
if (!db.prepare("PRAGMA table_info(archive_statements)").all().some((column) => column.name === "chinese_source_url")) db.exec("ALTER TABLE archive_statements ADD COLUMN chinese_source_url TEXT");
if (!db.prepare("PRAGMA table_info(archive_statements)").all().some((column) => column.name === "translation_reviewed")) db.exec("ALTER TABLE archive_statements ADD COLUMN translation_reviewed INTEGER NOT NULL DEFAULT 0");
if (!db.prepare("PRAGMA table_info(archive_statements)").all().some((column) => column.name === "reviewed_at")) db.exec("ALTER TABLE archive_statements ADD COLUMN reviewed_at INTEGER");
if (!db.prepare("PRAGMA table_info(archive_statements)").all().some((column) => column.name === "reviewed_by")) db.exec("ALTER TABLE archive_statements ADD COLUMN reviewed_by TEXT");

const now = () => Date.now();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

function isCodeforcesUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && /(^|\.)codeforces\.(com|org)$/.test(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

async function fetchCodeforcesResource(value, options = {}, maxRedirects = 3) {
  let url = String(value);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (!isCodeforcesUrl(url)) throw new HttpError(400, "Codeforces 资源地址无效");
    const response = await fetch(url, { ...options, redirect: "manual" });
    if (![301, 302, 303, 307, 308].includes(response.status)) return response;
    const location = response.headers.get("location");
    if (!location || redirect === maxRedirects) throw new HttpError(502, "Codeforces 资源重定向异常");
    url = new URL(location, url).href;
  }
  throw new HttpError(502, "Codeforces 资源重定向过多");
}

async function readLimitedBuffer(response, maxBytes) {
  const declared = Number(response.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "远程资源大小超出限制");
  const chunks = [];
  let size = 0;
  if (!response.body) return Buffer.alloc(0);
  for await (const chunk of response.body) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBytes) throw new HttpError(413, "远程资源大小超出限制");
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

function statementRow(code) {
  return db.prepare("SELECT * FROM problem_statements WHERE code = ?").get(code);
}

function safeImages(value) {
  try {
    const parsed = JSON.parse(value || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function publicStatement(row) {
  if (!row) return null;
  const translationVersion = Number(row.translation_version || 0);
  return {
    code: row.code,
    contestId: Number(row.contest_id),
    index: row.problem_index,
    title: row.title || `Codeforces ${row.code}`,
    timeLimitText: row.time_limit_text || "",
    memoryLimitText: row.memory_limit_text || "",
    sourceUrl: row.source_url || `https://codeforces.com/problemset/problem/${row.contest_id}/${row.problem_index}`,
    sourceKind: row.source_kind || "pending",
    originalHtml: row.original_html || null,
    // Serve the last usable translation immediately while a newer terminology
    // pass is generated in the background (stale-while-revalidate).
    chineseHtml: row.chinese_html || null,
    translationVersion,
    translationCurrent: Boolean(row.chinese_html) && translationVersion >= TRANSLATION_VERSION,
    translationReviewed: Boolean(row.translation_reviewed),
    translationReviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    revalidating: Boolean(row.chinese_html) && translationVersion < TRANSLATION_VERSION,
    images: safeImages(row.images_json),
    status: row.status,
    message: row.error || null,
    cacheScope: "shared",
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function archiveStatementRow(id) {
  return db.prepare("SELECT * FROM archive_statements WHERE id = ?").get(id);
}

function safeObject(value, fallback) {
  try {
    const parsed = JSON.parse(value || "null");
    return parsed && typeof parsed === "object" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function normalizeArchiveMetadata(url) {
  const contestId = String(url.searchParams.get("contest") || "").trim().toLowerCase();
  const slot = String(url.searchParams.get("slot") || "").trim().toUpperCase();
  const qojContestId = Number(url.searchParams.get("qojContestId"));
  const problemId = Number(url.searchParams.get("problemId"));
  const gymIdValue = String(url.searchParams.get("gymId") || "").trim();
  const gymId = gymIdValue ? Number(gymIdValue) : null;
  const contestName = String(url.searchParams.get("contestName") || "ICPC Contest").trim().slice(0, 160);
  const title = String(url.searchParams.get("title") || `Problem ${slot}`).trim().slice(0, 180);
  if (!/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/.test(contestId)
    || !/^[A-Z][0-9]?$/.test(slot)
    || !Number.isInteger(qojContestId) || qojContestId < 1 || qojContestId > 10_000_000
    || !Number.isInteger(problemId) || problemId < 1 || problemId > 100_000_000
    || (gymId !== null && (!Number.isInteger(gymId) || gymId < 1 || gymId > 10_000_000))
    || !contestName || !title) throw new HttpError(400, "历届题目参数无效");
  const pdfUrl = `https://contest.ucup.ac/download.php?type=statement&id=${problemId}&contest_id=${qojContestId}`;
  const sourceUrl = gymId ? `https://codeforces.com/gym/${gymId}/problem/${slot}?locale=en` : pdfUrl;
  return {
    id: `${contestId}:${slot}`,
    contestId,
    slot,
    qojContestId,
    problemId,
    contestName,
    title,
    sourceUrl,
    pdfUrl,
    gymId,
    chineseSourceUrl: `${pdfUrl}&ver=zh_cn`,
  };
}

function publicArchiveStatement(row) {
  if (!row) return null;
  const original = safeObject(row.original_json, { sections: [], sample: null });
  const chinese = safeObject(row.chinese_json, { sections: [] });
  const images = safeImages(row.images_json).map((image) => ({
    ...image,
    src: image.assetId ? `/archive/statements/assets/${image.assetId}` : "",
  }));
  const pdfUrl = `https://contest.ucup.ac/download.php?type=statement&id=${row.problem_id}&contest_id=${row.qoj_contest_id}`;
  const structuredSource = isCodeforcesUrl(row.source_url);
  return {
    schemaVersion: 1,
    contestId: row.contest_slug,
    contestName: row.contest_name,
    slot: row.slot,
    problemId: Number(row.problem_id),
    titleEn: row.title_en,
    titleZh: row.title_zh || row.title_en,
    timeLimitText: row.time_limit_text || "",
    memoryLimitText: row.memory_limit_text || "",
    source: {
      kind: structuredSource ? "mirror-structured" : "official-pdf-extract",
      englishPdfUrl: pdfUrl,
      chinesePdfUrl: row.chinese_source_url || null,
      chinesePages: null,
      sourceUrl: row.source_url,
      sourceLabel: structuredSource ? "Codeforces Gym" : "Universal Cup / QOJ",
    },
    english: { sections: Array.isArray(original.sections) ? original.sections : [] },
    chinese: { sections: Array.isArray(chinese.sections) ? chinese.sections : [] },
    sample: original.sample || null,
    samples: Array.isArray(original.samples) ? original.samples : original.sample ? [original.sample] : [],
    images,
    status: row.status,
    message: row.error || null,
    translationCurrent: Boolean(row.chinese_json) && Number(row.translation_version || 0) >= ARCHIVE_TRANSLATION_VERSION,
    translationReviewed: Boolean(row.translation_reviewed || row.chinese_source_url),
    translationReviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function upsertArchivePending(metadata) {
  const timestamp = now();
  db.prepare(`
    INSERT INTO archive_statements (id, contest_slug, slot, qoj_contest_id, problem_id, contest_name, title_en, source_url, chinese_source_url, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'importing', ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      qoj_contest_id=excluded.qoj_contest_id,
      problem_id=excluded.problem_id,
      contest_name=excluded.contest_name,
      title_en=excluded.title_en,
      source_url=excluded.source_url,
      original_json=CASE WHEN archive_statements.source_url <> excluded.source_url THEN NULL ELSE archive_statements.original_json END,
      chinese_json=CASE WHEN archive_statements.source_url <> excluded.source_url AND archive_statements.chinese_source_url IS NULL THEN NULL ELSE archive_statements.chinese_json END,
      translation_version=CASE WHEN archive_statements.source_url <> excluded.source_url AND archive_statements.chinese_source_url IS NULL THEN 0 ELSE archive_statements.translation_version END,
      translation_reviewed=CASE WHEN archive_statements.source_url <> excluded.source_url AND archive_statements.chinese_source_url IS NULL THEN 0 ELSE archive_statements.translation_reviewed END,
      reviewed_at=CASE WHEN archive_statements.source_url <> excluded.source_url AND archive_statements.chinese_source_url IS NULL THEN NULL ELSE archive_statements.reviewed_at END,
      reviewed_by=CASE WHEN archive_statements.source_url <> excluded.source_url AND archive_statements.chinese_source_url IS NULL THEN NULL ELSE archive_statements.reviewed_by END,
      status=CASE WHEN archive_statements.source_url <> excluded.source_url THEN 'importing' ELSE archive_statements.status END,
      chinese_source_url=COALESCE(archive_statements.chinese_source_url, excluded.chinese_source_url),
      updated_at=excluded.updated_at
  `).run(metadata.id, metadata.contestId, metadata.slot, metadata.qojContestId, metadata.problemId, metadata.contestName, metadata.title, metadata.sourceUrl, timestamp, timestamp);
}

function setArchiveStatus(id, status, error = null) {
  db.prepare("UPDATE archive_statements SET status = ?, error = ?, updated_at = ? WHERE id = ?").run(status, error ? String(error).slice(0, 500) : null, now(), id);
}

function archiveMetadataFromRow(row) {
  const pdfUrl = `https://contest.ucup.ac/download.php?type=statement&id=${row.problem_id}&contest_id=${row.qoj_contest_id}`;
  const sourceUrl = String(row.source_url || pdfUrl);
  const gymMatch = sourceUrl.match(/\/gym\/(\d+)\/problem\/[A-Z][0-9]?/i);
  return {
    id: row.id,
    contestId: row.contest_slug,
    slot: row.slot,
    qojContestId: Number(row.qoj_contest_id),
    problemId: Number(row.problem_id),
    contestName: row.contest_name,
    title: row.title_en,
    sourceUrl,
    pdfUrl,
    gymId: gymMatch ? Number(gymMatch[1]) : null,
    chineseSourceUrl: `${pdfUrl}&ver=zh_cn`,
  };
}

function prewarmMetadata(input, contestId, contestName) {
  const url = new URL("http://localhost/archive/statements");
  url.searchParams.set("contest", contestId);
  url.searchParams.set("contestName", contestName);
  url.searchParams.set("slot", String(input?.slot || ""));
  url.searchParams.set("qojContestId", String(input?.qojContestId || ""));
  url.searchParams.set("problemId", String(input?.problemId || ""));
  if (input?.gymId) url.searchParams.set("gymId", String(input.gymId));
  url.searchParams.set("title", String(input?.title || `Problem ${input?.slot || ""}`));
  return normalizeArchiveMetadata(url);
}

function archivePrewarmProgress(contestId) {
  const rows = db.prepare(`SELECT s.slot, s.status, s.error, s.original_json, s.chinese_json, s.chinese_source_url, s.translation_version,
      p.attempts, p.next_attempt_at, p.updated_at
    FROM archive_statement_prewarm p JOIN archive_statements s ON s.id = p.statement_id
    WHERE p.contest_slug = ? ORDER BY s.slot`).all(contestId);
  const readyOriginal = rows.filter((row) => row.original_json).length;
  const readyChinese = rows.filter((row) => row.chinese_json && Number(row.translation_version || 0) >= ARCHIVE_TRANSLATION_VERSION).length;
  const officialChinese = rows.filter((row) => row.chinese_source_url).length;
  const failed = rows.filter((row) => row.status === "source_required" && Number(row.attempts || 0) >= 3).length;
  return {
    contestId,
    total: rows.length,
    readyOriginal,
    readyChinese,
    officialChinese,
    failed,
    status: rows.length && readyChinese === rows.length ? "ready" : failed ? "partial" : rows.length ? "prewarming" : "idle",
    progress: rows.length ? Math.round(readyChinese / rows.length * 100) : 0,
    items: rows.map((row) => ({
      slot: row.slot,
      originalReady: Boolean(row.original_json),
      chineseReady: Boolean(row.chinese_json) && Number(row.translation_version || 0) >= ARCHIVE_TRANSLATION_VERSION,
      officialChinese: Boolean(row.chinese_source_url),
      status: row.status,
      message: row.error || null,
    })),
    updatedAt: rows.length ? new Date(Math.max(...rows.map((row) => Number(row.updated_at) || 0))).toISOString() : null,
  };
}

function deferArchivePrewarm(id, { failed = false, delayMs = 60_000 } = {}) {
  const timestamp = now();
  const row = db.prepare("SELECT attempts FROM archive_statement_prewarm WHERE statement_id = ?").get(id);
  const attempts = Math.max(0, Number(row?.attempts || 0)) + (failed ? 1 : 0);
  const backoff = failed ? Math.min(6 * 60 * 60_000, Math.max(delayMs, 30_000 * 2 ** Math.min(8, attempts))) : delayMs;
  db.prepare("UPDATE archive_statement_prewarm SET attempts = ?, next_attempt_at = ?, updated_at = ? WHERE statement_id = ?")
    .run(attempts, timestamp + backoff, timestamp, id);
  return attempts;
}

function scheduleArchivePrewarm(delayMs = 0) {
  if (archivePrewarmTimer) return;
  archivePrewarmTimer = setTimeout(() => {
    archivePrewarmTimer = null;
    pumpArchivePrewarmQueue();
  }, Math.max(0, delayMs));
  archivePrewarmTimer.unref?.();
}

async function processArchivePrewarm(row) {
  const metadata = archiveMetadataFromRow(row);
  if (!row.original_json) {
    await importArchiveOriginal(metadata, { includeChinese: false });
    const imported = archiveStatementRow(row.id);
    if (!imported?.original_json) {
      deferArchivePrewarm(row.id, { failed: true });
      return;
    }
    row = { ...row, ...imported };
  }

  const chineseCurrent = Boolean(row.chinese_json) && Number(row.translation_version || 0) >= ARCHIVE_TRANSLATION_VERSION;
  if (row.chinese_source_url || (chineseCurrent && Number(row.attempts || 0) >= 2)) {
    db.prepare("UPDATE archive_statement_prewarm SET next_attempt_at = 0, updated_at = ? WHERE statement_id = ?").run(now(), row.id);
    return;
  }

  const official = await importArchiveOfficialChinese(metadata, { force: true });
  if (official) {
    db.prepare("UPDATE archive_statement_prewarm SET next_attempt_at = 0, updated_at = ? WHERE statement_id = ?").run(now(), row.id);
    return;
  }

  const attempts = deferArchivePrewarm(row.id, { failed: true });
  if (attempts < 2) return;
  const queued = queueArchiveTranslation(row.id);
  if (queued) deferArchivePrewarm(row.id, { delayMs: 90_000 });
}

function pumpArchivePrewarmQueue() {
  if (ARCHIVE_PREWARM_PAUSED) return;
  const active = archiveImportJobs.size + archiveOfficialChineseJobs.size;
  const available = Math.max(0, ARCHIVE_PREWARM_CONCURRENCY - active);
  if (!available) {
    scheduleArchivePrewarm(1_000);
    return;
  }
  const timestamp = now();
  const candidates = db.prepare(`SELECT s.*, p.attempts, p.next_attempt_at
    FROM archive_statement_prewarm p JOIN archive_statements s ON s.id = p.statement_id
    WHERE p.next_attempt_at <= ? AND (
      s.original_json IS NULL OR s.chinese_json IS NULL OR s.translation_version < ?
      OR (s.chinese_source_url IS NULL AND p.attempts < 2)
    ) ORDER BY p.requested_at, s.slot LIMIT ?`).all(timestamp, ARCHIVE_TRANSLATION_VERSION, available * 3);
  const selected = candidates.filter((row) => !archiveImportJobs.has(row.id) && !archiveOfficialChineseJobs.has(row.id)).slice(0, available);
  for (const row of selected) void processArchivePrewarm(row).catch((error) => {
    console.error("archive prewarm", row.id, error instanceof Error ? error.message : error);
    deferArchivePrewarm(row.id, { failed: true });
  }).finally(() => scheduleArchivePrewarm(250));
  if (selected.length) return;
  const next = db.prepare(`SELECT MIN(p.next_attempt_at) AS next_at
    FROM archive_statement_prewarm p JOIN archive_statements s ON s.id = p.statement_id
    WHERE s.original_json IS NULL OR s.chinese_json IS NULL OR s.translation_version < ?
      OR (s.chinese_source_url IS NULL AND p.attempts < 2)`).get(ARCHIVE_TRANSLATION_VERSION);
  if (Number(next?.next_at) > timestamp) scheduleArchivePrewarm(Math.min(60_000, Number(next.next_at) - timestamp));
}

function registerArchivePrewarm(body) {
  const contestId = String(body?.contestId || "").trim();
  const contestName = String(body?.contestName || "").trim();
  const problems = Array.isArray(body?.problems) ? body.problems.slice(0, 15) : [];
  if (!problems.length) throw new HttpError(400, "整场预热题目为空");
  const metadata = problems.map((problem) => prewarmMetadata(problem, contestId, contestName));
  if (new Set(metadata.map((item) => item.slot)).size !== metadata.length) throw new HttpError(400, "整场预热题号重复");
  const timestamp = now();
  const insert = db.prepare(`INSERT INTO archive_statement_prewarm (statement_id, contest_slug, attempts, next_attempt_at, requested_at, updated_at)
    VALUES (?, ?, 0, 0, ?, ?) ON CONFLICT(statement_id) DO UPDATE SET contest_slug = excluded.contest_slug,
      next_attempt_at = 0, requested_at = excluded.requested_at, updated_at = excluded.updated_at`);
  db.exec("BEGIN IMMEDIATE");
  try {
    for (const item of metadata) {
      upsertArchivePending(item);
      const row = archiveStatementRow(item.id);
      if (!row?.original_json) setArchiveStatus(item.id, "queued", "已加入整场题面预热队列");
      insert.run(item.id, item.contestId, timestamp, timestamp);
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
  scheduleArchivePrewarm();
  return archivePrewarmProgress(contestId);
}

function isArchiveResourceUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && ["contest.ucup.ac", "qoj.ac"].includes(url.hostname.toLowerCase())
      && url.pathname === "/download.php"
      && url.searchParams.get("type") === "statement"
      && /^\d+$/.test(url.searchParams.get("id") || "")
      && /^\d+$/.test(url.searchParams.get("contest_id") || "");
  } catch {
    return false;
  }
}

async function fetchArchivePdf(value, maxRedirects = 3, timeoutMs = 35_000) {
  let url = String(value);
  for (let redirect = 0; redirect <= maxRedirects; redirect += 1) {
    if (!isArchiveResourceUrl(url)) throw new HttpError(400, "官方 PDF 地址无效");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        redirect: "manual",
        headers: { "User-Agent": USER_AGENT, Accept: "application/pdf", "Accept-Language": "en-US,en;q=0.9" },
        signal: controller.signal,
      });
      if (![301, 302, 303, 307, 308].includes(response.status)) {
        if (!response.ok) throw new Error(`PDF HTTP ${response.status}`);
        const contentType = String(response.headers.get("content-type") || "").toLowerCase();
        const buffer = await readLimitedBuffer(response, 16 * 1024 * 1024);
        if (!contentType.includes("pdf") && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new Error("官方地址没有返回 PDF");
        return buffer;
      }
      const location = response.headers.get("location");
      if (!location || redirect === maxRedirects) throw new Error("PDF 重定向异常");
      url = new URL(location, url).href;
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("PDF 重定向过多");
}

async function fetchArchiveOfficialChineseTitle(metadata) {
  const url = `https://contest.ucup.ac/contest/${metadata.qojContestId}/problem/${metadata.problemId}/statement/zh_cn`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: "text/html", "Accept-Language": "zh-CN,zh;q=0.9" }, signal: controller.signal });
    if (!response.ok) return "";
    const html = (await readLimitedBuffer(response, 2 * 1024 * 1024)).toString("utf8");
    const $ = load(html);
    return $(".page-header h1.col-md-7").first().text().replace(/^\s*[A-Z][0-9]?\.\s*/i, "").replace(/\s+/g, " ").trim().slice(0, 180);
  } finally {
    clearTimeout(timeout);
  }
}

function formulaCounts(html) {
  const counts = new Map();
  for (const match of String(html || "").matchAll(/\${3}[\s\S]*?\${3}/g)) counts.set(match[0], (counts.get(match[0]) || 0) + 1);
  return counts;
}

function formulasMatch(sourceHtml, translatedHtml) {
  const source = formulaCounts(sourceHtml);
  const translated = formulaCounts(translatedHtml);
  return source.size === translated.size && [...source].every(([formula, count]) => translated.get(formula) === count);
}

function requireStatementAdmin(request) {
  const user = authenticateRequest(request);
  if (user.role !== "admin") throw new HttpError(403, "仅管理员可校对题面");
  if (user.must_change_password) throw new HttpError(403, "请先在账号中心修改初始密码");
  return user;
}

function archiveFormulaTokens(value) {
  return String(value || "").match(/\${3}[\s\S]*?\${3}|\${2}[\s\S]*?\${2}|\$(?!\$)[^$\n]*?\$/g) || [];
}

function reviewedArchiveText(value, previous, field) {
  const text = String(value || "").trim();
  if (!text || text.length > 30_000) throw new HttpError(400, `${field}内容无效`);
  const before = archiveFormulaTokens(previous);
  const after = archiveFormulaTokens(text);
  if (before.length !== after.length || before.some((formula, index) => formula !== after[index])) {
    throw new HttpError(400, `${field}中的数学公式发生了改变，已拒绝保存`);
  }
  return text;
}

function normalizeReviewedArchiveChinese(value, current) {
  const submitted = value && typeof value === "object" ? value : null;
  if (!submitted || !Array.isArray(submitted.sections) || !Array.isArray(current.sections)
    || submitted.sections.length !== current.sections.length) throw new HttpError(400, "中文题面结构不完整");
  const sections = current.sections.map((section, sectionIndex) => {
    const incoming = submitted.sections[sectionIndex];
    if (!incoming || incoming.key !== section.key || !Array.isArray(incoming.blocks)
      || incoming.blocks.length !== section.blocks.length) throw new HttpError(400, "中文题面段落结构发生了改变");
    const title = String(incoming.title || "").trim().slice(0, 80);
    if (!title) throw new HttpError(400, "中文题面章节标题不能为空");
    const blocks = section.blocks.map((block, blockIndex) => {
      const next = incoming.blocks[blockIndex];
      if (!next || next.kind !== block.kind) throw new HttpError(400, "中文题面段落类型发生了改变");
      if (block.kind === "code") {
        if (String(next.code || "") !== String(block.code || "")) throw new HttpError(400, "代码块不能在题面校对中修改");
        return { ...block };
      }
      if (block.kind === "bullets") {
        if (!Array.isArray(next.items) || next.items.length !== block.items.length) throw new HttpError(400, "列表项数量发生了改变");
        return { ...block, items: block.items.map((item, index) => reviewedArchiveText(next.items[index], item, "列表项")) };
      }
      return { ...block, text: reviewedArchiveText(next.text, block.text, "段落") };
    });
    return { ...section, title, blocks };
  });
  const plainText = JSON.stringify(sections);
  if ((plainText.match(/[\u3400-\u9fff]/g) || []).length < 20) throw new HttpError(400, "中文题面内容过少");
  return { sections };
}

function statementReviewQueue(limit = 240) {
  const safeLimit = Math.max(1, Math.min(500, Number(limit) || 240));
  const codeforces = db.prepare(`SELECT code, title, source_kind, translation_reviewed, reviewed_at, updated_at
    FROM problem_statements WHERE chinese_html IS NOT NULL ORDER BY translation_reviewed ASC, updated_at DESC LIMIT ?`).all(safeLimit)
    .map((row) => ({
      kind: "codeforces",
      id: row.code,
      title: row.title || `Codeforces ${row.code}`,
      source: row.source_kind === "codeforces-gym" ? "Codeforces Gym" : "Codeforces",
      reviewed: Boolean(row.translation_reviewed),
      official: false,
      href: `/problem/${encodeURIComponent(row.code)}?review=1`,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  const archive = db.prepare(`SELECT id, contest_slug, slot, contest_name, title_en, title_zh, chinese_source_url,
      translation_reviewed, reviewed_at, updated_at FROM archive_statements WHERE chinese_json IS NOT NULL
      ORDER BY translation_reviewed ASC, updated_at DESC LIMIT ?`).all(safeLimit)
    .map((row) => ({
      kind: "archive",
      id: row.id,
      title: `${row.contest_name} · ${row.slot} · ${row.title_zh || row.title_en}`,
      source: row.chinese_source_url ? "官方中文题册" : "历届比赛题面",
      reviewed: Boolean(row.translation_reviewed || row.chinese_source_url),
      official: Boolean(row.chinese_source_url),
      href: `/vp/archive/problem?contest=${encodeURIComponent(row.contest_slug)}&slot=${encodeURIComponent(row.slot)}&review=1`,
      reviewedAt: row.reviewed_at ? new Date(row.reviewed_at).toISOString() : null,
      updatedAt: new Date(row.updated_at).toISOString(),
    }));
  return [...codeforces, ...archive]
    .sort((left, right) => Number(left.reviewed) - Number(right.reviewed) || Date.parse(right.updatedAt) - Date.parse(left.updatedAt))
    .slice(0, safeLimit);
}

function deviceTranslationPreview(row, chineseHtml, images) {
  return {
    ...publicStatement(row),
    chineseHtml,
    images,
    translationVersion: 0,
    translationCurrent: false,
    translationReviewed: false,
    translationReviewedAt: null,
    revalidating: false,
    status: "ready_preview",
    message: "浏览器本地译文仅保存在当前设备；服务器译文完成后会自动替换",
    cacheScope: "device",
  };
}

function statementSourceUrl(parsed, sourceKind, mirror = false) {
  const host = mirror ? "mirror.codeforces.com" : "codeforces.com";
  if (sourceKind === "gym") return `https://${host}/gym/${parsed.contestId}/problem/${parsed.index}`;
  return `https://${host}/problemset/problem/${parsed.contestId}/${parsed.index}`;
}

function normalizeStatementSource(value) {
  return String(value || "").toLowerCase() === "gym" ? "gym" : "problemset";
}

function upsertPending(parsed, sourceKind = "problemset") {
  const timestamp = now();
  db.prepare(`
    INSERT INTO problem_statements (code, contest_id, problem_index, source_url, source_kind, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'importing', ?, ?)
    ON CONFLICT(code) DO NOTHING
  `).run(parsed.code, parsed.contestId, parsed.index, statementSourceUrl(parsed, sourceKind), sourceKind === "gym" ? "pending-gym" : "pending", timestamp, timestamp);
}

function saveOriginal(document) {
  const timestamp = now();
  db.prepare(`
    INSERT INTO problem_statements (code, contest_id, problem_index, title, time_limit_text, memory_limit_text, source_url, source_kind, original_html, images_json, status, error, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'translating', NULL, ?, ?)
    ON CONFLICT(code) DO UPDATE SET
      contest_id=excluded.contest_id,
      problem_index=excluded.problem_index,
      title=excluded.title,
      time_limit_text=excluded.time_limit_text,
      memory_limit_text=excluded.memory_limit_text,
      source_url=excluded.source_url,
      source_kind=excluded.source_kind,
      original_html=excluded.original_html,
      images_json=excluded.images_json,
      translation_version=0,
      translation_reviewed=0,
      reviewed_at=NULL,
      reviewed_by=NULL,
      status='translating',
      error=NULL,
      updated_at=excluded.updated_at
  `).run(document.code, document.contestId, document.index, document.title, document.timeLimitText, document.memoryLimitText, document.sourceUrl, document.sourceKind, document.originalHtml, JSON.stringify(document.images || []), timestamp, timestamp);
}

function setStatus(code, status, error = null) {
  db.prepare("UPDATE problem_statements SET status = ?, error = ?, updated_at = ? WHERE code = ?").run(status, error ? String(error).slice(0, 500) : null, now(), code);
}

async function fetchText(url, timeoutMs = 25_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchCodeforcesResource(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const buffer = await readLimitedBuffer(response, 4 * 1024 * 1024);
    return { text: buffer.toString("utf8"), finalUrl: response.url };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchDatasetRow(parsed) {
  const id = `${parsed.contestId}/${parsed.index}`;
  const where = encodeURIComponent(`"id"='${id}'`);
  for (const split of ["train", "test"]) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 18_000);
      try {
        const response = await fetch(`https://datasets-server.huggingface.co/filter?dataset=open-r1/codeforces&config=default&split=${split}&length=1&where=${where}`, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
        if (!response.ok) continue;
        const payload = await response.json();
        if (payload.rows?.[0]?.row) return payload.rows[0].row;
      } finally {
        clearTimeout(timeout);
      }
    } catch {
      // Continue to the next split or the browser extension fallback.
    }
  }
  return null;
}

async function importOriginal(parsed, sourceKind = "problemset") {
  if (importJobs.has(parsed.code)) return importJobs.get(parsed.code);
  if (importJobs.size >= 32) {
    setStatus(parsed.code, "source_required", "题面导入队列繁忙，请稍后重试或使用浏览器扩展");
    return null;
  }
  const job = (async () => {
    setStatus(parsed.code, "importing");
    const urls = [statementSourceUrl(parsed, sourceKind), statementSourceUrl(parsed, sourceKind, true)]
      .map((url) => `${url}?locale=en`);
    for (const url of urls) {
      try {
        const page = await fetchText(url);
        const document = parseCodeforcesStatement(page.text, page.finalUrl, parsed.code);
        saveOriginal(document);
        if (!queueTranslation(parsed.code)) setStatus(parsed.code, "ready_original", "原题面已就绪；中文翻译将在稍后开始");
        return document;
      } catch {
        // Codeforces may challenge datacenter IPs. The extension and dataset fallbacks handle this.
      }
    }
    const row = sourceKind === "gym" ? null : await fetchDatasetRow(parsed);
    if (row) {
      const document = datasetRowToStatement(row, parsed.code);
      saveOriginal(document);
      if (!queueTranslation(parsed.code)) setStatus(parsed.code, "ready_original", "原题面已就绪；中文翻译将在稍后开始");
      return document;
    }
    setStatus(parsed.code, "source_required", `需要浏览器扩展读取 Codeforces ${sourceKind === "gym" ? "Gym " : ""}原题面`);
    return null;
  })().finally(() => importJobs.delete(parsed.code));
  importJobs.set(parsed.code, job);
  return job;
}

async function translatorFetch(path, options = {}, timeoutMs = 120_000) {
  if (!TRANSLATOR_BASE_URL) throw new Error("未配置本地中文翻译模型");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${TRANSLATOR_BASE_URL}${path}`, { ...options, signal: controller.signal });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error?.message || payload.error || `翻译模型 HTTP ${response.status}`);
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 15_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

async function fastTranslatorAccessToken(forceRefresh = false) {
  if (!forceRefresh && fastTranslatorToken && now() < fastTranslatorTokenExpiresAt) return fastTranslatorToken;
  const response = await fetchWithTimeout(FAST_TRANSLATOR_AUTH_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/plain" },
  }, 12_000);
  const token = (await response.text()).trim();
  if (!response.ok || token.length < 100) throw new Error(`快速翻译鉴权 HTTP ${response.status}`);
  fastTranslatorToken = token;
  // Edge translator tokens are short lived. Refresh conservatively instead of
  // decoding or persisting the bearer token.
  fastTranslatorTokenExpiresAt = now() + 8 * 60_000;
  return token;
}

function applySourceGlossary(value) {
  const replacements = [
    [/\bgreatest common divisor\b/gi, "最大公约数"],
    [/\bleast common multiple\b/gi, "最小公倍数"],
    [/\bconnected components?\b/gi, "连通块"],
    [/\bpositive integers?\b/gi, "正整数"],
    [/\btest cases?\b/gi, "测试用例"],
    [/\bsubsequences?\b/gi, "子序列"],
    [/\bsubarrays?\b/gi, "子数组"],
    [/\bpermutations?\b/gi, "排列"],
    [/\binversions?\b/gi, "逆序"],
    [/\b(?:index|indices)\b/gi, "下标"],
    [/\bsegments?\b/gi, "区间"],
    [/\boperations?\b/gi, "操作"],
    [/\b(?:query|queries)\b/gi, "询问"],
    [/\b(?:vertex|vertices)\b/gi, "顶点"],
    [/\bedges?\b/gi, "边"],
    [/\bintegers?\b/gi, "整数"],
    [/\bsequences?\b/gi, "序列"],
    [/\bdistinct\b/gi, "互不相同"],
    [/\bat most\b/gi, "至多"],
    [/\bat least\b/gi, "至少"],
  ];
  return replacements.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value);
}

async function translateFastBatch(texts, retry = true) {
  const literalMaps = [];
  const formulaMaps = [];
  const input = texts.map((text) => {
    const formulas = [];
    const locallyNumbered = text.replace(/ICPCMATH\d+END/g, (original) => {
      const local = `ICPCMATH${formulas.length}END`;
      formulas.push({ local, original });
      return local;
    });
    const literals = [];
    const masked = locallyNumbered.replace(/\b(?:YES|NO)\b/g, (literal) => {
      const placeholder = `ICPCLITERAL${literals.length}END`;
      literals.push({ placeholder, literal });
      return placeholder;
    });
    literalMaps.push(literals);
    formulaMaps.push(formulas);
    return applySourceGlossary(masked);
  });
  const token = await fastTranslatorAccessToken(!retry);
  const response = await fetchWithTimeout(FAST_TRANSLATOR_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": USER_AGENT,
    },
    body: JSON.stringify(input.map((Text) => ({ Text }))),
  }, 25_000);
  if (response.status === 401 && retry) {
    fastTranslatorToken = "";
    fastTranslatorTokenExpiresAt = 0;
    return translateFastBatch(texts, false);
  }
  const payload = await response.json().catch(() => null);
  if (!response.ok || !Array.isArray(payload) || payload.length !== texts.length) throw new Error(`快速翻译 HTTP ${response.status}`);
  return texts.map((source, index) => {
    let translated = String(payload[index]?.translations?.[0]?.text || "").trim();
    if (!translated) return null;
    for (let formulaIndex = 0; formulaIndex < formulaMaps[index].length; formulaIndex += 1) {
      const { local } = formulaMaps[index][formulaIndex];
      const flexible = new RegExp(local.replace("ICPCMATH", "ICPC\\s*MATH\\s*").replace("END", "\\s*END"), "gi");
      if ([...translated.matchAll(flexible)].length !== 1) return null;
      translated = translated.replace(flexible, () => `ICPCRESTORE${formulaIndex}END`);
    }
    for (let formulaIndex = 0; formulaIndex < formulaMaps[index].length; formulaIndex += 1) {
      translated = translated.replace(`ICPCRESTORE${formulaIndex}END`, () => formulaMaps[index][formulaIndex].original);
    }
    const placeholders = [...new Set(source.match(/ICPCMATH\d+END/g) || [])];
    for (const placeholder of placeholders) {
      const flexible = new RegExp(placeholder.replace("ICPCMATH", "ICPC\\s*MATH\\s*").replace("END", "\\s*END"), "gi");
      if ([...translated.matchAll(flexible)].length !== 1) return null;
    }
    for (const { placeholder, literal } of literalMaps[index]) {
      const flexible = new RegExp(placeholder.replace("ICPCLITERAL", "ICPC\\s*LITERAL\\s*").replace("END", "\\s*END"), "gi");
      if ([...translated.matchAll(flexible)].length !== 1) return null;
      translated = translated.replace(flexible, () => literal);
    }
    return polishChinese(translated);
  });
}

async function translateChunk(texts) {
  if (texts.length !== 1) throw new Error("翻译器仅接受单个完整自然段");
  const sourceText = texts[0];
  const prompt = [
    "你是 QOJ / 洛谷风格的中文竞赛题面编辑，不做逐词直译。请把下面英文自然段改写为准确、自然、简洁的简体中文题面。",
    "先理解整句逻辑，再按中文语序表达；不得解题、删减条件或补充信息。所有量词、奇偶性、上下界、先后顺序和充分必要关系必须准确。",
    "术语统一：array=数组，index=下标，segment/subarray=区间/子数组，operation=操作，query=询问，positive integer=正整数，print/output=输出，input=输入，distinct=互不相同，at most=至多，at least=至少。禁止使用“阵列”“键入”“您”。",
    "变量名、数字、公式、数学符号、代码标识符以及要求原样输出的 YES/NO 等字面量保持不变。",
    "ICPCMATH0END、ICPCMATH1END 这类内容是数学公式占位符，必须逐字保留在原位置，不得翻译、增删或移动。",
    "常见句式：output n numbers — the answer for exactly k actions for all k from 1 to n，应译为“输出 n 个整数，其中第 k 个整数表示恰好进行 k 次操作时的答案（1≤k≤n）”，不要照搬英文语序。",
    "只返回中文译文正文，不要输出 JSON、Markdown 代码块、说明、前缀或引号。",
    "示例：You are given an array a of n integers. Perform the following operation any number of times. → 给定一个长度为 n 的整数数组 a。你可以进行任意次下述操作。",
    `英文原文：\n${sourceText}`,
  ].join("\n");
  const requiredPlaceholders = [...new Set(sourceText.match(/ICPCMATH\d+END/g) || [])];
  const finalPrompt = requiredPlaceholders.length
    ? `${prompt}\n硬性校验：译文必须逐一包含以下占位符，且每个恰好出现一次：${requiredPlaceholders.join("、")}。即使句子看似可以简化，也不得合并、概括或省略它们所修饰的对象。输出前请自行核对。`
    : prompt;
  const maxTokens = Math.min(1200, Math.max(192, Math.ceil(sourceText.length * 1.4)));
  async function requestTranslation(userPrompt) {
    const payload = await translatorFetch("/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
      model: TRANSLATOR_MODEL,
      temperature: 0,
      max_tokens: maxTokens,
      messages: [
        { role: "system", content: "你是严谨的中文算法竞赛题面编辑。译文应像人工校对后的 QOJ 中文题面，术语统一、语序自然、语义精确，禁止生硬逐词直译。" },
          { role: "user", content: userPrompt },
      ],
      }),
    }, 5 * 60_000);
    let result = String(payload.choices?.[0]?.message?.content || "").trim();
    result = result.replace(/^```(?:text|markdown)?\s*/i, "").replace(/\s*```$/, "").replace(/^(?:译文|翻译)[:：]\s*/i, "").trim();
    if ((result.startsWith('"') && result.endsWith('"')) || (result.startsWith("“") && result.endsWith("”"))) result = result.slice(1, -1).trim();
    // Every real formula is replaced with an ICPCMATH placeholder before the
    // model sees this text. Any dollar fences returned here are therefore
    // model-authored decoration; remove only the fences before restoring the
    // exact source formulas.
    result = result.replaceAll("$$$", "");
    return result;
  }

  let translated = await requestTranslation(finalPrompt);
  const invalidPlaceholders = () => requiredPlaceholders.filter((placeholder) => {
    const flexible = new RegExp(placeholder.replace("ICPCMATH", "ICPC\\s*MATH\\s*").replace("END", "\\s*END"), "gi");
    return [...translated.matchAll(flexible)].length !== 1;
  });
  let invalid = invalidPlaceholders();
  if (invalid.length) {
    translated = await requestTranslation([
      "上一版中文译文错误地遗漏、重复或改写了数学公式占位符。请根据英文原文重新翻译，不得概括或省略细节。",
      `英文原文：\n${sourceText}`,
      `错误初译：\n${translated}`,
      `正确译文必须逐一且仅出现一次这些占位符：${requiredPlaceholders.join("、")}。`,
      "只返回修正后的中文译文正文。",
    ].join("\n"));
    invalid = invalidPlaceholders();
  }
  if (invalid.length) {
    const parts = sourceText.split(/(ICPCMATH\d+END)/g);
    const rebuilt = [];
    for (const part of parts) {
      if (/^ICPCMATH\d+END$/.test(part) || !/[A-Za-z]{2}/.test(part)) {
        rebuilt.push(part);
        continue;
      }
      rebuilt.push(await requestTranslation([
        "下面文字是算法竞赛题面中被数学公式分隔出的英文片段。请翻译成简洁自然的中文，并保持与前后公式衔接；不得补充或省略信息。",
        `英文片段：${part}`,
        "只返回中文译文正文。",
      ].join("\n")));
    }
    translated = rebuilt.join("");
    invalid = invalidPlaceholders();
  }
  if (invalid.length) throw new Error(`公式保护回退异常：${invalid.join("、")}`);
  if (!translated) throw new Error("翻译模型返回了空译文");
  return [polishChinese(translated)];
}

function polishChinese(value) {
  return String(value)
    .replace(/^你会得到/, "给定")
    .replace(/^给你/, "给定")
    .replaceAll("阵列", "数组")
    .replaceAll("置换", "排列")
    .replaceAll("排列组合", "排列")
    .replaceAll("反演", "逆序")
    .replaceAll("倒装", "逆序")
    .replaceAll("键入", "输入")
    .replaceAll("索引", "下标")
    .replaceAll("指标", "下标")
    .replaceAll("测试案例", "测试用例")
    .replaceAll("测试事例", "测试用例")
    .replaceAll("命题运算", "操作")
    .replaceAll("打印", "输出")
    .replaceAll("互换", "交换")
    .replaceAll("解决方案", "答案")
    .replaceAll("下标的对", "下标对")
    .replace(/(ICPCMATH\d+END)\s*元素/g, "$1 个元素")
    .replace(/排列是从(ICPCMATH\d+END)到(ICPCMATH\d+END)的(ICPCMATH\d+END)\s*个元素组成的数组/g, "排列是由$3个取值在$1到$2之间的元素组成的数组")
    .replace(/存在(ICPCMATH\d+END)逆序/g, "有$1个逆序")
    .replace(/存在(\$\$\$[\s\S]*?\$\$\$)逆序/g, "有$1个逆序")
    .replaceAll("金币", "硬币")
    .replaceAll("袋中会空掉", "袋子会被清空")
    .replace(/硬币总金额/g, "硬币面值总和")
    .replace(/袋子并不是在每次硬币(?:面值总和|总和)变为偶数时才清空的，而是每次在添加硬币的过程中变为偶数时都会清空/g, "袋子会在放入硬币的过程中每次面值总和变为偶数时立即清空，而不只是最后一次操作结束时清空")
    .replace(/执行以下操作任意次数/g, "进行任意次下述操作")
    .replace(/执行任意次数的以下操作/g, "进行任意次下述操作")
    .replace(/您/g, "你")
    .replace(/\s+([，。；：！？])/g, "$1")
    .trim();
}

function escapeHtml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function translateTexts(texts) {
  const translated = [];
  const batches = [];
  let current = [];
  let currentSize = 0;
  for (const text of texts) {
    if (current.length && (current.length >= 6 || currentSize + text.length > 2200)) {
      batches.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(text);
    currentSize += text.length;
  }
  if (current.length) batches.push(current);

  for (const batch of batches) {
    try {
      // The fast translator is much less prone to adding explanations or
      // malformed JSON than a tiny local generative model, and normally
      // finishes an entire statement in seconds. Formula placeholders are
      // still verified before accepting every item.
      const results = await translateFastBatch(batch);
      for (let index = 0; index < batch.length; index += 1) {
        if (results[index]) translated.push(results[index]);
        else translated.push(...await translateChunk([batch[index]]));
      }
    } catch {
      if (batch.length > 1) {
        try {
          const results = await translateBatch(batch);
          for (let index = 0; index < batch.length; index += 1) {
            if (results[index]) translated.push(results[index]);
            else translated.push(...await translateChunk([batch[index]]));
          }
          continue;
        } catch {
          // A small local model may occasionally return malformed JSON. Keep
          // the paragraph translator as the final narrow fallback.
        }
      }
      for (const text of batch) translated.push(...await translateChunk([text]));
    }
  }
  return translated;
}

async function translateBatch(texts) {
  const input = texts.map((text, id) => ({ id, text }));
  const prompt = [
    "你是 QOJ / 洛谷风格的中文竞赛题面编辑。请批量翻译 JSON 数组中的英文题面片段。",
    "先理解逻辑再按自然中文语序表达，不得逐词硬译，不得解题、删减条件或补充信息。量词、奇偶性、上下界、先后顺序和充分必要关系必须准确。",
    "术语统一：array=数组，index=下标，segment/subarray=区间/子数组，operation=操作，query=询问，distinct=互不相同，at most=至多，at least=至少。禁止使用“阵列”“键入”“您”。",
    "变量名、数字、公式、代码标识符、YES/NO 和所有 ICPCMATH数字END 占位符必须原样保留；每个占位符须恰好出现一次。",
    `只返回包含 ${texts.length} 条译文的 JSON 对象，格式为 {\"translations\":[\"译文1\",\"译文2\"]}。数组数量和顺序必须与输入相同，不要输出 Markdown 或说明。`,
    JSON.stringify(input),
  ].join("\n");
  const payload = await translatorFetch("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TRANSLATOR_MODEL,
      temperature: 0,
      max_tokens: Math.min(3600, Math.max(600, Math.ceil(texts.join("").length * 1.6))),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "statement_translations",
          strict: true,
          schema: {
            type: "object",
            properties: { translations: { type: "array", items: { type: "string" }, minItems: texts.length, maxItems: texts.length } },
            required: ["translations"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        { role: "system", content: "你是严谨的中文算法竞赛题面编辑，并且只输出符合要求的 JSON。" },
        { role: "user", content: prompt },
      ],
    }),
  }, 5 * 60_000);
  const raw = String(payload.choices?.[0]?.message?.content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.translations) || parsed.translations.length !== texts.length) throw new Error("批量翻译片段数量不一致");
  return texts.map((source, id) => {
    const item = parsed.translations[id];
    if (typeof item !== "string" || !item.trim()) return null;
    const translated = item.trim().replaceAll("$$$", "");
    const placeholders = [...new Set(source.match(/ICPCMATH\d+END/g) || [])];
    for (const placeholder of placeholders) {
      const flexible = new RegExp(placeholder.replace("ICPCMATH", "ICPC\\s*MATH\\s*").replace("END", "\\s*END"), "gi");
      if ([...translated.matchAll(flexible)].length !== 1) return null;
    }
    return polishChinese(translated);
  });
}

async function reviewTranslationBatch(texts, drafts) {
  if (!TRANSLATOR_BASE_URL) return drafts;
  const input = texts.map((source, id) => ({ id, source, draft: drafts[id] }));
  const prompt = [
    "你是 ICPC 中文题面终审编辑。逐条对照英文原文，修正初译中的主客体颠倒、变量对应错误、条件遗漏、量词错误和生硬机翻。",
    "不得解题或改写题意。变量、数字、代码字面量以及 ICPCMATH数字END 公式占位符必须原样保留；尤其检查 a_i/b_i、输入/输出、至多/至少、任意/恰好等关系。",
    "中文应简洁自然，使用算法竞赛常用表述。只返回 JSON，译文数量与顺序必须不变。",
    JSON.stringify(input),
  ].join("\n");
  const payload = await translatorFetch("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TRANSLATOR_MODEL,
      temperature: 0,
      max_tokens: Math.min(3600, Math.max(700, Math.ceil(texts.join("").length * 1.8))),
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "reviewed_statement_translations",
          strict: true,
          schema: {
            type: "object",
            properties: { translations: { type: "array", items: { type: "string" }, minItems: texts.length, maxItems: texts.length } },
            required: ["translations"],
            additionalProperties: false,
          },
        },
      },
      messages: [
        { role: "system", content: "你是严谨的 ICPC 中文题面终审编辑，只输出符合要求的 JSON。" },
        { role: "user", content: prompt },
      ],
    }),
  }, 5 * 60_000);
  const raw = String(payload.choices?.[0]?.message?.content || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed?.translations) || parsed.translations.length !== texts.length) throw new Error("终审译文数量不一致");
  return texts.map((source, index) => {
    const reviewed = String(parsed.translations[index] || "").trim().replaceAll("$$$", "");
    if (!reviewed || !/[\u3400-\u9fff]/.test(reviewed)) return drafts[index];
    const placeholders = [...new Set(source.match(/ICPCMATH\d+END/g) || [])];
    for (const placeholder of placeholders) {
      const flexible = new RegExp(placeholder.replace("ICPCMATH", "ICPC\\s*MATH\\s*").replace("END", "\\s*END"), "gi");
      if ([...reviewed.matchAll(flexible)].length !== 1) return drafts[index];
    }
    return polishChinese(reviewed);
  });
}

async function reviewDraftTexts(texts, drafts) {
  if (!TRANSLATOR_BASE_URL) return drafts;
  const reviewed = [];
  for (let start = 0; start < texts.length; start += 4) {
    const sourceBatch = texts.slice(start, start + 4);
    const draftBatch = drafts.slice(start, start + 4);
    try {
      reviewed.push(...await reviewTranslationBatch(sourceBatch, draftBatch));
    } catch (error) {
      console.error("statement translation review fallback", error instanceof Error ? error.message : error);
      reviewed.push(...draftBatch);
    }
  }
  return reviewed;
}

async function translateReviewedTexts(texts) {
  const drafts = await translateTexts(texts);
  return reviewDraftTexts(texts, drafts);
}

async function translateHtml(originalHtml, sourceUrl, onDraft = null) {
  const $ = load(`<div id="translation-root">${originalHtml}</div>`, { xmlMode: false }, false);
  const fixedHeadings = new Map([["input", "输入"], ["output", "输出"], ["example", "样例"], ["examples", "样例"], ["note", "说明"], ["interaction", "交互说明"]]);
  $("#translation-root .section-title").each((_, element) => {
    const translated = fixedHeadings.get($(element).text().trim().toLowerCase());
    if (translated) $(element).text(translated);
  });
  const records = [];
  const processedBlocks = new Set();
  let formulaIndex = 0;
  // Translate complete natural-language blocks instead of the tiny text nodes
  // around every inline formula. This both improves Chinese sentence order and
  // reduces a typical statement from dozens of model calls to a few batches.
  $("#translation-root").find("p, li, td, th, figcaption").each((_, element) => {
    if ($(element).parents("pre, code, .section-title").length || $(element).find("p, li, td, th, figcaption, img, a, pre, code").length) return;
    const clone = $(element).clone();
    const originalFormulas = $(element).find(".tex-span").toArray();
    const formulas = [];
    clone.find(".tex-span").each((index, formulaNode) => {
      const placeholder = `ICPCMATH${formulaIndex++}END`;
      const formulaElement = originalFormulas[index];
      formulas.push({ placeholder, html: formulaElement ? $.html(formulaElement) : "" });
      $(formulaNode).replaceWith(placeholder);
    });
    let source = clone.text();
    source = source.replace(/\${3}[\s\S]*?\${3}/g, (formula) => {
      const placeholder = `ICPCMATH${formulaIndex++}END`;
      formulas.push({ placeholder, html: escapeHtml(formula) });
      return placeholder;
    }).replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]{2}/.test(source.replace(/ICPCMATH\d+END/g, ""))) return;
    processedBlocks.add(element);
    records.push({ kind: "block", element, trimmed: source, formulas });
  });

  $("#translation-root").find("*").contents().each((_, node) => {
    if (node.type !== "text") return;
    if ($(node).parents("pre, code, .tex-span, .section-title").length) return;
    if ($(node).parents().toArray().some((parent) => processedBlocks.has(parent))) return;
    const raw = node.data || "";
    const fixedHeading = fixedHeadings.get(raw.trim().toLowerCase());
    if (fixedHeading) {
      node.data = `${raw.match(/^\s*/)?.[0] || ""}${fixedHeading}${raw.match(/\s*$/)?.[0] || ""}`;
      return;
    }
    if (!/[A-Za-z]{2}/.test(raw.replace(/\${3}[\s\S]*?\${3}/g, ""))) return;
    const formulas = [];
    const masked = raw.replace(/\${3}[\s\S]*?\${3}/g, (formula) => {
      const placeholder = `ICPCMATH${formulaIndex++}END`;
      formulas.push({ placeholder, formula });
      return placeholder;
    });
    records.push({ kind: "text", node, raw, trimmed: masked.trim(), formulas });
  });
  const unique = [...new Set(records.map((record) => record.trimmed))];
  const sourceFormulas = [...originalHtml.matchAll(/\${3}[\s\S]*?\${3}/g)].map((match) => match[0]);
  const formulaCounts = (formulas) => formulas.reduce((counts, formula) => counts.set(formula, (counts.get(formula) || 0) + 1), new Map());
  const sourceCounts = formulaCounts(sourceFormulas);

  function renderTranslations(translations) {
    const map = new Map(unique.map((item, index) => [item, translations[index]]));
    for (const record of records) {
      if (record.kind === "block") {
        let html = escapeHtml(map.get(record.trimmed) || record.trimmed);
        for (const { placeholder, html: formulaHtml } of record.formulas) {
          const flexiblePlaceholder = new RegExp(placeholder.replace("ICPCMATH", "ICPC\\s*MATH\\s*").replace("END", "\\s*END"), "i");
          if (!flexiblePlaceholder.test(html)) throw new Error(`翻译模型未保留公式占位符 ${placeholder}`);
          html = html.replace(flexiblePlaceholder, () => formulaHtml);
        }
        $(record.element).html(html);
        continue;
      }
      let translated = map.get(record.trimmed) || record.trimmed;
      for (const { placeholder, formula } of record.formulas) {
        const flexiblePlaceholder = new RegExp(placeholder.replace("ICPCMATH", "ICPC\\s*MATH\\s*").replace("END", "\\s*END"), "i");
        if (!flexiblePlaceholder.test(translated)) throw new Error(`翻译模型未保留公式占位符 ${placeholder}`);
        translated = translated.replace(flexiblePlaceholder, () => formula);
      }
      const prefix = record.raw.match(/^\s*/)?.[0] || "";
      const suffix = record.raw.match(/\s*$/)?.[0] || "";
      record.node.data = `${prefix}${translated.trim()}${suffix}`;
    }
    const translatedHtml = sanitizeStatementHtml($("#translation-root").html() || "", sourceUrl).html;
    const translatedFormulas = [...translatedHtml.matchAll(/\${3}[\s\S]*?\${3}/g)].map((match) => match[0]);
    const translatedCounts = formulaCounts(translatedFormulas);
    if (sourceFormulas.length !== translatedFormulas.length || sourceCounts.size !== translatedCounts.size || [...sourceCounts].some(([formula, count]) => translatedCounts.get(formula) !== count)) throw new Error("翻译过程改变了数学公式，已拒绝缓存该译文");
    return translatedHtml;
  }

  const drafts = await translateTexts(unique);
  const draftHtml = renderTranslations(drafts);
  if (!TRANSLATOR_BASE_URL) return draftHtml;
  if (onDraft) await onDraft(draftHtml);
  const reviewed = await reviewDraftTexts(unique, drafts);
  return renderTranslations(reviewed);
}

async function downloadImage(image, code, referer) {
  const existing = db.prepare("SELECT id, content_type FROM statement_assets WHERE source_url = ? AND code = ? LIMIT 1").get(image.sourceUrl, code);
  if (existing) return { ...image, assetId: existing.id, contentType: existing.content_type };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetchCodeforcesResource(image.sourceUrl, { headers: { "User-Agent": USER_AGENT, Referer: referer }, signal: controller.signal });
    if (!response.ok) throw new Error(`图片 HTTP ${response.status}`);
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!contentType.startsWith("image/")) throw new Error("资源不是图片");
    const buffer = await readLimitedBuffer(response, 6 * 1024 * 1024);
    if (!buffer.length) throw new Error("图片内容为空");
    const id = sha256(Buffer.concat([Buffer.from(image.sourceUrl), buffer]));
    db.prepare("INSERT OR REPLACE INTO statement_assets (id, code, source_url, content_type, body, created_at) VALUES (?, ?, ?, ?, ?, ?)").run(id, code, image.sourceUrl, contentType, buffer, now());
    return { ...image, assetId: id, contentType, ocrEn: await recognizeImageText(buffer, id, image.alt || image.title || "") };
  } finally {
    clearTimeout(timeout);
  }
}

async function recognizeImageText(buffer, id, fallbackText) {
  const path = join(tmpdir(), `icpc-statement-${id}.img`);
  try {
    writeFileSync(path, buffer);
    const result = await execFileAsync("tesseract", [path, "stdout", "-l", "eng", "--psm", "6"], { timeout: 60_000, maxBuffer: 2 * 1024 * 1024 });
    const text = String(result.stdout || "").replace(/\s+/g, " ").trim().slice(0, 4000);
    return /[A-Za-z]{2}/.test(text) ? text : /[A-Za-z]{2}/.test(fallbackText) ? fallbackText : "";
  } catch {
    return /[A-Za-z]{2}/.test(fallbackText) ? fallbackText : "";
  } finally {
    try { unlinkSync(path); } catch { /* ignore */ }
  }
}

async function translateStatement(code) {
  const row = statementRow(code);
  if (!row?.original_html || (row.chinese_html && Number(row.translation_version || 0) >= TRANSLATION_VERSION)) return;
  recentTranslationAttempts.set(code, now());
  let translationSaved = false;
  try {
    setStatus(code, "translating", row.chinese_html ? "已有中文缓存可立即阅读，正在后台校对新版术语" : "正在快速生成中文题面");
    const chineseHtml = await translateHtml(row.original_html, row.source_url, async (draftHtml) => {
      db.prepare("UPDATE problem_statements SET chinese_html = ?, translation_version = ?, translation_reviewed = 0, reviewed_at = NULL, reviewed_by = NULL, status = 'ready', error = NULL, updated_at = ? WHERE code = ?").run(draftHtml, Math.max(0, TRANSLATION_VERSION - 1), now(), code);
      translationSaved = true;
    });
    db.prepare("UPDATE problem_statements SET chinese_html = ?, translation_version = ?, translation_reviewed = 0, reviewed_at = NULL, reviewed_by = NULL, status = 'ready', error = NULL, updated_at = ? WHERE code = ?").run(chineseHtml, TRANSLATION_VERSION, now(), code);
    translationSaved = true;

    // Images are enhanced only after the readable Chinese statement has been
    // committed, so slow image hosts or OCR never block the main statement.
    const originalImages = safeImages(row.images_json);
    const images = [];
    for (const image of originalImages.slice(0, 20)) {
      try { images.push(await downloadImage(image, code, row.source_url)); }
      catch (error) { images.push({ ...image, error: error instanceof Error ? error.message : "图片缓存失败" }); }
    }
    db.prepare("UPDATE problem_statements SET images_json = ?, updated_at = ? WHERE code = ?").run(JSON.stringify(images), now(), code);
    const ocrTexts = images.filter((item) => item.ocrEn).map((item) => item.ocrEn);
    if (ocrTexts.length) {
      const ocrTranslations = await translateReviewedTexts(ocrTexts);
      let index = 0;
      for (const image of images) if (image.ocrEn) image.ocrZh = ocrTranslations[index++];
    }
    db.prepare("UPDATE problem_statements SET images_json = ?, updated_at = ? WHERE code = ?").run(JSON.stringify(images), now(), code);
  } catch (error) {
    recentTranslationAttempts.set(code, now());
    const message = error instanceof Error ? error.message : "中文翻译失败";
    console.error("statement translation failed", code, message);
    if (translationSaved) setStatus(code, "ready", null);
    else setStatus(code, "ready_original", "原题面已就绪；中文翻译服务暂时不可用，将在稍后重试");
  }
}

async function extractArchivePdf(metadata, pdfBuffer, { extractImages = true } = {}) {
  const directory = await mkdtemp(join(tmpdir(), "icpc-archive-"));
  const pdfPath = join(directory, "statement.pdf");
  const imagePrefix = join(directory, "figure");
  try {
    writeFileSync(pdfPath, pdfBuffer);
    const { stdout } = await execFileAsync("pdftotext", ["-layout", pdfPath, "-"], { timeout: 60_000, maxBuffer: 10 * 1024 * 1024 });
    const parsed = parseArchivePdfText(String(stdout || ""), metadata.title);
    if (extractImages) {
      try {
        await execFileAsync("pdfimages", ["-png", pdfPath, imagePrefix], { timeout: 90_000, maxBuffer: 2 * 1024 * 1024 });
      } catch (error) {
        console.error("archive PDF image extraction", metadata.id, error instanceof Error ? error.message : error);
      }
    }
    const files = (await readdir(directory)).filter((name) => /^figure-\d+\.png$/i.test(name)).sort().slice(0, 16);
    const images = [];
    for (const [index, name] of files.entries()) {
      const buffer = await readFile(join(directory, name));
      if (buffer.length < 4_096 || buffer.length > 6 * 1024 * 1024) continue;
      const assetId = sha256(Buffer.concat([Buffer.from(metadata.id), Buffer.from(name), buffer]));
      db.prepare("INSERT OR REPLACE INTO archive_statement_assets (id, statement_id, content_type, body, created_at) VALUES (?, ?, 'image/png', ?, ?)").run(assetId, metadata.id, buffer, now());
      const ocrEn = await recognizeImageText(buffer, assetId, "");
      images.push({
        assetId,
        contentType: "image/png",
        captionEn: `Problem ${metadata.slot} figure ${index + 1}`,
        captionZh: `题目 ${metadata.slot} 配图 ${index + 1}`,
        ocrEn: ocrEn || null,
        imageTextZh: null,
      });
    }
    return { parsed, images };
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function downloadArchiveHtmlImages(metadata, document) {
  const images = [];
  for (const [index, image] of (document.images || []).slice(0, 16).entries()) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    try {
      const response = await fetchCodeforcesResource(image.sourceUrl, {
        headers: { "User-Agent": USER_AGENT, Referer: document.sourceUrl },
        signal: controller.signal,
      });
      if (!response.ok) continue;
      const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
      if (!contentType.startsWith("image/")) continue;
      const buffer = await readLimitedBuffer(response, 6 * 1024 * 1024);
      if (buffer.length < 512) continue;
      const assetId = sha256(Buffer.concat([Buffer.from(metadata.id), Buffer.from(image.sourceUrl), buffer]));
      db.prepare("INSERT OR REPLACE INTO archive_statement_assets (id, statement_id, content_type, body, created_at) VALUES (?, ?, ?, ?, ?)")
        .run(assetId, metadata.id, contentType, buffer, now());
      const ocrEn = await recognizeImageText(buffer, assetId, image.alt || image.title || "");
      images.push({
        assetId,
        contentType,
        captionEn: image.title || image.alt || `Problem ${metadata.slot} figure ${index + 1}`,
        captionZh: `题目 ${metadata.slot} 配图 ${index + 1}`,
        ocrEn: ocrEn || null,
        imageTextZh: null,
      });
    } catch (error) {
      console.error("archive Gym image import", metadata.id, image.sourceUrl, error instanceof Error ? error.message : error);
    } finally {
      clearTimeout(timeout);
    }
  }
  return images;
}

async function extractArchiveGymStatement(metadata) {
  if (!metadata.gymId || !isCodeforcesUrl(metadata.sourceUrl)) throw new Error("Codeforces Gym 题面参数无效");
  const page = await fetchText(metadata.sourceUrl, 35_000);
  const document = parseCodeforcesStatement(page.text, page.finalUrl, `${metadata.gymId}${metadata.slot}`);
  const parsed = parseArchiveStatementHtml(document.originalHtml);
  if (!parsed.sections.length) throw new Error("Codeforces Gym 页面中没有提取到完整题面");
  const images = await downloadArchiveHtmlImages(metadata, document);
  return {
    parsed: {
      title: document.title.replace(/^\s*[A-Z][0-9]?\.\s*/i, ""),
      timeLimitText: document.timeLimitText,
      memoryLimitText: document.memoryLimitText,
      ...parsed,
    },
    images,
  };
}

function archiveHasChineseText(parsed) {
  const text = JSON.stringify(parsed?.sections || []);
  return (text.match(/[\u3400-\u9fff]/g) || []).length >= 24;
}

async function importArchiveOfficialChinese(metadata, { force = false } = {}) {
  if (archiveOfficialChineseJobs.has(metadata.id)) return archiveOfficialChineseJobs.get(metadata.id);
  const lastAttempt = recentArchiveOfficialChineseAttempts.get(metadata.id) || 0;
  if (!force && now() - lastAttempt < 10 * 60_000) return false;
  recentArchiveOfficialChineseAttempts.set(metadata.id, now());
  const job = (async () => {
    try {
      const pdf = await fetchArchivePdf(metadata.chineseSourceUrl, 3, 75_000);
      const { parsed } = await extractArchivePdf(metadata, pdf, { extractImages: false });
      if (!archiveHasChineseText(parsed)) return false;
      const row = archiveStatementRow(metadata.id);
      const original = safeObject(row?.original_json, { sections: [] });
      const quality = assessOfficialChineseArchive(parsed, original);
      if (!quality.usable) {
        console.warn("official archive Chinese statement rejected", metadata.id, quality.reason);
        return false;
      }
      for (const section of parsed.sections || []) section.title = chineseSectionTitle(section.key);
      const officialTitle = await fetchArchiveOfficialChineseTitle(metadata).catch(() => "");
      db.prepare(`UPDATE archive_statements SET
        title_zh=?, chinese_json=?, chinese_source_url=?, translation_version=?, translation_reviewed=1, reviewed_at=?, reviewed_by='official-pdf', status='ready', error=NULL, updated_at=?
        WHERE id=? AND original_json IS NOT NULL`)
        .run(officialTitle || parsed.title || metadata.title, JSON.stringify({ sections: parsed.sections || [] }), metadata.chineseSourceUrl, ARCHIVE_TRANSLATION_VERSION, now(), now(), metadata.id);
      return true;
    } catch (error) {
      console.error("official archive Chinese statement unavailable", metadata.id, error instanceof Error ? error.message : error);
      return false;
    }
  })().finally(() => {
    archiveOfficialChineseJobs.delete(metadata.id);
    scheduleArchivePrewarm(250);
  });
  archiveOfficialChineseJobs.set(metadata.id, job);
  return job;
}

async function importArchiveOriginal(metadata, { includeChinese = true } = {}) {
  if (archiveImportJobs.has(metadata.id)) return archiveImportJobs.get(metadata.id);
  if (archiveImportJobs.size + archiveOfficialChineseJobs.size >= ARCHIVE_PREWARM_CONCURRENCY) {
    setArchiveStatus(metadata.id, "queued", "PDF 导入队列繁忙，稍后会自动重试");
    scheduleArchivePrewarm(1_000);
    return null;
  }
  const job = (async () => {
    try {
      setArchiveStatus(metadata.id, "importing", metadata.gymId ? "正在整理官方 Gym 题面、公式、样例和图片" : "正在从官方 PDF 提取正文、样例和图片");
      const { parsed, images } = metadata.gymId
        ? await extractArchiveGymStatement(metadata)
        : await fetchArchivePdf(metadata.pdfUrl || metadata.sourceUrl).then((pdf) => extractArchivePdf(metadata, pdf));
      db.prepare(`
        UPDATE archive_statements SET
          title_en=?, time_limit_text=?, memory_limit_text=?, original_json=?, images_json=?,
          translation_version=0, translation_reviewed=0, reviewed_at=NULL, reviewed_by=NULL,
          status='translating', error='原题面已就绪，正在生成中文题面', updated_at=?
        WHERE id=?
      `).run(parsed.title || metadata.title, parsed.timeLimitText, parsed.memoryLimitText, JSON.stringify({ sections: parsed.sections, sample: parsed.sample, samples: parsed.samples || (parsed.sample ? [parsed.sample] : []) }), JSON.stringify(images), now(), metadata.id);
      if (includeChinese) {
        const officialChinese = await importArchiveOfficialChinese(metadata);
        if (!officialChinese) queueArchiveTranslation(metadata.id);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "PDF 导入失败";
      console.error("archive PDF import failed", metadata.id, message);
      setArchiveStatus(metadata.id, "source_required", `官方 PDF 暂时无法导入：${message}`);
    }
  })().finally(() => {
    archiveImportJobs.delete(metadata.id);
    scheduleArchivePrewarm(250);
  });
  archiveImportJobs.set(metadata.id, job);
  return job;
}

function archiveTranslationRecords(original) {
  const records = [];
  for (const section of original.sections || []) {
    for (const block of section.blocks || []) {
      if (block.kind === "bullets") {
        for (let index = 0; index < block.items.length; index += 1) records.push({ target: block.items, key: index, text: block.items[index] });
      } else records.push({ target: block, key: "text", text: block.text });
    }
  }
  return records.filter((record) => typeof record.text === "string" && record.text.trim());
}

function maskArchiveRecord(text) {
  const formulas = [];
  const masked = String(text || "").replace(/\${3}[\s\S]*?\${3}/g, (formula) => {
    const placeholder = `ICPCMATH${formulas.length}END`;
    formulas.push({ placeholder, formula });
    return placeholder;
  });
  return { masked, formulas };
}

function restoreArchiveRecord(translated, source, formulas) {
  let restored = String(translated || "");
  for (const { placeholder, formula } of formulas) {
    const flexible = new RegExp(placeholder.replace("ICPCMATH", "ICPC\\s*MATH\\s*").replace("END", "\\s*END"), "i");
    if (!flexible.test(restored)) throw new Error(`终审译文遗漏公式 ${placeholder}`);
    restored = restored.replace(flexible, () => formula);
  }
  if (!formulasMatch(source, restored)) throw new Error("历届题面翻译改变了数学公式");
  return polishChinese(restored);
}

async function translateArchiveStatement(id) {
  const row = archiveStatementRow(id);
  const humanReviewed = Boolean(row?.translation_reviewed && row.reviewed_by && row.reviewed_by !== "official-pdf");
  if (!row?.original_json || humanReviewed || (row.chinese_json && Number(row.translation_version || 0) >= ARCHIVE_TRANSLATION_VERSION)) return;
  recentArchiveTranslationAttempts.set(id, now());
  try {
    setArchiveStatus(id, "translating", "原题面可直接阅读，中文题面正在后台生成");
    const original = safeObject(row.original_json, { sections: [] });
    const chinese = structuredClone(original);
    const records = archiveTranslationRecords(chinese);
    const masked = records.map((record) => maskArchiveRecord(record.text));
    const translated = await translateReviewedTexts([row.title_en, ...masked.map((record) => record.masked)]);
    const titleZh = translated[0] || row.title_en;
    for (let index = 0; index < records.length; index += 1) {
      records[index].target[records[index].key] = restoreArchiveRecord(translated[index + 1] || masked[index].masked, records[index].text, masked[index].formulas);
    }
    for (const section of chinese.sections || []) section.title = chineseSectionTitle(section.key);

    const images = safeImages(row.images_json);
    const ocrImages = images.filter((image) => typeof image.ocrEn === "string" && /[A-Za-z]{2}/.test(image.ocrEn));
    if (ocrImages.length) {
      const imageTranslations = await translateReviewedTexts(ocrImages.map((image) => image.ocrEn));
      for (let index = 0; index < ocrImages.length; index += 1) ocrImages[index].imageTextZh = imageTranslations[index] || null;
    }
    db.prepare(`
      UPDATE archive_statements SET title_zh=?, chinese_json=?, chinese_source_url=NULL, images_json=?, translation_version=?, translation_reviewed=0, reviewed_at=NULL, reviewed_by=NULL, status='ready', error=NULL, updated_at=? WHERE id=?
    `).run(titleZh, JSON.stringify({ sections: chinese.sections || [] }), JSON.stringify(images), ARCHIVE_TRANSLATION_VERSION, now(), id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "中文翻译失败";
    console.error("archive translation failed", id, message);
    setArchiveStatus(id, "ready_original", "原题面已就绪；中文翻译暂时不可用，将在稍后自动重试");
  }
}

function queueArchiveTranslation(id) {
  if (queuedArchiveTranslations.has(id)) return true;
  const last = recentArchiveTranslationAttempts.get(id) || 0;
  if (now() - last < 45_000) return false;
  if (queuedArchiveTranslations.size >= 24) {
    setArchiveStatus(id, "ready_original", "原题面已就绪；中文翻译队列繁忙，将在稍后重试");
    return false;
  }
  recentArchiveTranslationAttempts.set(id, now());
  queuedArchiveTranslations.add(id);
  if (recentArchiveTranslationAttempts.size > 512) pruneMap(recentArchiveTranslationAttempts, (timestamp) => now() - timestamp > 24 * 60 * 60_000, 512);
  translationQueue = translationQueue
    .catch(() => undefined)
    .then(() => translateArchiveStatement(id))
    .catch((error) => console.error("archive translation queue", error))
    .finally(() => {
      queuedArchiveTranslations.delete(id);
      scheduleArchivePrewarm(250);
    });
  return true;
}

function queueTranslation(code) {
  if (queuedTranslations.has(code)) return true;
  const last = recentTranslationAttempts.get(code) || 0;
  if (now() - last < 45_000) return false;
  if (queuedTranslations.size >= 32) {
    setStatus(code, "ready_original", "原题面已就绪；中文翻译队列繁忙，将在稍后重试");
    return false;
  }
  recentTranslationAttempts.set(code, now());
  queuedTranslations.add(code);
  if (recentTranslationAttempts.size > 512) pruneMap(recentTranslationAttempts, (timestamp) => now() - timestamp > 24 * 60 * 60_000, 512);
  translationQueue = translationQueue
    .catch(() => undefined)
    .then(() => translateStatement(code))
    .catch((error) => console.error("statement translation queue", error))
    .finally(() => queuedTranslations.delete(code));
  return true;
}

function allowImport(ip, bucket, limit) {
  return importLimiter(`${ip}:${bucket}`, limit);
}

function codeFromSourceUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    if (!/(^|\.)codeforces\.(com|org)$/.test(url.hostname.toLowerCase())) return null;
    const match = url.pathname.match(/\/(?:problem(?:set)?\/problem|gym)\/(\d+)(?:\/problem)?\/([A-Z][0-9]?)/i);
    return match ? `${match[1]}${match[2].toUpperCase()}` : null;
  } catch { return null; }
}

scheduleArchivePrewarm(1_500);

export function createStatementHandler({ json, clientIp }) {
  return async function handleStatement(request, response, url) {
    if (!url.pathname.startsWith("/codeforces/statements") && !url.pathname.startsWith("/archive/statements")) return false;
    try {
      if (request.method === "GET" && url.pathname === "/codeforces/statements/review-queue") {
        requireStatementAdmin(request);
        return json(response, 200, {
          items: statementReviewQueue(url.searchParams.get("limit")),
        }, { "Cache-Control": "no-store" }), true;
      }

      if (request.method === "POST" && url.pathname === "/archive/statements/translation-review") {
        const user = requireStatementAdmin(request);
        const body = await readJsonBody(request, { maxBytes: 2 * 1024 * 1024 });
        const contestId = String(body.contestId || "").trim().toLowerCase();
        const slot = String(body.slot || "").trim().toUpperCase();
        if (!/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/.test(contestId) || !/^[A-Z][0-9]?$/.test(slot)) {
          return json(response, 400, { error: "历届题目标识无效" }), true;
        }
        const id = `${contestId}:${slot}`;
        const row = archiveStatementRow(id);
        if (!row?.chinese_json) return json(response, 404, { error: "中文题面尚未生成，暂时无法校对" }), true;
        if (row.chinese_source_url) return json(response, 409, { error: "该题使用官方中文题册，无需覆盖官方译文" }), true;
        const current = safeObject(row.chinese_json, { sections: [] });
        const chinese = normalizeReviewedArchiveChinese(body.chinese, current);
        const titleZh = reviewedArchiveText(body.titleZh, row.title_zh || row.title_en, "中文标题").slice(0, 180);
        const images = safeImages(row.images_json);
        const submittedImages = Array.isArray(body.images) ? body.images : [];
        for (let index = 0; index < images.length; index += 1) {
          const submitted = submittedImages.find((item) => item?.assetId && item.assetId === images[index].assetId) || submittedImages[index];
          if (!submitted) continue;
          images[index].captionZh = String(submitted.captionZh || "").trim().slice(0, 500);
          images[index].imageTextZh = String(submitted.imageTextZh || "").trim().slice(0, 4_000) || null;
        }
        const timestamp = now();
        db.prepare(`UPDATE archive_statements SET title_zh=?, chinese_json=?, images_json=?, translation_version=?, translation_reviewed=1,
          reviewed_at=?, reviewed_by=?, status='ready', error=NULL, updated_at=? WHERE id=?`)
          .run(titleZh, JSON.stringify(chinese), JSON.stringify(images), ARCHIVE_TRANSLATION_VERSION, timestamp, user.email, timestamp, id);
        return json(response, 200, { statement: publicArchiveStatement(archiveStatementRow(id)) }, { "Cache-Control": "no-store" }), true;
      }

      if (url.pathname === "/archive/statements/prewarm") {
        if (request.method === "POST") {
          const rate = allowImport(clientIp(request), "archive-prewarm", 12);
          if (!rate.allowed) return json(response, 429, { error: "整场题面预热过于频繁，请稍后重试" }, { "Retry-After": String(rate.retryAfterSeconds) }), true;
          const body = await readJsonBody(request, { maxBytes: 64 * 1024 });
          return json(response, 202, { prewarm: registerArchivePrewarm(body) }, { "Cache-Control": "no-store" }), true;
        }
        if (request.method === "GET") {
          const contestId = String(url.searchParams.get("contest") || "").trim();
          if (!/^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])$/.test(contestId)) return json(response, 400, { error: "历届赛事标识无效" }), true;
          scheduleArchivePrewarm();
          return json(response, 200, { prewarm: archivePrewarmProgress(contestId) }, { "Cache-Control": "no-store" }), true;
        }
        return json(response, 405, { error: "Method not allowed" }, { Allow: "GET, POST" }), true;
      }

      const archiveAssetMatch = url.pathname.match(/^\/archive\/statements\/assets\/([a-f0-9]{64})$/);
      if (request.method === "GET" && archiveAssetMatch) {
        const asset = db.prepare("SELECT content_type, body FROM archive_statement_assets WHERE id = ?").get(archiveAssetMatch[1]);
        if (!asset) return json(response, 404, { error: "图片不存在" }), true;
        response.writeHead(200, { "Content-Type": asset.content_type, "Content-Length": asset.body.length, "Cache-Control": "public, max-age=31536000, immutable", "Content-Security-Policy": "default-src 'none'; sandbox", "X-Content-Type-Options": "nosniff" });
        response.end(asset.body);
        return true;
      }

      if (request.method === "GET" && url.pathname === "/archive/statements") {
        const metadata = normalizeArchiveMetadata(url);
        let row = archiveStatementRow(metadata.id);
        if (!row) {
          upsertArchivePending(metadata);
          void importArchiveOriginal(metadata);
          row = archiveStatementRow(metadata.id);
        } else if (!row.original_json && !archiveImportJobs.has(metadata.id)
          && (["queued", "source_required"].includes(row.status) || now() - row.updated_at > 2 * 60_000)) {
          void importArchiveOriginal(metadata);
          row = archiveStatementRow(metadata.id);
        } else if (row.original_json && !row.chinese_source_url
          && !(row.translation_reviewed && row.reviewed_by && row.reviewed_by !== "official-pdf")
          && !archiveOfficialChineseJobs.has(metadata.id)
          && now() - (recentArchiveOfficialChineseAttempts.get(metadata.id) || 0) >= 10 * 60_000) {
          void importArchiveOfficialChinese(metadata);
        } else if (row.original_json && (!row.chinese_json
          || (Number(row.translation_version || 0) < ARCHIVE_TRANSLATION_VERSION
            && !(row.translation_reviewed && row.reviewed_by && row.reviewed_by !== "official-pdf")))) {
          const queued = queueArchiveTranslation(metadata.id);
          if (queued && row.status !== "translating") {
            setArchiveStatus(metadata.id, "translating", "原题面可直接阅读，中文题面正在后台生成");
            row = archiveStatementRow(metadata.id);
          }
        }
        return json(response, row?.original_json ? 200 : 202, { statement: publicArchiveStatement(row) }, { "Cache-Control": "no-store" }), true;
      }

      const assetMatch = url.pathname.match(/^\/codeforces\/statements\/assets\/([a-f0-9]{64})$/);
      if (request.method === "GET" && assetMatch) {
        const asset = db.prepare("SELECT content_type, body FROM statement_assets WHERE id = ?").get(assetMatch[1]);
        if (!asset) return json(response, 404, { error: "图片不存在" }), true;
        response.writeHead(200, { "Content-Type": asset.content_type, "Content-Length": asset.body.length, "Cache-Control": "public, max-age=31536000, immutable", "Content-Security-Policy": "default-src 'none'; sandbox", "X-Content-Type-Options": "nosniff" });
        response.end(asset.body);
        return true;
      }

      if (request.method === "GET" && url.pathname === "/codeforces/statements") {
        const parsed = normalizeStatementCode(url.searchParams.get("code"));
        if (!parsed) return json(response, 400, { error: "题号格式无效" }), true;
        const sourceKind = normalizeStatementSource(url.searchParams.get("source"));
        let row = statementRow(parsed.code);
        if (!row) {
          upsertPending(parsed, sourceKind);
          void importOriginal(parsed, sourceKind);
          row = statementRow(parsed.code);
        } else if (row.original_html && (!row.chinese_html || Number(row.translation_version || 0) < TRANSLATION_VERSION)) {
          const queued = queueTranslation(parsed.code);
          if (queued && row.status !== "translating" && row.status !== "model_downloading") {
            setStatus(parsed.code, "translating", row.chinese_html ? "已有中文缓存可立即阅读，正在后台校对新版术语" : "正在生成中文题面");
            row = statementRow(parsed.code);
          }
        } else if (!row.original_html && row.status === "source_required"
          && (sourceKind === "gym" && row.source_kind !== "pending-gym" || now() - row.updated_at > 10 * 60_000)) {
          db.prepare("UPDATE problem_statements SET source_url = ?, source_kind = ?, status = 'importing', error = NULL, updated_at = ? WHERE code = ?")
            .run(statementSourceUrl(parsed, sourceKind), sourceKind === "gym" ? "pending-gym" : "pending", now(), parsed.code);
          void importOriginal(parsed, sourceKind);
          row = statementRow(parsed.code);
        }
        return json(response, row?.original_html ? 200 : 202, { statement: publicStatement(row) }), true;
      }

      if (request.method === "POST" && url.pathname === "/codeforces/statements/import") {
        const user = authenticateRequest(request);
        const rate = allowImport(clientIp(request), "statement", 120);
        if (!rate.allowed) return json(response, 429, { error: "本小时导入题面过多，请稍后再试" }, { "Retry-After": String(rate.retryAfterSeconds) }), true;
        const body = await readJsonBody(request, { maxBytes: 2 * 1024 * 1024 });
        const parsed = normalizeStatementCode(body.code);
        if (!parsed || codeFromSourceUrl(body.sourceUrl) !== parsed.code) return json(response, 400, { error: "题号或原题地址无效" }), true;
        const existing = statementRow(parsed.code);
        if (existing?.original_html && (user.role !== "admin" || user.must_change_password)) return json(response, 200, { statement: publicStatement(existing) }), true;
        const document = parseCodeforcesStatement(String(body.html || ""), String(body.sourceUrl), parsed.code);
        saveOriginal(document);
        if (!queueTranslation(parsed.code)) setStatus(parsed.code, "ready_original", "原题面已就绪；中文翻译将在稍后开始");
        return json(response, 201, { statement: publicStatement(statementRow(parsed.code)) }), true;
      }

      if (request.method === "POST" && url.pathname === "/codeforces/statements/translation") {
        const user = authenticateRequest(request);
        const rate = allowImport(clientIp(request), "translation", 30);
        if (!rate.allowed) return json(response, 429, { error: "本小时提交翻译过多，请稍后再试" }, { "Retry-After": String(rate.retryAfterSeconds) }), true;
        const body = await readJsonBody(request, { maxBytes: 2 * 1024 * 1024 });
        const parsed = normalizeStatementCode(body.code);
        const row = parsed ? statementRow(parsed.code) : null;
        if (!parsed || !row?.original_html) return json(response, 404, { error: "原题面尚未导入" }), true;
        const chineseHtml = sanitizeStatementHtml(String(body.chineseHtml || ""), row.source_url).html;
        if (load(chineseHtml, {}, false).text().trim().length < 20) return json(response, 400, { error: "中文题面内容为空" }), true;
        if (!formulasMatch(row.original_html, chineseHtml)) return json(response, 400, { error: "浏览器译文改变了数学公式，已拒绝保存" }), true;
        const existingImages = safeImages(row.images_json);
        const submitted = Array.isArray(body.imageTranslations) ? body.imageTranslations : [];
        for (const image of existingImages) {
          const matched = submitted.find((item) => item?.sourceUrl === image.sourceUrl && typeof item.ocrZh === "string");
          if (matched) image.ocrZh = matched.ocrZh.trim().slice(0, 4000);
        }
        if (user.role === "admin" && !user.must_change_password) {
          const timestamp = now();
          db.prepare("UPDATE problem_statements SET chinese_html = ?, translation_version = ?, translation_reviewed = 1, reviewed_at = ?, reviewed_by = ?, images_json = ?, status = 'ready', error = NULL, updated_at = ? WHERE code = ?")
            .run(chineseHtml, TRANSLATION_VERSION, timestamp, user.email, JSON.stringify(existingImages), timestamp, parsed.code);
          return json(response, 200, { statement: publicStatement(statementRow(parsed.code)) }), true;
        }
        return json(response, 200, { statement: deviceTranslationPreview(row, chineseHtml, existingImages) }), true;
      }

      return json(response, 404, { error: "Not found" }), true;
    } catch (error) {
      const exposed = publicError(error, "题面服务暂时不可用");
      if (exposed.status >= 500) console.error(new Date().toISOString(), request.method, url.pathname, error);
      return json(response, exposed.status, { error: exposed.message }), true;
    }
  };
}
