import { browserApiUrl } from "./browser-api";
import { authFetch } from "./auth-client";
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
  translationReviewed?: boolean;
  translationReviewedAt?: string | null;
  revalidating: boolean;
  images: StatementImage[];
  status: "importing" | "source_required" | "model_downloading" | "translating" | "ready_original" | "ready" | string;
  message: string | null;
  cacheScope?: "shared" | "device";
  updatedAt: string;
};

type StatementPayload = { statement?: CachedStatement; error?: string };

const DEVICE_TRANSLATION_PREFIX = "icpc-trainer-device-translation:";

function statementSignature(statement: Pick<CachedStatement, "code" | "originalHtml">) {
  const source = `${statement.code}:${statement.originalHtml || ""}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) hash = Math.imul(hash ^ source.charCodeAt(index), 16777619);
  return (hash >>> 0).toString(16);
}

function clearDeviceTranslation(code: string) {
  try { localStorage.removeItem(`${DEVICE_TRANSLATION_PREFIX}${code}`); } catch { /* storage may be unavailable */ }
}

function saveDeviceTranslation(statement: CachedStatement) {
  if (!statement.chineseHtml || statement.chineseHtml.length > 1_500_000) return;
  try {
    localStorage.setItem(`${DEVICE_TRANSLATION_PREFIX}${statement.code}`, JSON.stringify({
      chineseHtml: statement.chineseHtml,
      images: statement.images,
      signature: statementSignature(statement),
      savedAt: Date.now(),
    }));
  } catch {
    // Private browsing and full storage quotas should not break statement reading.
  }
}

export function cacheBrowserTranslation(
  statement: CachedStatement,
  chineseHtml: string,
  images: StatementImage[],
): CachedStatement {
  const preview: CachedStatement = {
    ...statement,
    chineseHtml,
    images,
    status: "ready_preview",
    message: "中文题面已保存在当前设备",
    cacheScope: "device",
    revalidating: false,
  };
  saveDeviceTranslation(preview);
  return preview;
}

function withDeviceTranslation(statement: CachedStatement) {
  if (statement.translationCurrent) {
    clearDeviceTranslation(statement.code);
    return statement;
  }
  try {
    const raw = localStorage.getItem(`${DEVICE_TRANSLATION_PREFIX}${statement.code}`);
    if (!raw) return statement;
    const cached = JSON.parse(raw) as { chineseHtml?: string; images?: StatementImage[]; signature?: string; savedAt?: number };
    if (!cached.chineseHtml || cached.signature !== statementSignature(statement) || Date.now() - Number(cached.savedAt || 0) > 30 * 24 * 60 * 60_000) {
      clearDeviceTranslation(statement.code);
      return statement;
    }
    return {
      ...statement,
      chineseHtml: cached.chineseHtml,
      images: Array.isArray(cached.images) ? cached.images : statement.images,
      revalidating: false,
      status: "ready_preview",
      message: "正在显示当前设备保存的中文译文；服务器译文完成后会自动替换",
      cacheScope: "device" as const,
    };
  } catch {
    clearDeviceTranslation(statement.code);
    return statement;
  }
}

async function statementRequest(path: string, init?: RequestInit, authenticated = false) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), init?.method === "POST" ? 35_000 : 20_000);
  let response: Response;
  try {
    const requestInit = { ...init, signal: init?.signal || controller.signal };
    response = authenticated ? await authFetch(path, requestInit, init?.method === "POST" ? 35_000 : 20_000) : await fetch(browserApiUrl(path), requestInit);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new Error("题面服务响应超时，请稍后重试");
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
  const payload = await response.json().catch(() => ({})) as StatementPayload;
  if (!response.ok && response.status !== 202) {
    if (response.status === 401) throw new Error("请先登录后使用浏览器扩展或本地翻译");
    throw new Error(payload.error || `题面服务 HTTP ${response.status}`);
  }
  if (!payload.statement) throw new Error(payload.error || "题面服务没有返回数据");
  return payload.statement;
}

export async function loadStatement(code: string, source: "problemset" | "gym" = "problemset") {
  return withDeviceTranslation(await statementRequest(`/codeforces/statements?code=${encodeURIComponent(code)}&source=${source}`, { cache: "no-store" }));
}

export function importStatementSource(code: string, sourceUrl: string, html: string) {
  return statementRequest("/codeforces/statements/import", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code, sourceUrl, html }),
  }, true);
}

export async function submitBrowserTranslation(code: string, chineseHtml: string, images: StatementImage[]) {
  const statement = await statementRequest("/codeforces/statements/translation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      code,
      chineseHtml,
      imageTranslations: images.filter((image) => image.ocrZh).map(({ sourceUrl, ocrZh }) => ({ sourceUrl, ocrZh })),
    }),
  }, true);
  if (statement.cacheScope === "device") saveDeviceTranslation(statement);
  else clearDeviceTranslation(statement.code);
  return statement;
}

type ExtensionResult = { ok?: boolean; html?: string; url?: string; error?: string };

export function fetchStatementViaExtension(url: string, timeoutMs = 15_000) {
  return new Promise<{ html: string; url: string }>((resolve, reject) => {
    const requestId = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
    const timeout = window.setTimeout(() => {
      window.removeEventListener("message", onMessage);
      reject(new Error("未检测到浏览器扩展；请安装或更新至 v0.6 后重试"));
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

  root.querySelectorAll<HTMLElement>(".sample-test .input, .sample-test .output").forEach((sample, index) => {
    const pre = sample.querySelector("pre");
    if (!pre) return;
    let heading = sample.querySelector<HTMLElement>(":scope > .section-title");
    if (!heading) {
      heading = document.createElement("div");
      heading.className = "section-title";
      heading.textContent = sample.classList.contains("input") ? (language === "chinese" ? "输入" : "Input") : (language === "chinese" ? "输出" : "Output");
      sample.prepend(heading);
    }
    const button = document.createElement("button");
    button.type = "button";
    button.className = "sample-copy";
    button.dataset.sampleCopy = String(index);
    button.textContent = language === "chinese" ? "复制" : "Copy";
    heading.append(button);
  });
  return root.innerHTML;
}

export type TranslationAvailability = "unavailable" | "downloadable" | "downloading" | "available";
type TranslatorMonitor = { addEventListener(type: "downloadprogress", listener: (event: { loaded: number }) => void): void };
type TranslatorSession = { translate(text: string): Promise<string>; destroy?(): void };
type TranslatorFactory = {
  availability(options: { sourceLanguage: "en"; targetLanguage: "zh" }): Promise<TranslationAvailability>;
  create(options: { sourceLanguage: "en"; targetLanguage: "zh"; monitor?: (monitor: TranslatorMonitor) => void }): Promise<TranslatorSession>;
};

declare global {
  interface Window { Translator?: TranslatorFactory }
}

export async function browserTranslationAvailability(): Promise<TranslationAvailability> {
  const factory = typeof window === "undefined" ? undefined : window.Translator;
  if (!factory) return "unavailable";
  try {
    return await factory.availability({ sourceLanguage: "en", targetLanguage: "zh" });
  } catch {
    return "unavailable";
  }
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
    restored = restored.replace(flexiblePlaceholder, () => formula);
  }
  return restored;
}

function polishBrowserTranslation(value: string) {
  return value
    .replace(/^你会得到/, "给定")
    .replace(/^给你/, "给定")
    .replaceAll("阵列", "数组")
    .replaceAll("键入", "输入")
    .replaceAll("索引", "下标")
    .replaceAll("测试案例", "测试用例")
    .replaceAll("打印", "输出")
    .replaceAll("您", "你")
    .replace(/\s+([，。；：！？])/g, "$1")
    .trim();
}

function escapeBrowserHtml(value: string) {
  const container = document.createElement("div");
  container.textContent = value;
  return container.innerHTML;
}

type BrowserTranslationRecord =
  | { kind: "block"; element: HTMLElement; source: string; formulas: Array<{ placeholder: string; formula: string }> }
  | { kind: "text"; node: Text; raw: string; source: string; formulas: Array<{ placeholder: string; formula: string }> };

function browserTranslationRecords(root: HTMLElement) {
  const records: BrowserTranslationRecord[] = [];
  const processedBlocks = new Set<HTMLElement>();
  let formulaIndex = 0;
  const fixedHeadings = new Map([["input", "输入"], ["output", "输出"], ["example", "样例"], ["examples", "样例"], ["note", "说明"], ["interaction", "交互说明"]]);

  root.querySelectorAll<HTMLElement>(".section-title").forEach((element) => {
    const translated = fixedHeadings.get((element.textContent || "").trim().toLowerCase());
    if (translated) element.textContent = translated;
  });

  root.querySelectorAll<HTMLElement>("p, li, td, th, figcaption").forEach((element) => {
    if (element.closest("pre, code, .section-title") || element.querySelector("p, li, td, th, figcaption, img, a, pre, code")) return;
    const clone = element.cloneNode(true) as HTMLElement;
    const originalFormulaElements = [...element.querySelectorAll<HTMLElement>(".tex-span")];
    const formulas: Array<{ placeholder: string; formula: string }> = [];
    clone.querySelectorAll<HTMLElement>(".tex-span").forEach((formula, index) => {
      const placeholder = `ICPCMATH${formulaIndex++}END`;
      formulas.push({ placeholder, formula: originalFormulaElements[index]?.outerHTML || formula.outerHTML });
      formula.replaceWith(document.createTextNode(placeholder));
    });
    let source = clone.textContent || "";
    source = source.replace(/\${3}[\s\S]*?\${3}/g, (formula) => {
      const placeholder = `ICPCMATH${formulaIndex++}END`;
      formulas.push({ placeholder, formula: escapeBrowserHtml(formula) });
      return placeholder;
    }).replace(/\s+/g, " ").trim();
    if (!/[A-Za-z]{2}/.test(source.replace(/ICPCMATH\d+END/g, ""))) return;
    processedBlocks.add(element);
    records.push({ kind: "block", element, source, formulas });
  });

  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node) {
    const text = node as Text;
    const parent = text.parentElement;
    if (parent
      && !parent.closest("pre, code, .tex-span, .section-title")
      && ![...processedBlocks].some((block) => block.contains(text))
      && /[A-Za-z]{2}/.test(text.data.replace(/\${3}[\s\S]*?\${3}/g, ""))) {
      const masked = maskFormulaText(text.data);
      records.push({ kind: "text", node: text, raw: text.data, source: masked.masked.trim(), formulas: masked.formulas });
    }
    node = walker.nextNode();
  }
  return records;
}

function renderBrowserTranslations(records: BrowserTranslationRecord[], translated: Map<string, string>) {
  for (const record of records) {
    const translatedText = polishBrowserTranslation(translated.get(record.source) || record.source);
    if (record.kind === "block") {
      let html = escapeBrowserHtml(translatedText);
      for (const { placeholder, formula } of record.formulas) {
        const flexiblePlaceholder = new RegExp(placeholder.replace("ICPCMATH", "ICPC\\s*MATH\\s*").replace("END", "\\s*END"), "i");
        if (!flexiblePlaceholder.test(html)) throw new Error(`浏览器翻译未保留公式占位符 ${placeholder}`);
        html = html.replace(flexiblePlaceholder, () => formula);
      }
      record.element.innerHTML = html;
      continue;
    }
    const restored = restoreFormulaText(translatedText, record.formulas);
    record.node.data = `${record.raw.match(/^\s*/)?.[0] || ""}${restored}${record.raw.match(/\s*$/)?.[0] || ""}`;
  }
}

export async function translateStatementInBrowser(
  originalHtml: string,
  images: StatementImage[],
  onProgress: (message: string) => void,
) {
  const factory = window.Translator;
  if (!factory) throw new Error("当前浏览器不支持 Chrome 本地 Translator API；服务器会继续后台翻译");
  const availability = await browserTranslationAvailability();
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
    const records = browserTranslationRecords(root);
    const unique = [...new Set(records.map((record) => record.source))];
    const translated = new Map<string, string>();
    for (let index = 0; index < unique.length; index += 1) {
      onProgress(`浏览器本地翻译 ${index + 1} / ${unique.length}`);
      translated.set(unique[index], await translator.translate(unique[index]));
    }
    renderBrowserTranslations(records, translated);

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
