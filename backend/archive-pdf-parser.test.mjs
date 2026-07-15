import assert from "node:assert/strict";
import test from "node:test";
import { chineseSectionTitle, parseArchivePdfText } from "./archive-pdf-parser.mjs";

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
