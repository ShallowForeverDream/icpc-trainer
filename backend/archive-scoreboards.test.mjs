import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const fixture = {
  config: {
    contest_name: "Archive Test Contest",
    start_time: 1_710_000_000,
    end_time: 1_710_018_000,
    frozen_time: 3_600,
    penalty: 1_200,
    problem_id: ["A", "B"],
    group: { official: "正式队伍" },
    organizations: { url: "organization.json" },
    options: { submission_timestamp_unit: "second" },
  },
  teams: [
    { id: "one", name: "Team One", organization_id: "school", group: ["official"] },
    { id: "two", name: "Team Two", organization_id: "school", group: ["official"] },
  ],
  organizations: [{ id: "school", name: "ICPC University" }],
  runs: [
    { id: "1", team_id: "one", problem_id: 0, timestamp: 600, status: "WRONG_ANSWER" },
    { id: "2", team_id: "two", problem_id: 0, timestamp: 900, status: "ACCEPTED" },
    { id: "3", team_id: "one", problem_id: 0, timestamp: 1_200, status: "ACCEPTED" },
    { id: "4", team_id: "one", problem_id: 1, timestamp: 15_000, status: "ACCEPTED" },
  ],
};

async function listen(server) {
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  return server.address().port;
}

async function freePort() {
  const server = http.createServer();
  const port = await listen(server);
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return response.json();
    } catch { /* backend is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("test backend did not start");
}

function startBackend({ port, dbPath, fixtureBase }) {
  return spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, XCPCIO_BASE_URL: `${fixtureBase}/data`, OLLAMA_BASE_URL: "" },
    stdio: "ignore",
  });
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

test("replays ICPC penalties and hides frozen submissions", async () => {
  const directory = await mkdtemp(join(tmpdir(), "icpc-trainer-archive-calc-"));
  process.env.NODE_ENV = "test";
  process.env.DB_PATH = join(directory, "calculator.sqlite");
  const { calculateArchiveStandings, createArchiveScoreboardHandler, normalizeCodeforcesArchiveStandings } = await import(`./archive-scoreboards.mjs?calc=${Date.now()}`);
  const persistence = await import("./persistence.mjs");
  try {
    const frozen = calculateArchiveStandings(fixture, 15_500, false, "official");
    assert.equal(frozen.frozen, true);
    assert.equal(frozen.rows[0].teamId, "two");
    assert.equal(frozen.rows.find((row) => row.teamId === "one").problems.B.pendingAttempts, 1);
    assert.equal(frozen.rows.find((row) => row.teamId === "one").solved, 1);

    const revealed = calculateArchiveStandings(fixture, 15_500, true, "official");
    const teamOne = revealed.rows.find((row) => row.teamId === "one");
    assert.equal(teamOne.solved, 2);
    assert.equal(teamOne.penalty, 20 + 20 + 250);
    assert.equal(revealed.rows[0].teamId, "one");

    const raw = normalizeCodeforcesArchiveStandings({
      contest: { name: "Asia Regional", startTimeSeconds: 1_730_000_000, durationSeconds: 18_000 },
      problems: [{ index: "A" }, { index: "B" }],
      rows: [
        { party: { participantType: "CONTESTANT", teamId: 7, teamName: "Official Team", members: [{ handle: "one" }, { handle: "two" }] }, problemResults: [{ points: 1, rejectedAttemptCount: 2, bestSubmissionTimeSeconds: 1_200 }, { points: 0, rejectedAttemptCount: 1 }] },
        { party: { participantType: "PRACTICE", members: [{ handle: "practice" }] }, problemResults: [{ points: 1, bestSubmissionTimeSeconds: 100 }] },
      ],
    }, 106268);
    assert.equal(raw.teams.length, 1);
    assert.equal(raw.runs.length, 3);
    assert.equal(raw.submissionCount, 4);
    assert.equal(raw.config.frozen_time, 3_600);
    const board = calculateArchiveStandings(raw, 1_300, false, "official");
    assert.equal(board.rows[0].solved, 1);
    assert.equal(board.rows[0].penalty, 60);
    assert.equal(board.rows[0].problems.A.wrongAttempts, 2);
    assert.match(raw.sourceFidelity, /解题时间与最终罚时/);

    const exact = normalizeCodeforcesArchiveStandings({
      contest: { name: "Asia Regional", startTimeSeconds: 1_730_000_000, durationSeconds: 18_000 },
      problems: [{ index: "A" }, { index: "B" }],
      rows: [{ party: { participantType: "CONTESTANT", teamId: 7, teamName: "Official Team", members: [{ handle: "one" }] }, problemResults: [{ points: 1, rejectedAttemptCount: 1, bestSubmissionTimeSeconds: 1_200 }, {}] }],
    }, 106268, [
      { id: 10, relativeTimeSeconds: 300, author: { participantType: "CONTESTANT", teamId: 7 }, problem: { index: "A" }, verdict: "WRONG_ANSWER" },
      { id: 11, relativeTimeSeconds: 1_200, author: { participantType: "CONTESTANT", teamId: 7 }, problem: { index: "A" }, verdict: "OK" },
      { id: 12, relativeTimeSeconds: 200, author: { participantType: "PRACTICE", members: [{ handle: "practice" }] }, problem: { index: "A" }, verdict: "OK" },
    ]);
    assert.equal(exact.runs.length, 2);
    assert.match(exact.sourceFidelity, /逐提交时间轴/);
    assert.equal(calculateArchiveStandings(exact, 500, false, "official").rows[0].problems.A.wrongAttempts, 1);
    assert.equal(calculateArchiveStandings(exact, 1_300, false, "official").rows[0].penalty, 40);

    const missingTimeline = normalizeCodeforcesArchiveStandings({
      contest: { name: "Private Gym", startTimeSeconds: 1_730_000_000, durationSeconds: 18_000 },
      problems: [{ index: "A" }],
      rows: [{ party: { ghost: true, teamName: "Imported Team" }, problemResults: [{ points: 1, rejectedAttemptCount: 2, bestSubmissionTimeSeconds: 900 }] }],
    }, 106268, []);
    assert.equal(missingTimeline.submissionCount, 3);
    assert.match(missingTimeline.sourceFidelity, /解题时间与最终罚时/);

    const ghostTimeline = normalizeCodeforcesArchiveStandings({
      contest: { name: "Imported Regional", startTimeSeconds: 1_730_000_000, durationSeconds: 18_000 },
      problems: [{ index: "A" }],
      rows: [{ party: { ghost: true, teamName: "Stable Ghost Team" }, problemResults: [{ points: 1, bestSubmissionTimeSeconds: 600 }] }],
    }, 2172, [
      { id: 21, relativeTimeSeconds: 600, author: { ghost: true, teamName: "Stable Ghost Team" }, problem: { index: "A" }, verdict: "OK" },
      { id: 22, relativeTimeSeconds: 700, author: { participantType: "PRACTICE", teamName: "Stable Ghost Team" }, problem: { index: "A" }, verdict: "WRONG_ANSWER" },
    ], "contest");
    assert.equal(ghostTimeline.runs.length, 1);
    assert.match(ghostTimeline.sourceFidelity, /逐提交时间轴/);
    assert.equal(ghostTimeline.boardUrl, "https://codeforces.com/contest/2172/standings");

    const methods = [];
    let response;
    const handler = createArchiveScoreboardHandler({
      json: (_target, status, value) => { response = { status, value }; },
      codeforces: async (method) => {
        methods.push(method);
        return method === "contest.standings" ? {
          contest: { name: "Asia Regional", startTimeSeconds: 1_730_000_000, durationSeconds: 18_000 },
          problems: [{ index: "A" }],
          rows: [{ party: { participantType: "CONTESTANT", teamId: 7, teamName: "Official Team" }, problemResults: [{ points: 1, bestSubmissionTimeSeconds: 1_200 }] }],
        } : [{ id: 11, relativeTimeSeconds: 1_200, author: { participantType: "CONTESTANT", teamId: 7 }, problem: { index: "A" }, verdict: "OK" }];
      },
    });
    await handler({ method: "GET" }, {}, new URL("http://localhost/archive/scoreboards?source=codeforces&gymId=106268&id=2025-yokohama&name=Yokohama&elapsed=1300&reveal=1&group=official"));
    assert.deepEqual(methods, ["contest.standings", "contest.status"]);
    assert.equal(response.status, 200);
    assert.equal(response.value.rows[0].solved, 1);
    assert.match(response.value.contest.sourceFidelity, /逐提交时间轴/);

    await handler({ method: "GET" }, {}, new URL("http://localhost/archive/scoreboards?source=codeforces&contestId=2172&id=2025-taichung&name=Taichung&elapsed=1300&reveal=1&group=official"));
    assert.deepEqual(methods, ["contest.standings", "contest.status", "contest.standings", "contest.status"]);
    assert.equal(response.value.contest.boardUrl, "https://codeforces.com/contest/2172/standings");
  } finally {
    persistence.closePersistenceForTests();
    await rm(directory, { recursive: true, force: true });
  }
});

test("persists XCPCIO sources and generated scoreboard views in SQLite across restarts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "icpc-trainer-archive-board-"));
  let requestCount = 0;
  const fixtureServer = http.createServer((request, response) => {
    requestCount += 1;
    const payload = request.url?.endsWith("/config.json") ? fixture.config
      : request.url?.endsWith("/team.json") ? fixture.teams
        : request.url?.endsWith("/run.json") ? fixture.runs
          : request.url?.endsWith("/organization.json") ? fixture.organizations
            : null;
    response.writeHead(payload ? 200 : 404, { "Content-Type": "application/json" });
    response.end(JSON.stringify(payload || { error: "not found" }));
  });
  const fixturePort = await listen(fixtureServer);
  const fixtureBase = `http://127.0.0.1:${fixturePort}`;
  const backendPort = await freePort();
  const backendBase = `http://127.0.0.1:${backendPort}`;
  const dbPath = join(directory, "archive.sqlite");
  const query = new URLSearchParams({ id: "2025-shenyang", name: "ICPC 区域赛沈阳站", boardPath: "icpc/test/archive", elapsed: "15500", reveal: "0", group: "official" });
  let backend = startBackend({ port: backendPort, dbPath, fixtureBase });

  try {
    await waitForHealth(backendBase);
    const first = await fetch(`${backendBase}/archive/scoreboards?${query}`).then((response) => response.json());
    assert.equal(first.contest.teamCount, 2);
    assert.equal(first.cache.persistent, "sqlite");
    assert.equal(first.cache.snapshot, false);
    assert.equal(requestCount, 4);

    const second = await fetch(`${backendBase}/archive/scoreboards?${query}`).then((response) => response.json());
    assert.equal(second.cache.snapshot, true);
    assert.equal(requestCount, 4);
    const health = await fetch(`${backendBase}/health`).then((response) => response.json());
    assert.equal(health.caches.archiveScoreboardSources, 1);
    assert.equal(health.caches.archiveScoreboardViews, 1);
    assert.equal(health.memory.limitMiB, 512);
    assert.equal(health.versions.api, 9);
    assert.equal(health.versions.revision, "local");
    assert.equal(health.integrations.codeforcesAuthenticated, false);
    assert.equal(health.versions.statementTranslation, 22);
    assert.equal(health.versions.archiveStatementTranslation, 4);

    await stopBackend(backend);
    await new Promise((resolve) => fixtureServer.close(resolve));
    backend = startBackend({ port: backendPort, dbPath, fixtureBase });
    await waitForHealth(backendBase);
    query.set("elapsed", "15520");
    const afterRestart = await fetch(`${backendBase}/archive/scoreboards?${query}`).then((response) => response.json());
    assert.equal(afterRestart.contest.runCount, 4);
    assert.equal(afterRestart.cache.source, true);
  } finally {
    await stopBackend(backend);
    if (fixtureServer.listening) await new Promise((resolve) => fixtureServer.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
