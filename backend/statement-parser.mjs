import { load } from "cheerio";

const ALLOWED_TAGS = new Set([
  "a", "b", "br", "code", "div", "em", "figcaption", "figure", "h1", "h2", "h3", "h4",
  "i", "img", "li", "ol", "p", "pre", "s", "section", "span", "strong", "sub", "sup",
  "table", "tbody", "td", "tfoot", "th", "thead", "tr", "u", "ul",
]);
const DROP_WITH_CONTENTS = new Set(["button", "embed", "form", "iframe", "input", "object", "script", "select", "style", "textarea"]);
const ALLOWED_CLASSES = new Set([
  "center", "input", "input-specification", "legend", "note", "output", "output-specification",
  "problem-statement", "sample-test", "sample-tests", "section-title", "statement-image", "tex-span",
  "test-example-line", "title",
]);

export function normalizeStatementCode(value) {
  const code = String(value || "").trim().replace(/^CF\s*/i, "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  const match = code.match(/^(\d{1,7})([A-Z][0-9]?)$/);
  if (!match) return null;
  return { code: `${match[1]}${match[2]}`, contestId: Number(match[1]), index: match[2] };
}

function normalizeSpace(value) {
  return String(value || "").replace(/\u00a0/g, " ").replace(/[ \t]+/g, " ").replace(/\s*\n\s*/g, " ").trim();
}

export function normalizeCodeforcesMathFences(value) {
  return String(value || "").replace(/\${6}([\s\S]*?)\${6}/g, (_match, expression) => `$$$${expression}$$$`);
}

function allowedRemoteUrl(value, baseUrl, kind) {
  try {
    const url = new URL(value, baseUrl);
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    if (kind === "image" && !/(^|\.)codeforces\.(com|org)$/.test(host)) return null;
    if (kind === "link" && !/(^|\.)codeforces\.(com|org)$/.test(host)) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function sanitizeStatementHtml(input, sourceUrl) {
  const $ = load(`<div id="statement-root">${String(input || "")}</div>`, { xmlMode: false }, false);
  const root = $("#statement-root");
  const images = [];
  root.find("*").addBack().contents().each((_, node) => {
    if (node.type !== "text" || $(node).parents("pre, code").length) return;
    node.data = normalizeCodeforcesMathFences(node.data || "");
  });
  $("*").each((_, element) => {
    if (element === root[0]) return;
    const tag = String(element.tagName || "").toLowerCase();
    if (DROP_WITH_CONTENTS.has(tag)) {
      $(element).remove();
      return;
    }
    if (!ALLOWED_TAGS.has(tag)) {
      $(element).replaceWith($(element).contents());
      return;
    }

    const attributes = { ...(element.attribs || {}) };
    for (const name of Object.keys(attributes)) $(element).removeAttr(name);

    if (attributes.class) {
      const safeClasses = attributes.class.split(/\s+/).filter((item) => ALLOWED_CLASSES.has(item));
      if (safeClasses.length) $(element).attr("class", safeClasses.join(" "));
    }

    if (tag === "a") {
      const href = allowedRemoteUrl(attributes.href, sourceUrl, "link");
      if (href) $(element).attr({ href, target: "_blank", rel: "noreferrer noopener" });
    }

    if (tag === "img") {
      const src = allowedRemoteUrl(attributes.src, sourceUrl, "image");
      if (!src) {
        $(element).remove();
        return;
      }
      const alt = normalizeSpace(attributes.alt).slice(0, 500);
      const title = normalizeSpace(attributes.title).slice(0, 500);
      $(element).attr({ src, alt, loading: "lazy", decoding: "async" });
      if (title) $(element).attr("title", title);
      if (/^\d{1,4}$/.test(attributes.width || "")) $(element).attr("width", attributes.width);
      if (/^\d{1,4}$/.test(attributes.height || "")) $(element).attr("height", attributes.height);
      $(element).addClass("statement-image");
      images.push({ sourceUrl: src, alt, title });
    }

    if (["td", "th"].includes(tag)) {
      if (/^\d{1,2}$/.test(attributes.colspan || "")) $(element).attr("colspan", attributes.colspan);
      if (/^\d{1,2}$/.test(attributes.rowspan || "")) $(element).attr("rowspan", attributes.rowspan);
    }
  });

  return { html: root.html() || "", images };
}

export function parseCodeforcesStatement(pageHtml, sourceUrl, expectedCode) {
  const parsedCode = normalizeStatementCode(expectedCode);
  if (!parsedCode) throw new Error("题号格式无效");
  const source = new URL(sourceUrl);
  if (!/(^|\.)codeforces\.(com|org)$/.test(source.hostname.toLowerCase())) throw new Error("题面来源域名无效");
  const sourcePath = source.pathname + source.search;
  const isProblemset = new RegExp(`/problem(?:set)?/problem/${parsedCode.contestId}/${parsedCode.index}(?:[/?#]|$)`, "i").test(sourcePath);
  const isGym = new RegExp(`/gym/${parsedCode.contestId}/problem/${parsedCode.index}(?:[/?#]|$)`, "i").test(sourcePath);
  if (!isProblemset && !isGym) throw new Error("题面地址与题号不匹配");

  const $ = load(String(pageHtml || ""));
  const statement = $(".problem-statement").first();
  if (!statement.length) throw new Error("原页面中没有找到 Codeforces 题面");
  const title = normalizeSpace(statement.find(".header .title").first().text()) || `Codeforces ${parsedCode.code}`;
  const timeLimitText = normalizeSpace(statement.find(".header .time-limit").first().text()).replace(/^time limit per test\s*/i, "");
  const memoryLimitText = normalizeSpace(statement.find(".header .memory-limit").first().text()).replace(/^memory limit per test\s*/i, "");
  const fragment = load(`<div id="statement-copy">${statement.html() || ""}</div>`, { xmlMode: false }, false);
  fragment("#statement-copy > .header").remove();
  const sanitized = sanitizeStatementHtml(fragment("#statement-copy").html() || "", sourceUrl);
  if (normalizeSpace(load(sanitized.html, {}, false).text()).length < 20) throw new Error("抓取到的题面内容为空");

  return {
    ...parsedCode,
    title,
    timeLimitText,
    memoryLimitText,
    sourceUrl,
    sourceKind: isGym ? "codeforces-gym" : "codeforces",
    originalHtml: sanitized.html,
    images: sanitized.images,
  };
}

function escapeHtml(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function textToParagraphs(value) {
  return String(value || "").split(/\n\s*\n/).map((paragraph) => paragraph.trim()).filter(Boolean).map((paragraph) => `<p>${escapeHtml(paragraph).replaceAll("\n", "<br>")}</p>`).join("");
}

export function datasetRowToStatement(row, expectedCode) {
  const parsedCode = normalizeStatementCode(expectedCode);
  if (!parsedCode) throw new Error("题号格式无效");
  if (String(row?.contest_id) !== String(parsedCode.contestId) || String(row?.index).toUpperCase() !== parsedCode.index) throw new Error("数据集题号不匹配");
  const samples = Array.isArray(row.examples) ? row.examples.map((sample) => `<div class="sample-test"><div class="input"><div class="section-title">Input</div><pre>${escapeHtml(sample?.input || "")}</pre></div><div class="output"><div class="section-title">Output</div><pre>${escapeHtml(sample?.output || "")}</pre></div></div>`).join("") : "";
  const html = [
    `<div class="legend">${textToParagraphs(row.description)}</div>`,
    `<div class="input-specification"><div class="section-title">Input</div>${textToParagraphs(row.input_format)}</div>`,
    `<div class="output-specification"><div class="section-title">Output</div>${textToParagraphs(row.output_format)}</div>`,
    samples ? `<div class="sample-tests"><div class="section-title">Examples</div>${samples}</div>` : "",
    row.note ? `<div class="note"><div class="section-title">Note</div>${textToParagraphs(row.note)}</div>` : "",
  ].join("");
  const sanitized = sanitizeStatementHtml(html, `https://codeforces.com/problemset/problem/${parsedCode.contestId}/${parsedCode.index}`);
  return {
    ...parsedCode,
    title: String(row.title || `Codeforces ${parsedCode.code}`),
    timeLimitText: row.time_limit ? `${row.time_limit} seconds` : "",
    memoryLimitText: row.memory_limit ? `${row.memory_limit} megabytes` : "",
    sourceUrl: `https://codeforces.com/problemset/problem/${parsedCode.contestId}/${parsedCode.index}`,
    sourceKind: "codeforces-dataset",
    originalHtml: sanitized.html,
    images: [],
  };
}
