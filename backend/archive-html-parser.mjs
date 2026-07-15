import { load } from "cheerio";

const SECTION_KEYS = new Map([
  ["input", "input"],
  ["output", "output"],
  ["interaction", "interaction"],
  ["interaction protocol", "interaction"],
  ["note", "note"],
  ["notes", "note"],
  ["problem", "problem"],
  ["game introduction", "game-introduction"],
  ["playing rules", "playing-rules"],
]);

const SECTION_TITLES = {
  statement: "Statement",
  input: "Input",
  output: "Output",
  interaction: "Interaction Protocol",
  note: "Note",
  problem: "Problem",
  "game-introduction": "Game Introduction",
  "playing-rules": "Playing Rules",
};

function readableText($, element) {
  const copy = $(element).clone();
  copy.find("br").replaceWith("\n");
  return copy.text()
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function sectionBlocks($, element) {
  const root = $(element).clone();
  root.find(".section-title, .sample-tests, img, figure, figcaption").remove();
  const blocks = [];
  const candidates = root.find("p, pre, ul, ol").filter((_, child) => !$(child).parentsUntil(root, "p, pre, ul, ol").length);
  candidates.each((_, child) => {
    const tag = String(child.tagName || "").toLowerCase();
    if (tag === "pre") {
      const code = readableText($, child);
      if (code) blocks.push({ kind: "code", code });
      return;
    }
    if (tag === "ul" || tag === "ol") {
      const items = $(child).children("li").map((__, item) => readableText($, item)).get().filter(Boolean);
      if (items.length) blocks.push({ kind: "bullets", items });
      return;
    }
    const text = readableText($, child);
    if (text) blocks.push({ kind: "paragraph", text });
  });
  if (!blocks.length) {
    const text = readableText($, root);
    if (text) blocks.push({ kind: "paragraph", text });
  }
  return blocks;
}

function mergeSection(sections, section) {
  const previous = sections.at(-1);
  if (previous?.key === section.key) previous.blocks.push(...section.blocks);
  else sections.push(section);
}

export function parseArchiveStatementHtml(html) {
  const $ = load(`<div id="archive-html-root">${String(html || "")}</div>`, { xmlMode: false }, false);
  const root = $("#archive-html-root");
  const sections = [];

  root.children().each((_, element) => {
    const child = $(element);
    if (child.hasClass("sample-tests")) return;
    const heading = child.children(".section-title").first().text().trim().toLowerCase();
    const key = child.hasClass("legend") ? "statement" : SECTION_KEYS.get(heading) || (heading ? "statement" : "statement");
    const blocks = sectionBlocks($, element);
    if (blocks.length) mergeSection(sections, { key, title: SECTION_TITLES[key] || heading || "Statement", blocks });
  });

  if (!sections.length) {
    const blocks = sectionBlocks($, root);
    if (blocks.length) sections.push({ key: "statement", title: "Statement", blocks });
  }

  const samples = root.find(".sample-test").map((_, sample) => {
    const input = readableText($, $(sample).find(".input pre").first());
    const output = readableText($, $(sample).find(".output pre").first());
    return input || output ? { input, output, mode: "columns" } : null;
  }).get().filter(Boolean);

  return { sections, sample: samples[0] || null, samples };
}
