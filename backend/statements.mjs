import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdirSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { promisify } from "node:util";
import { DatabaseSync } from "node:sqlite";
import { load } from "cheerio";
import { datasetRowToStatement, normalizeStatementCode, parseCodeforcesStatement, sanitizeStatementHtml } from "./statement-parser.mjs";

const execFileAsync = promisify(execFile);
const DB_PATH = process.env.DB_PATH || "/data/icpc-trainer.sqlite";
const TRANSLATOR_BASE_URL = String(process.env.TRANSLATOR_BASE_URL || process.env.OLLAMA_BASE_URL || "").replace(/\/$/, "");
const TRANSLATOR_MODEL = process.env.TRANSLATOR_MODEL || "qwen2.5-1.5b-instruct";
const TRANSLATION_VERSION = 3;
const USER_AGENT = "icpc-trainer-statement-importer/0.3 (+https://icpc-lab-trainer.zhuj7933.chatgpt.site)";
const importJobs = new Map();
const recentTranslationAttempts = new Map();
const importWindows = new Map();
let translationQueue = Promise.resolve();
let modelReadyPromise = null;

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
`);
if (!db.prepare("PRAGMA table_info(problem_statements)").all().some((column) => column.name === "translation_version")) db.exec("ALTER TABLE problem_statements ADD COLUMN translation_version INTEGER NOT NULL DEFAULT 0");

const now = () => Date.now();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

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
    chineseHtml: Number(row.translation_version || 0) >= TRANSLATION_VERSION ? row.chinese_html || null : null,
    translationVersion: Number(row.translation_version || 0),
    images: safeImages(row.images_json),
    status: row.status,
    message: row.error || null,
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function upsertPending(parsed) {
  const timestamp = now();
  db.prepare(`
    INSERT INTO problem_statements (code, contest_id, problem_index, status, created_at, updated_at)
    VALUES (?, ?, ?, 'importing', ?, ?)
    ON CONFLICT(code) DO NOTHING
  `).run(parsed.code, parsed.contestId, parsed.index, timestamp, timestamp);
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
      chinese_html=NULL,
      translation_version=0,
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
    const response = await fetch(url, {
      redirect: "follow",
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml", "Accept-Language": "en-US,en;q=0.9" },
      signal: controller.signal,
    });
    const text = await response.text();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return { text, finalUrl: response.url };
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
      const response = await fetch(`https://datasets-server.huggingface.co/filter?dataset=open-r1/codeforces&config=default&split=${split}&length=1&where=${where}`, { headers: { "User-Agent": USER_AGENT }, signal: controller.signal });
      clearTimeout(timeout);
      if (!response.ok) continue;
      const payload = await response.json();
      if (payload.rows?.[0]?.row) return payload.rows[0].row;
    } catch {
      // Continue to the next split or the browser extension fallback.
    }
  }
  return null;
}

async function importOriginal(parsed) {
  if (importJobs.has(parsed.code)) return importJobs.get(parsed.code);
  const job = (async () => {
    setStatus(parsed.code, "importing");
    const urls = [
      `https://codeforces.com/problemset/problem/${parsed.contestId}/${parsed.index}?locale=en`,
      `https://mirror.codeforces.com/problemset/problem/${parsed.contestId}/${parsed.index}?locale=en`,
    ];
    for (const url of urls) {
      try {
        const page = await fetchText(url);
        const document = parseCodeforcesStatement(page.text, page.finalUrl, parsed.code);
        saveOriginal(document);
        queueTranslation(parsed.code);
        return document;
      } catch {
        // Codeforces may challenge datacenter IPs. The extension and dataset fallbacks handle this.
      }
    }
    const row = await fetchDatasetRow(parsed);
    if (row) {
      const document = datasetRowToStatement(row, parsed.code);
      saveOriginal(document);
      queueTranslation(parsed.code);
      return document;
    }
    setStatus(parsed.code, "source_required", "需要浏览器扩展读取 Codeforces 原题面");
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

async function ensureTranslationModel(code) {
  if (modelReadyPromise) return modelReadyPromise;
  modelReadyPromise = (async () => {
    setStatus(code, "model_downloading", `首次使用正在下载或载入本地翻译模型 ${TRANSLATOR_MODEL}`);
    for (let attempt = 0; attempt < 180; attempt += 1) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8_000);
        const response = await fetch(`${TRANSLATOR_BASE_URL}/health`, { signal: controller.signal });
        clearTimeout(timeout);
        if (response.ok) return true;
      } catch {
        // llama.cpp downloads and loads the GGUF model during its first start.
      }
      await new Promise((resolve) => setTimeout(resolve, 10_000));
    }
    throw new Error("本地翻译模型启动超时");
  })().catch((error) => {
    modelReadyPromise = null;
    throw error;
  });
  return modelReadyPromise;
}

function parseModelJson(value) {
  const text = String(value || "").trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("翻译模型返回格式无效");
  return JSON.parse(text.slice(start, end + 1));
}

async function translateChunk(texts) {
  const prompt = [
    "你是 QOJ / 洛谷风格的中文竞赛题面编辑，不做逐词直译。请把下面 JSON 数组中的每一项改写为准确、自然、简洁的简体中文题面。",
    "先理解整句逻辑，再按中文语序表达；不得解题、删减条件或补充信息。所有量词、奇偶性、上下界、先后顺序和充分必要关系必须准确。",
    "术语统一：array=数组，index=下标，segment/subarray=区间/子数组，operation=操作，query=询问，positive integer=正整数，print/output=输出，input=输入，distinct=互不相同，at most=至多，at least=至少。禁止使用“阵列”“键入”“您”。",
    "变量名、数字、公式、数学符号、代码标识符以及要求原样输出的 YES/NO 等字面量保持不变。",
    "只返回一个 JSON 对象，格式必须为 {\"translations\":[\"中文译文\"]}；条目数量和顺序必须与输入完全一致。",
    "示例：输入 [\"You are given an array a of n integers. Perform the following operation any number of times.\"]，输出 {\"translations\":[\"给定一个长度为 n 的整数数组 a。你可以进行任意次下述操作。\"]}",
    `输入：${JSON.stringify(texts)}`,
  ].join("\n");
  const payload = await translatorFetch("/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: TRANSLATOR_MODEL,
      temperature: 0,
      max_tokens: 3500,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: "你是严谨的中文算法竞赛题面编辑。译文应像人工校对后的 QOJ 中文题面，术语统一、语序自然、语义精确，禁止生硬逐词直译。" },
        { role: "user", content: prompt },
      ],
    }),
  }, 5 * 60_000);
  const parsed = parseModelJson(payload.choices?.[0]?.message?.content);
  if (!Array.isArray(parsed.translations) || parsed.translations.length !== texts.length || parsed.translations.some((item) => typeof item !== "string")) throw new Error("翻译模型返回条目数不一致");
  return parsed.translations.map(polishChinese);
}

function polishChinese(value) {
  return String(value)
    .replaceAll("阵列", "数组")
    .replaceAll("键入", "输入")
    .replaceAll("索引", "下标")
    .replace(/执行以下操作任意次数/g, "进行任意次下述操作")
    .replace(/执行任意次数的以下操作/g, "进行任意次下述操作")
    .replace(/您/g, "你")
    .replace(/\s+([，。；：！？])/g, "$1")
    .trim();
}

async function translateTexts(texts) {
  const translated = [];
  for (let offset = 0; offset < texts.length;) {
    let size = 0;
    let end = offset;
    while (end < texts.length && end - offset < 8 && size + texts[end].length < 2400) {
      size += texts[end].length;
      end += 1;
    }
    if (end === offset) end += 1;
    const chunk = texts.slice(offset, end);
    try {
      translated.push(...await translateChunk(chunk));
    } catch (error) {
      if (chunk.length === 1) throw error;
      for (const item of chunk) translated.push(...await translateChunk([item]));
    }
    offset = end;
  }
  return translated;
}

async function translateHtml(originalHtml, sourceUrl) {
  const $ = load(`<div id="translation-root">${originalHtml}</div>`, { xmlMode: false }, false);
  const fixedHeadings = new Map([["input", "输入"], ["output", "输出"], ["example", "样例"], ["examples", "样例"], ["note", "说明"], ["interaction", "交互说明"]]);
  $("#translation-root .section-title").each((_, element) => {
    const translated = fixedHeadings.get($(element).text().trim().toLowerCase());
    if (translated) $(element).text(translated);
  });
  const records = [];
  $("#translation-root").find("*").contents().each((_, node) => {
    if (node.type !== "text") return;
    if ($(node).parents("pre, code, .tex-span, .section-title").length) return;
    const raw = node.data || "";
    const segments = raw.split(/(\${3}[\s\S]*?\${3})/g).map((value, index) => ({
      value,
      formula: index % 2 === 1,
      trimmed: value.trim(),
    }));
    if (!segments.some((segment) => !segment.formula && /[A-Za-z]{2}/.test(segment.trimmed))) return;
    records.push({ node, segments });
  });
  const unique = [...new Set(records.flatMap((record) => record.segments
    .filter((segment) => !segment.formula && /[A-Za-z]{2}/.test(segment.trimmed))
    .map((segment) => segment.trimmed)))];
  const translations = await translateTexts(unique);
  const map = new Map(unique.map((item, index) => [item, translations[index]]));
  for (const record of records) {
    record.node.data = record.segments.map((segment) => {
      if (segment.formula || !/[A-Za-z]{2}/.test(segment.trimmed)) return segment.value;
      const prefix = segment.value.match(/^\s*/)?.[0] || "";
      const suffix = segment.value.match(/\s*$/)?.[0] || "";
      return `${prefix}${map.get(segment.trimmed) || segment.trimmed}${suffix}`;
    }).join("");
  }
  return sanitizeStatementHtml($("#translation-root").html() || "", sourceUrl).html;
}

async function downloadImage(image, code) {
  const existing = db.prepare("SELECT id, content_type FROM statement_assets WHERE source_url = ? AND code = ? LIMIT 1").get(image.sourceUrl, code);
  if (existing) return { ...image, assetId: existing.id, contentType: existing.content_type };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(image.sourceUrl, { headers: { "User-Agent": USER_AGENT, Referer: `https://codeforces.com/problemset/problem/${code.replace(/([A-Z])/, "/$1")}` }, signal: controller.signal });
    if (!response.ok) throw new Error(`图片 HTTP ${response.status}`);
    const contentType = String(response.headers.get("content-type") || "").split(";")[0].toLowerCase();
    if (!contentType.startsWith("image/")) throw new Error("资源不是图片");
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!buffer.length || buffer.length > 6 * 1024 * 1024) throw new Error("图片大小超出限制");
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
  try {
    setStatus(code, "translating", "正在缓存题面图片并识别其中的英文");
    const originalImages = safeImages(row.images_json);
    const images = [];
    for (const image of originalImages.slice(0, 20)) {
      try { images.push(await downloadImage(image, code)); }
      catch (error) { images.push({ ...image, error: error instanceof Error ? error.message : "图片缓存失败" }); }
    }
    db.prepare("UPDATE problem_statements SET images_json = ?, updated_at = ? WHERE code = ?").run(JSON.stringify(images), now(), code);
    await ensureTranslationModel(code);
    setStatus(code, "translating", "正在生成中文题面并翻译图片文字");
    const ocrTexts = images.filter((item) => item.ocrEn).map((item) => item.ocrEn);
    if (ocrTexts.length) {
      const ocrTranslations = await translateTexts(ocrTexts);
      let index = 0;
      for (const image of images) if (image.ocrEn) image.ocrZh = ocrTranslations[index++];
    }
    const chineseHtml = await translateHtml(row.original_html, row.source_url);
    db.prepare("UPDATE problem_statements SET chinese_html = ?, translation_version = ?, images_json = ?, status = 'ready', error = NULL, updated_at = ? WHERE code = ?").run(chineseHtml, TRANSLATION_VERSION, JSON.stringify(images), now(), code);
  } catch (error) {
    const message = error instanceof Error ? error.message : "中文翻译失败";
    setStatus(code, "ready_original", `原题面已就绪；中文翻译稍后重试：${message}`);
  }
}

function queueTranslation(code) {
  const last = recentTranslationAttempts.get(code) || 0;
  if (now() - last < 45_000) return;
  recentTranslationAttempts.set(code, now());
  translationQueue = translationQueue.then(() => translateStatement(code)).catch((error) => console.error("statement translation queue", error));
}

function allowImport(ip, bucket, limit) {
  const key = `${ip}:${bucket}`;
  const timestamp = now();
  const current = importWindows.get(key);
  if (!current || timestamp - current.startedAt > 60 * 60_000) {
    importWindows.set(key, { startedAt: timestamp, count: 1 });
    return true;
  }
  current.count += 1;
  return current.count <= limit;
}

async function readJsonBody(request, maxBytes = 2 * 1024 * 1024) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error("题面数据过大"), { status: 413 });
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
  catch { throw Object.assign(new Error("请求 JSON 无效"), { status: 400 }); }
}

function codeFromSourceUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    if (!/(^|\.)codeforces\.(com|org)$/.test(url.hostname.toLowerCase())) return null;
    const match = url.pathname.match(/\/problem(?:set)?\/problem\/(\d+)\/([A-Z][0-9]?)/i);
    return match ? `${match[1]}${match[2].toUpperCase()}` : null;
  } catch { return null; }
}

export function createStatementHandler({ json, clientIp }) {
  return async function handleStatement(request, response, url) {
    if (!url.pathname.startsWith("/codeforces/statements")) return false;
    try {
      const assetMatch = url.pathname.match(/^\/codeforces\/statements\/assets\/([a-f0-9]{64})$/);
      if (request.method === "GET" && assetMatch) {
        const asset = db.prepare("SELECT content_type, body FROM statement_assets WHERE id = ?").get(assetMatch[1]);
        if (!asset) return json(response, 404, { error: "图片不存在" }), true;
        response.writeHead(200, { "Content-Type": asset.content_type, "Content-Length": asset.body.length, "Cache-Control": "public, max-age=31536000, immutable", "X-Content-Type-Options": "nosniff" });
        response.end(asset.body);
        return true;
      }

      if (request.method === "GET" && url.pathname === "/codeforces/statements") {
        const parsed = normalizeStatementCode(url.searchParams.get("code"));
        if (!parsed) return json(response, 400, { error: "题号格式无效" }), true;
        let row = statementRow(parsed.code);
        if (!row) {
          upsertPending(parsed);
          void importOriginal(parsed);
          row = statementRow(parsed.code);
        } else if (row.original_html && (!row.chinese_html || Number(row.translation_version || 0) < TRANSLATION_VERSION)) {
          if (row.status === "ready") setStatus(parsed.code, "translating", "正在按新版术语规范重新校对中文题面");
          queueTranslation(parsed.code);
        } else if (!row.original_html && row.status === "source_required" && now() - row.updated_at > 10 * 60_000) {
          void importOriginal(parsed);
        }
        return json(response, row?.original_html ? 200 : 202, { statement: publicStatement(row) }), true;
      }

      if (request.method === "POST" && url.pathname === "/codeforces/statements/import") {
        if (!allowImport(clientIp(request), "statement", 120)) return json(response, 429, { error: "本小时导入题面过多，请稍后再试" }), true;
        const body = await readJsonBody(request);
        const parsed = normalizeStatementCode(body.code);
        if (!parsed || codeFromSourceUrl(body.sourceUrl) !== parsed.code) return json(response, 400, { error: "题号或原题地址无效" }), true;
        const document = parseCodeforcesStatement(String(body.html || ""), String(body.sourceUrl), parsed.code);
        saveOriginal(document);
        queueTranslation(parsed.code);
        return json(response, 201, { statement: publicStatement(statementRow(parsed.code)) }), true;
      }

      if (request.method === "POST" && url.pathname === "/codeforces/statements/translation") {
        if (!allowImport(clientIp(request), "translation", 30)) return json(response, 429, { error: "本小时提交翻译过多，请稍后再试" }), true;
        const body = await readJsonBody(request);
        const parsed = normalizeStatementCode(body.code);
        const row = parsed ? statementRow(parsed.code) : null;
        if (!parsed || !row?.original_html) return json(response, 404, { error: "原题面尚未导入" }), true;
        const chineseHtml = sanitizeStatementHtml(String(body.chineseHtml || ""), row.source_url).html;
        if (load(chineseHtml, {}, false).text().trim().length < 20) return json(response, 400, { error: "中文题面内容为空" }), true;
        const existingImages = safeImages(row.images_json);
        const submitted = Array.isArray(body.imageTranslations) ? body.imageTranslations : [];
        for (const image of existingImages) {
          const matched = submitted.find((item) => item?.sourceUrl === image.sourceUrl && typeof item.ocrZh === "string");
          if (matched) image.ocrZh = matched.ocrZh.trim().slice(0, 4000);
        }
        db.prepare("UPDATE problem_statements SET chinese_html = ?, translation_version = ?, images_json = ?, status = 'ready', error = NULL, updated_at = ? WHERE code = ?").run(chineseHtml, TRANSLATION_VERSION, JSON.stringify(existingImages), now(), parsed.code);
        return json(response, 200, { statement: publicStatement(statementRow(parsed.code)) }), true;
      }

      return json(response, 404, { error: "Not found" }), true;
    } catch (error) {
      const status = Number(error?.status) || 502;
      console.error(new Date().toISOString(), request.method, url.pathname, error);
      return json(response, status, { error: error instanceof Error ? error.message : "题面服务异常" }), true;
    }
  };
}
