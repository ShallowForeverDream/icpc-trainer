const HEADING_KEYS = new Map([
  ["input", "input"],
  ["output", "output"],
  ["interaction protocol", "interaction"],
  ["interaction", "interaction"],
  ["first run", "first-run"],
  ["second run", "second-run"],
  ["game introduction", "game-introduction"],
  ["playing rules", "playing-rules"],
  ["problem", "problem"],
  ["note", "note"],
  ["notes", "note"],
]);

const SECTION_TITLES = {
  statement: { english: "Statement", chinese: "题目描述" },
  input: { english: "Input", chinese: "输入格式" },
  output: { english: "Output", chinese: "输出格式" },
  interaction: { english: "Interaction Protocol", chinese: "交互协议" },
  "first-run": { english: "First Run", chinese: "第一次运行" },
  "second-run": { english: "Second Run", chinese: "第二次运行" },
  "game-introduction": { english: "Game Introduction", chinese: "游戏简介" },
  "playing-rules": { english: "Playing Rules", chinese: "出牌规则" },
  problem: { english: "Problem", chinese: "问题" },
  note: { english: "Note", chinese: "说明" },
};

const SAMPLE_HEADINGS = new Set(["example", "examples", "sample", "samples"]);

function cleanFormulaText(value) {
  const superscripts = { 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
  return String(value || "")
    .replace(/([≤≥<>×=]\s*)10([3-9])(?!\d)/g, (_, prefix, exponent) => `${prefix}10${superscripts[exponent]}`)
    .replace(/\b998\s+244\s+353\b/g, "998244353")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
}

function stripPageNoise(lines) {
  return lines.map((line) => line.replaceAll("\f", "").replace(/\s+$/, "")).filter((line) => {
    const compact = line.trim();
    return !/^Page\s+\d+\s+of\s+\d+$/i.test(compact)
      && !/^\d+\s*\/\s*\d+$/.test(compact);
  });
}

function joinLines(lines) {
  return cleanFormulaText(lines.map((line) => line.trim().replace(/\s+/g, " ")).filter(Boolean).join(" "));
}

function paragraphBlocks(lines) {
  const blocks = [];
  let paragraph = [];
  let bullets = [];
  const flushParagraph = () => {
    const text = joinLines(paragraph);
    if (text) blocks.push({ kind: "paragraph", text });
    paragraph = [];
  };
  const flushBullets = () => {
    if (bullets.length) blocks.push({ kind: "bullets", items: bullets });
    bullets = [];
  };
  for (const raw of [...lines, ""]) {
    const line = raw.trim();
    if (!line) {
      flushParagraph();
      flushBullets();
      continue;
    }
    if (/^[•●]\s*/.test(line)) {
      flushParagraph();
      flushBullets();
      bullets.push(cleanFormulaText(line.replace(/^[•●]\s*/, "")));
      continue;
    }
    if (bullets.length) bullets[bullets.length - 1] = joinLines([bullets[bullets.length - 1], line]);
    else paragraph.push(line);
  }
  return blocks;
}

function splitSections(lines) {
  const sections = [];
  let key = "statement";
  let body = [];
  const flush = () => {
    const blocks = paragraphBlocks(body);
    if (blocks.length) sections.push({ key, title: SECTION_TITLES[key]?.english || key, blocks });
    body = [];
  };
  for (const raw of lines) {
    const compact = raw.trim().toLowerCase();
    const nextKey = HEADING_KEYS.get(compact);
    if (nextKey) {
      flush();
      key = nextKey;
    } else body.push(raw);
  }
  flush();
  return sections;
}

function compactSample(values) {
  const normalized = [...values];
  while (!normalized[0]?.trim()) normalized.shift();
  while (!normalized.at(-1)?.trim()) normalized.pop();
  const result = [];
  for (const value of normalized) {
    const text = value.trim();
    if (text || result.at(-1) !== "") result.push(text);
  }
  return result.join("\n").trim();
}

function extractSample(lines) {
  const start = lines.findIndex((line) => SAMPLE_HEADINGS.has(line.trim().toLowerCase()));
  if (start < 0) return null;
  const sampleLines = [];
  for (const line of lines.slice(start + 1)) {
    if (HEADING_KEYS.has(line.trim().toLowerCase())) break;
    sampleLines.push(line);
  }
  const headerIndex = sampleLines.findIndex((line) => /standard input/i.test(line) && /standard output/i.test(line));
  if (headerIndex < 0) {
    const transcript = compactSample(sampleLines);
    return transcript ? { input: transcript, output: "", mode: "transcript" } : null;
  }
  const header = sampleLines[headerIndex];
  const inputColumn = header.toLowerCase().indexOf("standard input");
  const outputColumn = header.toLowerCase().indexOf("standard output");
  const splitColumn = Math.max(inputColumn + 8, Math.floor((inputColumn + outputColumn) / 2));
  const input = [];
  const output = [];
  for (const line of sampleLines.slice(headerIndex + 1)) {
    input.push(line.slice(0, splitColumn));
    output.push(line.slice(splitColumn));
  }
  const sample = { input: compactSample(input), output: compactSample(output), mode: "columns" };
  return sample.input || sample.output ? sample : null;
}

export function parseArchivePdfText(layoutText, expectedTitle = "") {
  const lines = stripPageNoise(String(layoutText || "").replaceAll("\r\n", "\n").split("\n"));
  const preferredTitle = String(expectedTitle || "").trim();
  let title = /^Problem\s+[A-Z][0-9]?$/i.test(preferredTitle) ? "" : preferredTitle;
  let titleRemoved = false;
  let timeLimitText = "";
  let memoryLimitText = "";
  const body = [];
  for (const raw of lines) {
    const compact = raw.trim().replace(/\s+/g, " ");
    if (!compact) {
      body.push("");
      continue;
    }
    if (!title) {
      title = compact.replace(/^Problem\s+[A-Z][0-9]?\.\s*/i, "");
      titleRemoved = true;
      continue;
    }
    if (!titleRemoved && (compact === title || compact.replace(/^Problem\s+[A-Z][0-9]?\.\s*/i, "") === title)) {
      titleRemoved = true;
      continue;
    }
    const metadata = compact.match(/^(Input file|Output file|Time limit|Memory limit):\s*(.*)$/i);
    if (metadata) {
      if (/^Time/i.test(metadata[1])) timeLimitText = metadata[2];
      if (/^Memory/i.test(metadata[1])) memoryLimitText = metadata[2];
      continue;
    }
    body.push(raw);
  }
  const sample = extractSample(body);
  const withoutSample = [];
  let skippingSample = false;
  for (const line of body) {
    const compact = line.trim().toLowerCase();
    if (SAMPLE_HEADINGS.has(compact)) {
      skippingSample = true;
      continue;
    }
    if (skippingSample && HEADING_KEYS.has(compact)) {
      skippingSample = false;
      withoutSample.push(line);
      continue;
    }
    if (!skippingSample) withoutSample.push(line);
  }
  const sections = splitSections(withoutSample);
  if (!sections.length || sections.reduce((sum, section) => sum + section.blocks.length, 0) < 2) throw new Error("PDF 中没有提取到完整题面");
  return { title, timeLimitText, memoryLimitText, sections, sample };
}

export function chineseSectionTitle(key) {
  return SECTION_TITLES[key]?.chinese || key;
}
