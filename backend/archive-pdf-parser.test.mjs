import assert from "node:assert/strict";
import test from "node:test";
import { assessOfficialChineseArchive, chineseSectionTitle, parseArchivePdfText } from "./archive-pdf-parser.mjs";

const fixture = `Greetings from Prof. Chen
     Input file:          standard input
     Output file:         standard output
     Time limit:          1 second
     Memory limit:        1024 megabytes

Build a lowercase string whose ASCII sum is n.

Input
The first line contains T (1 ≤ T ≤ 5×103 ).

Output
Output the answer.

Page 1 of 2
Example
               standard input                               standard output
 2                                               Yes
 2257                                            greetings
 96                                              No

Note
Any valid string is accepted.
`;

test("extracts a structured statement and copy-safe samples from a QOJ PDF", () => {
  const statement = parseArchivePdfText(fixture, "Greetings from Prof. Chen");
  assert.equal(statement.title, "Greetings from Prof. Chen");
  assert.equal(statement.timeLimitText, "1 second");
  assert.equal(statement.memoryLimitText, "1024 megabytes");
  assert.deepEqual(statement.sections.map((section) => section.key), ["statement", "input", "output", "note"]);
  assert.match(statement.sections[1].blocks[0].text, /5×10³/);
  assert.equal(statement.sample.input, "2\n2257\n96");
  assert.equal(statement.sample.output, "Yes\ngreetings\nNo");
  assert.equal(chineseSectionTitle("input"), "输入格式");
});

test("recognizes Chinese PDF section headings", () => {
  const parsed = parseArchivePdfText(`题目标题\n\n题目正文至少需要足够多的中文字符，确保能够构成完整题面内容。\n\n输入格式\n输入一个整数。\n\n输出格式\n输出答案。\n\n说明\n没有额外说明。`, "题目标题");
  assert.deepEqual(parsed.sections.map((section) => section.key), ["statement", "input", "output", "note"]);
});

test("rejects official Chinese PDF text when formulas were damaged", () => {
  const original = { sections: [
    { key: "statement", blocks: [{ kind: "paragraph", text: "There are $$$n$$$ residents at height $$$\\left(i+\\frac{b}{a}\\right)^2$$$." }] },
    { key: "input", blocks: [{ kind: "paragraph", text: "Read $$$n$$$." }] },
    { key: "output", blocks: [{ kind: "paragraph", text: "Print $$$n$$$." }] },
  ] };
  const damaged = { sections: [
    { key: "statement", blocks: [{ kind: "paragraph", text: "在王国中有 \u0001 n 名居民，他们分别居住在不同高度的石柱上，需要使用梯子彼此访问。" }] },
    { key: "input", blocks: [{ kind: "paragraph", text: "输入整数 n。" }] },
    { key: "output", blocks: [{ kind: "paragraph", text: "输出答案。" }] },
  ] };
  assert.deepEqual(assessOfficialChineseArchive(damaged, original), { usable: false, reason: "PDF 文本包含损坏字符" });
});

test("accepts intact official Chinese text without source formulas", () => {
  const original = { sections: [
    { key: "statement", blocks: [{ kind: "paragraph", text: "Build a lowercase string with the requested property." }] },
    { key: "input", blocks: [{ kind: "paragraph", text: "Read one integer." }] },
    { key: "output", blocks: [{ kind: "paragraph", text: "Print the answer." }] },
  ] };
  const chinese = { sections: [
    { key: "statement", blocks: [{ kind: "paragraph", text: "构造一个满足题目要求的小写字符串。字符串必须满足给定性质，并且可以输出任意一种合法方案。" }] },
    { key: "input", blocks: [{ kind: "paragraph", text: "输入一个整数。" }] },
    { key: "output", blocks: [{ kind: "paragraph", text: "输出答案。" }] },
  ] };
  assert.deepEqual(assessOfficialChineseArchive(chinese, original), { usable: true, reason: "" });
});
