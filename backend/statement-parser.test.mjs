import assert from "node:assert/strict";
import test from "node:test";
import { datasetRowToStatement, normalizeStatementCode, parseCodeforcesStatement, sanitizeStatementHtml } from "./statement-parser.mjs";

test("normalizes Codeforces statement codes", () => {
  assert.deepEqual(normalizeStatementCode("CF 2176C"), { code: "2176C", contestId: 2176, index: "C" });
  assert.deepEqual(normalizeStatementCode("1967/B1"), { code: "1967B1", contestId: 1967, index: "B1" });
  assert.equal(normalizeStatementCode("bad-code"), null);
});

test("parses and sanitizes a Codeforces statement with images and samples", () => {
  const html = `<!doctype html><html><body><div class="problem-statement">
    <div class="header"><div class="title">C. Sample</div><div class="time-limit">time limit per test 2 seconds</div><div class="memory-limit">memory limit per test 256 megabytes</div></div>
    <div class="legend"><p>Choose <span class="tex-span"><i>a</i><sub>i</sub></span>.</p><img src="/images/diagram.png" alt="Left and Right" onerror="alert(1)"><script>alert(1)</script></div>
    <div class="input-specification"><div class="section-title">Input</div><p>One integer.</p></div>
    <div class="sample-tests"><div class="sample-test"><div class="input"><pre>1</pre></div><div class="output"><pre>YES</pre></div></div></div>
  </div></body></html>`;
  const result = parseCodeforcesStatement(html, "https://codeforces.com/problemset/problem/2176/C", "2176C");
  assert.equal(result.title, "C. Sample");
  assert.equal(result.timeLimitText, "2 seconds");
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0].sourceUrl, "https://codeforces.com/images/diagram.png");
  assert.match(result.originalHtml, /sample-tests/);
  assert.match(result.originalHtml, /tex-span/);
  assert.doesNotMatch(result.originalHtml, /script|onerror|alert/);
});

test("parses a Codeforces Gym statement from its gym URL", () => {
  const html = `<div class="problem-statement">
    <div class="header"><div class="title">A. Gym Sample</div><div class="time-limit">time limit per test 1 second</div><div class="memory-limit">memory limit per test 512 megabytes</div></div>
    <div class="legend"><p>This public Gym statement is readable on the trainer.</p></div>
    <div class="input-specification"><div class="section-title">Input</div><p>One integer.</p></div>
    <div class="output-specification"><div class="section-title">Output</div><p>Print it.</p></div>
  </div>`;
  const result = parseCodeforcesStatement(html, "https://codeforces.com/gym/105143/problem/A?locale=en", "105143A");
  assert.equal(result.sourceKind, "codeforces-gym");
  assert.equal(result.title, "A. Gym Sample");
  assert.match(result.originalHtml, /public Gym statement/);
});

test("normalizes Codeforces display-math fences without exposing raw dollars", () => {
  const html = `<div class="problem-statement">
    <div class="header"><div class="title">A. Math</div></div>
    <div class="legend"><p>For every $$$i$$$:</p><p>$$$$$$a_i=\\sum_{j=1}^n b_j$$$$$$</p></div>
  </div>`;
  const result = parseCodeforcesStatement(html, "https://codeforces.com/gym/106161/problem/A", "106161A");
  assert.match(result.originalHtml, /\$\$\$a_i=\\sum_\{j=1\}\^n b_j\$\$\$/);
  assert.doesNotMatch(result.originalHtml, /\${6}/);
});

test("rejects a Gym URL whose contest does not match the requested code", () => {
  assert.throws(() => parseCodeforcesStatement('<div class="problem-statement"><p>Enough statement text to parse safely.</p></div>', "https://codeforces.com/gym/105144/problem/A", "105143A"), /题面地址与题号不匹配/);
});

test("rejects remote images outside Codeforces", () => {
  const result = sanitizeStatementHtml('<p>Diagram</p><img src="https://evil.example/x.png">', "https://codeforces.com/problemset/problem/4/A");
  assert.equal(result.images.length, 0);
  assert.doesNotMatch(result.html, /evil\.example/);
});

test("builds a readable original statement from the dataset fallback", () => {
  const result = datasetRowToStatement({
    contest_id: "4",
    index: "A",
    title: "Watermelon",
    time_limit: 1,
    memory_limit: 64,
    description: "Split the watermelon into two positive even parts.",
    input_format: "One integer w.",
    output_format: "Print YES or NO.",
    examples: [{ input: "8", output: "YES" }],
    note: "For example, 2 + 6.",
  }, "4A");
  assert.match(result.originalHtml, /Split the watermelon/);
  assert.match(result.originalHtml, /<pre>8<\/pre>/);
  assert.equal(result.sourceKind, "codeforces-dataset");
});
