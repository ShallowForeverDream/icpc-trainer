export class HttpError extends Error {
  constructor(status, message, options = {}) {
    super(message, options);
    this.name = "HttpError";
    this.status = status;
    this.expose = options.expose ?? status < 500;
  }
}

export function boundedInteger(value, { min, max, fallback }) {
  if (value === null || value === undefined || typeof value === "string" && !value.trim()) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

export function createWindowLimiter({ windowMs, limit, maxEntries = 4096 }) {
  const windows = new Map();
  let operations = 0;

  function sweep(timestamp) {
    for (const [key, state] of windows) {
      if (timestamp - state.startedAt >= windowMs) windows.delete(key);
    }
    while (windows.size > maxEntries) windows.delete(windows.keys().next().value);
  }

  function check(keyValue, overrideLimit = limit) {
    const key = String(keyValue || "unknown");
    const timestamp = Date.now();
    operations += 1;
    if (operations % 128 === 0 || windows.size >= maxEntries) sweep(timestamp);

    const current = windows.get(key);
    if (!current || timestamp - current.startedAt >= windowMs) {
      if (!current && windows.size >= maxEntries) windows.delete(windows.keys().next().value);
      windows.set(key, { startedAt: timestamp, count: 1 });
      return { allowed: true, remaining: Math.max(0, overrideLimit - 1), retryAfterSeconds: 0 };
    }

    current.count += 1;
    const retryAfterSeconds = Math.max(1, Math.ceil((windowMs - (timestamp - current.startedAt)) / 1000));
    return {
      allowed: current.count <= overrideLimit,
      remaining: Math.max(0, overrideLimit - current.count),
      retryAfterSeconds,
    };
  }

  check.reset = (keyValue) => windows.delete(String(keyValue || "unknown"));
  check.size = () => windows.size;
  return check;
}

export function pruneMap(map, predicate, maxEntries = 512) {
  for (const [key, value] of map) if (predicate(value, key)) map.delete(key);
  while (map.size > maxEntries) map.delete(map.keys().next().value);
}

export async function readJsonBody(request, { maxBytes = 64 * 1024 } = {}) {
  const declared = Number(request.headers["content-length"] || 0);
  if (Number.isFinite(declared) && declared > maxBytes) throw new HttpError(413, "请求数据过大");
  const contentType = String(request.headers["content-type"] || "").toLowerCase();
  if (declared > 0 && !contentType.startsWith("application/json")) throw new HttpError(415, "请求必须使用 application/json");

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, "请求数据过大");
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
  } catch {
    throw new HttpError(400, "请求 JSON 无效");
  }
}

export function publicError(error, fallbackMessage = "服务暂时不可用") {
  if (error instanceof HttpError) return { status: error.status, message: error.expose ? error.message : fallbackMessage };
  return { status: 500, message: fallbackMessage };
}
