import assert from "node:assert/strict";
import test from "node:test";
import { buildOriginalVpRows, buildParticipantVpRows, buildTeamVpRow, medalCutoffs, medalForRank, rankVpRows } from "./vp-scoring.mjs";

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

test("combines all teammate handles into one ICPC team row", () => {
  const startedAt = 1_700_000_000_000;
  const startSeconds = Math.floor(startedAt / 1000);
  const problems = [{ contestId: 300, index: "A" }, { contestId: 300, index: "B" }];
  const row = buildTeamVpRow(["Alice", "Bob", "Carol"], problems, startedAt, [
    [
      { creationTimeSeconds: startSeconds + 300, problem: { contestId: 300, index: "A" }, verdict: "WRONG_ANSWER" },
      { creationTimeSeconds: startSeconds + 1_200, problem: { contestId: 300, index: "B" }, verdict: "OK" },
    ],
    [{ creationTimeSeconds: startSeconds + 600, problem: { contestId: 300, index: "A" }, verdict: "OK" }],
    [{ creationTimeSeconds: startSeconds + 900, problem: { contestId: 300, index: "A" }, verdict: "WRONG_ANSWER" }],
  ], 10_800);

  assert.equal(row.handle, "Alice + Bob + Carol");
  assert.deepEqual(row.members, ["Alice", "Bob", "Carol"]);
  assert.equal(row.solved, 2);
  assert.equal(row.problems["300A"].wrongAttempts, 1);
  assert.equal(row.problems["300A"].penalty, 30);
  assert.equal(row.problems["300B"].penalty, 20);
  assert.equal(row.penalty, 50);
});

test("pairs same-percentile teams into a full multi-contest reference board", () => {
  const problems = [
    { slot: "A", contestId: 101, index: "A" },
    { slot: "B", contestId: 101, index: "B" },
    { slot: "C", contestId: 202, index: "A" },
    { slot: "D", contestId: 202, index: "C" },
  ];
  const party = (handle) => ({ participantType: "CONTESTANT", members: [{ handle }] });
  const result = (points, seconds, rejected = 0) => ({ points, bestSubmissionTimeSeconds: seconds, rejectedAttemptCount: rejected });
  const sourceBoards = [
    {
      contest: { id: 101, durationSeconds: 18_000 },
      problems: [{ index: "A" }, { index: "B" }, { index: "C" }],
      rows: [
        { party: party("alpha"), problemResults: [result(1, 300), result(1, 900, 1), result(1, 1200)] },
        { party: party("beta"), problemResults: [result(1, 1000), result(0, 0, 2), result(1, 800)] },
        { party: party("gamma"), problemResults: [result(0, 0, 1), result(0, 0), result(1, 700)] },
      ],
    },
    {
      contest: { id: 202, durationSeconds: 18_000 },
      problems: [{ index: "A" }, { index: "B" }, { index: "C" }],
      rows: [
        { party: party("delta"), problemResults: [result(1, 240), result(1, 200), result(1, 1200)] },
        { party: party("epsilon"), problemResults: [result(1, 700, 1), result(1, 100), result(0, 0, 3)] },
      ],
    },
  ];

  const rows = buildOriginalVpRows(problems, sourceBoards, 18_000);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].handle, "组合参考 #001");
  assert.equal(rows[0].sourceCount, 2);
  assert.deepEqual(rows[0].sourceContests, [101, 202]);
  assert.equal(rows[0].solved, 4);
  assert.equal(rows[0].problems["101A"].solved, true);
  assert.equal(rows[0].problems["101B"].solved, true);
  assert.equal(rows[0].problems["202A"].solved, true);
  assert.equal(rows[0].problems["202C"].solved, true);
  assert.equal(rows.some((row) => row.handle === "alpha" || row.handle === "delta"), false);

  const beforeSecondSolve = buildOriginalVpRows(problems.slice(0, 2), sourceBoards.slice(0, 1), 600);
  assert.equal(beforeSecondSolve[0].handle, "alpha");
  assert.equal(beforeSecondSolve[0].solved, 1);
  assert.equal(beforeSecondSolve[0].problems["101B"].solved, false);
});
