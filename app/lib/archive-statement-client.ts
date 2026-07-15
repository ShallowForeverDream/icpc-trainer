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
  captionEn: string;
  captionZh: string;
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
    chinesePdfUrl: string;
    chinesePages: [number, number];
  };
  english: { sections: ArchiveStatementSection[] };
  chinese: { sections: ArchiveStatementSection[] };
  sample: { input: string; output: string; mode: "columns" | "transcript" } | null;
  images: ArchiveStatementImage[];
};

function isArchiveStatement(value: unknown): value is ArchiveExtractedStatement {
  if (!value || typeof value !== "object") return false;
  const statement = value as Partial<ArchiveExtractedStatement>;
  return statement.schemaVersion === 1
    && typeof statement.contestId === "string"
    && typeof statement.slot === "string"
    && typeof statement.titleEn === "string"
    && Boolean(statement.english?.sections && statement.chinese?.sections)
    && Boolean(statement.source?.englishPdfUrl && statement.source?.chinesePdfUrl);
}

export async function loadArchiveStatement(contestId: string, slot: string) {
  const path = `/archive-statements/${encodeURIComponent(contestId)}/${encodeURIComponent(slot)}.json`;
  const response = await fetch(path, { cache: "force-cache" });
  if (!response.ok) throw new Error("这道题的结构化题面尚未导入");
  const value: unknown = await response.json();
  if (!isArchiveStatement(value)) throw new Error("结构化题面数据格式错误");
  return value;
}
