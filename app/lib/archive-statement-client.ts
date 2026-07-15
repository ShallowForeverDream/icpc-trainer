import { browserApiUrl } from "./browser-api";

export type ArchiveStatementBlock =
  | { kind: "paragraph"; text: string }
  | { kind: "bullets"; items: string[] };

export type ArchiveStatementSection = {
  key: string;
  title: string;
  blocks: ArchiveStatementBlock[];
};

export type ArchiveStatementImage = {
  src: string;
  assetId?: string;
  captionEn: string;
  captionZh: string;
  ocrEn?: string | null;
  imageTextZh?: string | null;
};

export type ArchiveExtractedStatement = {
  schemaVersion: number;
  contestId: string;
  contestName: string;
  slot: string;
  problemId: number;
  titleEn: string;
  titleZh: string;
  timeLimitText: string;
  memoryLimitText: string;
  source: {
    kind: "official-pdf-extract";
    englishPdfUrl: string;
    chinesePdfUrl: string | null;
    chinesePages: [number, number] | null;
  };
  english: { sections: ArchiveStatementSection[] };
  chinese: { sections: ArchiveStatementSection[] };
  sample: { input: string; output: string; mode: "columns" | "transcript" } | null;
  images: ArchiveStatementImage[];
  status?: "queued" | "importing" | "translating" | "ready_original" | "ready" | "source_required";
  message?: string | null;
  translationCurrent?: boolean;
  updatedAt?: string;
};

export type ArchiveStatementRequest = {
  qojContestId: number;
  problemId: number;
  contestName: string;
  title: string;
};

export type ArchivePrewarmItem = {
  slot: string;
  originalReady: boolean;
  chineseReady: boolean;
  officialChinese: boolean;
  status: string;
  message: string | null;
};

export type ArchivePrewarmProgress = {
  contestId: string;
  total: number;
  readyOriginal: number;
  readyChinese: number;
  officialChinese: number;
  failed: number;
  status: "idle" | "prewarming" | "partial" | "ready";
  progress: number;
  items: ArchivePrewarmItem[];
  updatedAt: string | null;
};

export type ArchivePrewarmRequest = {
  contestId: string;
  contestName: string;
  problems: Array<{ slot: string; qojContestId: number; problemId: number; title: string }>;
};

export class ArchiveStatementPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveStatementPendingError";
  }
}

function isArchivePrewarmProgress(value: unknown): value is ArchivePrewarmProgress {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ArchivePrewarmProgress>;
  return typeof item.contestId === "string" && Number.isInteger(item.total) && Number.isInteger(item.readyChinese)
    && ["idle", "prewarming", "partial", "ready"].includes(item.status || "") && Array.isArray(item.items);
}

async function readPrewarmResponse(response: Response) {
  const payload = await response.json().catch(() => ({})) as { prewarm?: unknown; error?: string };
  if (!response.ok) throw new Error(payload.error || `整场题面准备失败（${response.status}）`);
  if (!isArchivePrewarmProgress(payload.prewarm)) throw new Error("整场题面准备状态格式错误");
  return payload.prewarm;
}

export async function startArchivePrewarm(request: ArchivePrewarmRequest) {
  return readPrewarmResponse(await fetch(browserApiUrl("/archive/statements/prewarm"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    cache: "no-store",
  }));
}

export async function loadArchivePrewarm(contestId: string) {
  const query = new URLSearchParams({ contest: contestId });
  return readPrewarmResponse(await fetch(browserApiUrl(`/archive/statements/prewarm?${query}`), { cache: "no-store" }));
}

function isArchiveStatement(value: unknown): value is ArchiveExtractedStatement {
  if (!value || typeof value !== "object") return false;
  const statement = value as Partial<ArchiveExtractedStatement>;
  return statement.schemaVersion === 1
    && typeof statement.contestId === "string"
    && typeof statement.slot === "string"
    && typeof statement.titleEn === "string"
    && Boolean(statement.english?.sections && statement.chinese?.sections)
    && Boolean(statement.source?.englishPdfUrl);
}

export async function loadArchiveStatement(contestId: string, slot: string, request: ArchiveStatementRequest) {
  const path = `/archive-statements/${encodeURIComponent(contestId)}/${encodeURIComponent(slot)}.json`;
  const response = await fetch(path, { cache: "force-cache" });
  if (response.ok) {
    const value: unknown = await response.json();
    if (!isArchiveStatement(value)) throw new Error("结构化题面数据格式错误");
    return value;
  }

  const query = new URLSearchParams({
    contest: contestId,
    slot,
    qojContestId: String(request.qojContestId),
    problemId: String(request.problemId),
    contestName: request.contestName,
    title: request.title,
  });
  const imported = await fetch(browserApiUrl(`/archive/statements?${query}`), { cache: "no-store" });
  const payload = await imported.json().catch(() => ({})) as { statement?: unknown; error?: string };
  if (!imported.ok && imported.status !== 202) throw new Error(payload.error || `题面导入失败（${imported.status}）`);
  const value = payload.statement;
  if (!isArchiveStatement(value)) throw new Error("结构化题面数据格式错误");
  if (!value.english.sections.length) throw new ArchiveStatementPendingError(value.message || "正在从官方 PDF 提取题面");
  return {
    ...value,
    images: value.images.map((image) => ({
      ...image,
      src: image.assetId ? browserApiUrl(`/archive/statements/assets/${image.assetId}`) : image.src,
    })),
  };
}
