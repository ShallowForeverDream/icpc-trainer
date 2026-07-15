import assert from "node:assert/strict";
import test from "node:test";
import { parseArchiveStatementHtml } from "./archive-html-parser.mjs";

test("converts a structured Codeforces Gym statement into archive sections and samples", () => {
  const parsed = parseArchiveStatementHtml(`
    <div class="legend"><p>Given $$$n$$$ paintings.</p><p>Find $$$\\sum_i a_i$$$.</p></div>
    <div class="input-specification"><div class="section-title">Input</div><p>One integer $$$n$$$.</p></div>
    <div class="output-specification"><div class="section-title">Output</div><p>Print the answer.</p></div>
    <div class="sample-tests"><div class="section-title">Examples</div><div class="sample-test">
      <div class="input"><pre>3\n1 2 3</pre></div><div class="output"><pre>6</pre></div>
    </div></div>`);
  assert.deepEqual(parsed.sections.map((section) => section.key), ["statement", "input", "output"]);
  assert.match(parsed.sections[0].blocks[1].text, /\$\$\$\\sum_i a_i\$\$\$/);
  assert.deepEqual(parsed.sample, { input: "3\n1 2 3", output: "6", mode: "columns" });
});
