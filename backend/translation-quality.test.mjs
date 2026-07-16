import assert from "node:assert/strict";
import test from "node:test";
import { translationQualityHint, translationQualityIssues } from "./translation-quality.mjs";

test("accepts a faithful contest-style translation", () => {
  const source = "You may perform the operation at most 3 times, and print YES if ICPCMATH0END is odd.";
  const translated = "你可以至多进行 3 次操作。如果 ICPCMATH0END 是奇数，则输出 YES。";
  assert.deepEqual(translationQualityIssues(source, translated), []);
});

test("detects changed formulas, numbers, literals, and quantifiers", () => {
  const source = "Perform the operation at least 2 times and output NO if ICPCMATH4END is even.";
  const translated = "至多进行 3 次操作；如果结果是奇数，则输出 YES。";
  const issues = translationQualityIssues(source, translated);
  assert.ok(issues.includes("formula_placeholders"));
  assert.ok(issues.includes("numeric_literals"));
  assert.ok(issues.includes("uppercase_literals"));
  assert.ok(issues.includes("lower_bound"));
  assert.ok(issues.includes("even"));
});

test("detects omitted negation and strict ordering", () => {
  const source = "The sequence must be strictly increasing and must not contain negative integers.";
  const translated = "该序列包含负整数。";
  const issues = translationQualityIssues(source, translated);
  assert.ok(issues.includes("strictly_increasing"));
  assert.ok(issues.includes("negation"));
  assert.match(translationQualityHint(issues), /严格递增/);
});

test("allows equivalent Chinese expressions for bounds", () => {
  assert.deepEqual(translationQualityIssues("Choose at most 5 vertices.", "选择不超过 5 个顶点。"), []);
  assert.deepEqual(translationQualityIssues("Choose no less than 2 edges.", "选择不少于 2 条边。"), []);
});

test("accepts a recoverable formula placeholder with inserted spaces", () => {
  assert.deepEqual(
    translationQualityIssues("Print ICPCMATH7END.", "输出 ICPC MATH 7 END。"),
    [],
  );
});
