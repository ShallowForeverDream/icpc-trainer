export const REQUIRED_BACKEND = {
  api: 14,
  statementTranslation: 23,
  archiveStatementTranslation: 5,
} as const;

export type BackendVersions = {
  api?: number;
  revision?: string;
  statementTranslation?: number;
  archiveStatementTranslation?: number;
};

export function backendIsCurrent(versions?: BackendVersions) {
  return Boolean(versions
    && Number(versions.api) >= REQUIRED_BACKEND.api
    && Number(versions.statementTranslation) >= REQUIRED_BACKEND.statementTranslation
    && Number(versions.archiveStatementTranslation) >= REQUIRED_BACKEND.archiveStatementTranslation
    && typeof versions.revision === "string"
    && versions.revision.length >= 7
    && versions.revision !== "local");
}

export function backendVersionText(versions?: BackendVersions) {
  if (!versions) return "未返回版本信息";
  const revision = versions.revision && versions.revision !== "local" ? ` · ${versions.revision.slice(0, 7)}` : "";
  return `API v${versions.api ?? "?"} · 题面 ${versions.statementTranslation ?? "?"}/${versions.archiveStatementTranslation ?? "?"}${revision}`;
}
