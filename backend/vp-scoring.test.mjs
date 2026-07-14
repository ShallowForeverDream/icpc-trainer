import assert from "node:assert/strict";
import test from "node:test";
import { buildParticipantVpRows, medalCutoffs, medalForRank, rankVpRows } from "./vp-scoring.mjs";

test("calculates ICPC penalty, freeze cutoffs, ranks, and 10/20/30 percent medals", () => {
  const startedAt = 1_700_000_000_000;
  const startSeconds = Math.floor(startedAt / 1000);
  const problems = [{ contestId: 100, index: "A" }, { contestId: 100, index: "B" }];
  const submissions = [[
    { creationTimeSeconds: startSeconds + 600, problem: { contestId: 100, index: "A" }, verdict: "WRONG_ANSWER" },
    { creationTimeSeconds: startSeconds + 1_200, problem: { contestId: 100, index: "A" }, verdict: "OK" },
    { creationTimeSeconds: startSeconds + 9_100, problem: { contestId: 100, index: "B" }, verdict: "OK" },
  ]];
  const frozen = buildParticipantVpRows(["team"], problems, startedAt, submissions, 9_000)[0];
  assert.equal(frozen.solved, 1);
  assert.equal(frozen.penalty, 40);
  assert.equal(frozen.lastSolvedMinutes, 20);
  const final = buildParticipantVpRows(["team"], problems, startedAt, submissions, 10_800)[0];
  assert.equal(final.solved, 2);
  assert.equal(final.penalty, 191);
  assert.equal(final.lastSolvedMinutes, 151);

  const cutoffs = medalCutoffs(100);
  assert.deepEqual(cutoffs, { gold: 10, silver: 30, bronze: 60 });
  assert.equal(medalForRank(10, cutoffs), "gold");
  assert.equal(medalForRank(11, cutoffs), "silver");
  assert.equal(medalForRank(31, cutoffs), "bronze");
  assert.equal(medalForRank(61, cutoffs), null);

  const originals = Array.from({ length: 100 }, (_, index) => ({ id: `original:${index}`, handle: `team-${index}`, solved: index < 9 ? 3 : 1, penalty: index < 9 ? 100 + index : 300 + index, lastSolvedMinutes: 90, problems: {}, mine: false }));
  const ranked = rankVpRows(originals, [{ ...final, solved: 3, penalty: 109, lastSolvedMinutes: 90 }], originals.length);
  const mine = ranked.rows.find((row) => row.mine);
  assert.equal(mine.rank, 10);
  assert.equal(mine.medal, "gold");
});
