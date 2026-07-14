import { browserApiUrl } from "./browser-api";
import katex from "katex";

export type StatementImage = {
  sourceUrl: string;
  alt?: string;
  title?: string;
  assetId?: string;
  contentType?: string;
  ocrEn?: string;
  ocrZh?: string;
  error?: string;
};

export type CachedStatement = {
  code: string;
  contestId: number;
  index: string;
  title: string;
  timeLimitText: string;
  memoryLimitText: string;
  sourceUrl: string;
  sourceKind: "codeforces" | "codeforces-dataset" | "pending" | string;
  originalHtml: string | null;
  chineseHtml: string | null;
  translationVersion: number;
  translationCurrent: boolean;
  revalidating: boolean;
  images: StatementImage[];
  status: "importing" | "source_required" | "model_downloading" | "translating" | "ready_original" | "ready" | string;
  message: string | null;
  updatedAt: string;
};

type StatementPayload = { statement?: CachedStatement; error?: string };

async function statementRequest(path: string, init?: RequestInit) {
  const response = await fetch(browserApiUrl(path), init);
  const payload = await response.json().catch(() => ({})) as StatementPayload;
  if (!response.ok && response.status !== 202) throw new Error(payload.error || `题面服务 HTTP ${response.status}`);
  if (!payload.statement) throw new Error(payload.error || "题面服务没有返回数据");
  return payload.statement;
}

export function loadStatement(code: string) {
  return statementRequest(`/codeforces/statements?code=${encodeURIComponent(code)}`, { cache: "no-store" });
}

export function importStatementSource(code: string, sourceUrl: string, html: string) {
  return statementRequest("/codeforces/statements/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, sourceUrl, html }),
  });
}

export function submitBrowserTranslation(code: string, chineseHtml: string, images: StatementImage[]) {
  return statementRequest("/codeforces/statements/translation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      chineseHtml,
      imageTranslations: images.filter((image) => image.ocrZh).map(({ sourceUrl, ocrZh }) => ({ sourceUrl, ocrZh })),
    }),
  });
}

type ExtensionResult = { ok?: boolean; html?: string; url?: string; error?: string };

export function fetchStatementViaExtension(url: string, timeoutMs = 15_000) {
  return new Promise<{ html: string; url: string }>((resolve, reject) => {
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("未检测到浏览器扩展；请安装或更新至 v0.3 后重试"));
    }, timeoutMs);

    function onMessage(event: MessageEvent) {
      if (event.source !== window || event.origin !== window.location.origin) return;
      const message = event.data as { source?: string; type?: string; requestId?: string; result?: ExtensionResult };
      if (message?.source !== "icpc-trainer-extension" || message.type !== "ICPC_TRAINER_STATEMENT_RESULT" || message.requestId !== requestId) return;
      window.clearTimeout(timeout);
      window.removeEventListener("message", onMessage);
      const result = message.result;
      if (!result?.ok || !result.html || !result.url) reject(new Error(result?.error || "扩展未能读取 Codeforces 原题"));
      else resolve({ html: result.html, url: result.url });
    }

    window.addEventListener("message", onMessage);
    window.postMessage({ source: "icpc-trainer", type: "ICPC_TRAINER_FETCH_STATEMENT", requestId, url }, window.location.origin);
  });
}

export function statementHtmlForDisplay(html: string, images: StatementImage[], language: "original" | "chinese") {
  if (typeof DOMParser === "undefined") return html;
  const document = new DOMParser().parseFromString(`<div id="statement-view-root">${html}</div>`, "text/html");
  const root = document.querySelector<HTMLElement>("#statement-view-root");
  if (!root) return html;
  const imageMap = new Map(images.map((image) => [image.sourceUrl, image]));

  root.querySelectorAll<HTMLElement>(".tex-span").forEach((element) => {
    const raw = element.textContent?.trim() || "";
    const expression = raw.replace(/^\${3}/, "").replace(/\${3}$/, "").trim();
    if (!expression) return;
    element.innerHTML = katex.renderToString(expression, { throwOnError: false, strict: "ignore", output: "htmlAndMathml" });
    element.classList.add("tex-rendered");
    element.setAttribute("aria-label", expression);
  });

  const textNodes: Text[] = [];
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let current = walker.nextNode();
  while (current) {
    const text = current as Text;
    if (text.data.includes("$$$") && !text.parentElement?.closest("pre, code, .tex-span, .katex")) textNodes.push(text);
    current = walker.nextNode();
  }
  for (const text of textNodes) {
    const matches = [...text.data.matchAll(/\${3}([\s\S]+?)\${3}/g)];
    if (!matches.length) continue;
    const fragment = document.createDocumentFragment();
    let offset = 0;
    for (const match of matches) {
      const index = match.index ?? 0;
      fragment.append(document.createTextNode(text.data.slice(offset, index)));
      const span = document.createElement("span");
      span.className = "tex-span tex-rendered";
      span.innerHTML = katex.renderToString(match[1].trim(), { throwOnError: false, strict: "ignore", output: "htmlAndMathml" });
      fragment.append(span);
      offset = index + match[0].length;
    }
    fragment.append(document.createTextNode(text.data.slice(offset)));
    text.replaceWith(fragment);
  }

  root.querySelectorAll<HTMLImageElement>("img").forEach((element) => {
    const sourceUrl = element.getAttribute("src") || "";
    const image = imageMap.get(sourceUrl);
    if (!image) return;
    if (image.assetId) element.src = browserApiUrl(`/codeforces/statements/assets/${image.assetId}`);
    if (language === "chinese" && image.ocrZh) {
      const caption = document.createElement("div");
      caption.className = "image-translation";
      const label = document.createElement("b");
      label.textContent = "图片文字翻译";
      const text = document.createElement("p");
      text.textContent = image.ocrZh;
      caption.append(label, text);
      element.insertAdjacentElement("afterend", caption);
    }
  });
  return root.innerHTML;
}

type TranslationAvailability = "unavailable" | "downloadable" | "downloading" | "available";
type TranslatorMonitor = { addEventListener(type: "downloadprogress", listener: (event: { loaded: number }) => void): void };
type TranslatorSession = { translate(text: string): Promise<string>; destroy?(): void };
type TranslatorFactory = {
  availability(options: { sourceLanguage: "en"; targetLanguage: "zh" }): Promise<TranslationAvailability>;
  create(options: { sourceLanguage: "en"; targetLanguage: "zh"; monitor?: (monitor: TranslatorMonitor) => void }): Promise<TranslatorSession>;
};

declare global {
  interface Window { Translator?: TranslatorFactory }
}

function textNodesForTranslation(root: HTMLElement) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const parent = text.parentElement;
    if (parent && !parent.closest("pre, code, .tex-span") && /[A-Za-z]{2}/.test(text.data.trim())) nodes.push(text);
    node = walker.nextNode();
  }
  return nodes;
}

function maskFormulaText(raw: string) {
  const formulas: Array<{ placeholder: string; formula: string }> = [];
  const masked = raw.replace(/\${3}[\s\S]*?\${3}/g, (formula) => {
    const placeholder = `ICPCMATH${formulas.length}END`;
    formulas.push({ placeholder, formula });
    return placeholder;
  });
  return { masked, formulas };
}

function restoreFormulaText(translated: string, formulas: Array<{ placeholder: string; formula: string }>) {
  let restored = translated;
  for (const { placeholder, formula } of formulas) {
    const flexiblePlaceholder = new RegExp(placeholder.replace("ICPCMATH", "ICPC\\s*MATH\\s*").replace("END", "\\s*END"), "i");
    if (!flexiblePlaceholder.test(restored)) throw new Error(`浏览器翻译未保留公式占位符 ${placeholder}`);
    restored = restored.replace(flexiblePlaceholder, formula);
  }
  return restored;
}

export async function translateStatementInBrowser(
  originalHtml: string,
  images: StatementImage[],
  onProgress: (message: string) => void,
) {
  const factory = window.Translator;
  if (!factory) throw new Error("当前浏览器不支持 Chrome 本地 Translator API；服务器会继续后台翻译");
  const availability = await factory.availability({ sourceLanguage: "en", targetLanguage: "zh" });
  if (availability === "unavailable") throw new Error("当前设备没有可用的英译中本地模型");
  onProgress(availability === "available" ? "正在使用浏览器本地模型翻译" : "正在下载浏览器本地翻译模型");
  const translator = await factory.create({
    sourceLanguage: "en",
    targetLanguage: "zh",
    monitor(monitor) {
      monitor.addEventListener("downloadprogress", (event) => onProgress(`正在下载浏览器本地模型 ${Math.round(event.loaded * 100)}%`));
    },
  });

  try {
    const document = new DOMParser().parseFromString(`<div id="browser-translation-root">${originalHtml}</div>`, "text/html");
    const root = document.querySelector<HTMLElement>("#browser-translation-root");
    if (!root) throw new Error("原题面结构无效");
    const nodes = textNodesForTranslation(root);
    const records = nodes
      .filter((node) => /[A-Za-z]{2}/.test(node.data.replace(/\${3}[\s\S]*?\${3}/g, "")))
      .map((node) => ({ node, raw: node.data, ...maskFormulaText(node.data) }));
    const unique = [...new Set(records.map((record) => record.masked.trim()))];
    const translated = new Map<string, string>();
    for (let index = 0; index < unique.length; index += 1) {
      onProgress(`浏览器本地翻译 ${index + 1} / ${unique.length}`);
      translated.set(unique[index], await translator.translate(unique[index]));
    }
    for (const record of records) {
      const masked = record.masked.trim();
      const restored = restoreFormulaText(translated.get(masked) || masked, record.formulas);
      record.node.data = `${record.raw.match(/^\s*/)?.[0] || ""}${restored.trim()}${record.raw.match(/\s*$/)?.[0] || ""}`;
    }

    const translatedImages: StatementImage[] = [];
    for (const image of images) {
      if (!image.ocrEn || image.ocrZh) { translatedImages.push(image); continue; }
      onProgress("正在翻译图片中的英文");
      translatedImages.push({ ...image, ocrZh: await translator.translate(image.ocrEn) });
    }
    return { chineseHtml: root.innerHTML, images: translatedImages };
  } finally {
    translator.destroy?.();
  }
}
