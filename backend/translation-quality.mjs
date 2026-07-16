const PLACEHOLDER_PATTERN = /ICPC\s*MATH\s*(\d+)\s*END/gi;

const SEMANTIC_RULES = [
  { source: /\b(?:at most|no more than)\b/i, target: /(?:至多|不超过)/, issue: "upper_bound" },
  { source: /\b(?:at least|no less than)\b/i, target: /(?:至少|不少于)/, issue: "lower_bound" },
  { source: /\bexactly\b/i, target: /(?:恰好|正好|恰为|等于)/, issue: "exactly" },
  { source: /\bany number of times\b/i, target: /(?:任意次|任意次数|若干次)/, issue: "repeat_count" },
  { source: /\bif and only if\b/i, target: /当且仅当/, issue: "iff" },
  { source: /\bnon[- ]negative integers?\b/i, target: /非负整数/, issue: "non_negative" },
  { source: /\bpositive integers?\b/i, target: /正整数/, issue: "positive_integer" },
  { source: /\bstrictly increasing\b/i, target: /严格递增/, issue: "strictly_increasing" },
  { source: /\bstrictly decreasing\b/i, target: /严格递减/, issue: "strictly_decreasing" },
  { source: /\b(?:non[- ]decreasing|monotonically non[- ]decreasing)\b/i, target: /(?:单调不降|非递减)/, issue: "non_decreasing" },
  { source: /\b(?:non[- ]increasing|monotonically non[- ]increasing)\b/i, target: /(?:单调不增|非递增)/, issue: "non_increasing" },
  { source: /\bodd\b/i, target: /(?:奇数|为奇|是奇)/, issue: "odd" },
  { source: /\beven\b/i, target: /(?:偶数|为偶|是偶)/, issue: "even" },
];

function counts(values) {
  const result = new Map();
  for (const value of values) result.set(value, (result.get(value) || 0) + 1);
  return result;
}

function sameCounts(left, right) {
  if (left.size !== right.size) return false;
  for (const [key, value] of left) {
    if (right.get(key) !== value) return false;
  }
  return true;
}

function formulaIds(value) {
  return [...String(value).matchAll(PLACEHOLDER_PATTERN)].map((match) => match[1]);
}

function numericLiterals(value) {
  return String(value)
    .replace(PLACEHOLDER_PATTERN, " ")
    .match(/(?<![A-Za-z_])\d+(?:\.\d+)?(?![A-Za-z_])/g) || [];
}

function uppercaseLiterals(value) {
  return (String(value).replace(PLACEHOLDER_PATTERN, " ").match(/\b[A-Z][A-Z0-9_]{1,31}\b/g) || [])
    .filter((literal) => !/^ICPC(?:MATH|LITERAL)\d+END$/.test(literal));
}

export function translationQualityIssues(source, translation) {
  const original = String(source || "");
  const translated = String(translation || "").trim();
  const issues = [];

  if (!translated || !/[\u3400-\u9fff]/.test(translated)) issues.push("missing_chinese");
  if (!sameCounts(counts(formulaIds(original)), counts(formulaIds(translated)))) issues.push("formula_placeholders");
  if (!sameCounts(counts(numericLiterals(original)), counts(numericLiterals(translated)))) issues.push("numeric_literals");
  if (!sameCounts(counts(uppercaseLiterals(original)), counts(uppercaseLiterals(translated)))) issues.push("uppercase_literals");

  for (const rule of SEMANTIC_RULES) {
    if (rule.source.test(original) && !rule.target.test(translated)) issues.push(rule.issue);
  }
  if (/\b(?:must not|does not|do not|cannot|can't|never)\b/i.test(original) && !/(?:不|不得|不能|无法|未|没有|无须|禁止)/.test(translated)) {
    issues.push("negation");
  }
  return [...new Set(issues)];
}

export function translationQualityHint(issues) {
  const labels = {
    missing_chinese: "译文缺少中文正文",
    formula_placeholders: "公式占位符的数量或编号发生变化",
    numeric_literals: "原文数字被遗漏、增加或改写",
    uppercase_literals: "YES/NO 等大写字面量被遗漏或改写",
    upper_bound: "at most/no more than 必须准确表达为至多或不超过",
    lower_bound: "at least/no less than 必须准确表达为至少或不少于",
    exactly: "exactly 必须准确表达为恰好",
    repeat_count: "any number of times 必须表达为任意次",
    iff: "if and only if 必须表达为当且仅当",
    non_negative: "non-negative integer 必须表达为非负整数",
    positive_integer: "positive integer 必须表达为正整数",
    strictly_increasing: "strictly increasing 必须表达为严格递增",
    strictly_decreasing: "strictly decreasing 必须表达为严格递减",
    non_decreasing: "non-decreasing 必须表达为单调不降或非递减",
    non_increasing: "non-increasing 必须表达为单调不增或非递增",
    odd: "odd 的奇偶性翻译错误或遗漏",
    even: "even 的奇偶性翻译错误或遗漏",
    negation: "否定条件被遗漏",
  };
  return issues.map((issue) => labels[issue] || issue).join("；");
}
