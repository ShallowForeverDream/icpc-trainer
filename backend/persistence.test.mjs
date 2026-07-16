import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("persists bounded runtime data, personal state, platform submissions, VP sessions, and scoreboard snapshots", async () => {
  const directory = await mkdtemp(join(tmpdir(), "icpc-trainer-persistence-"));
  process.env.NODE_ENV = "test";
  process.env.DB_PATH = join(directory, "persistence.sqlite");
  const persistence = await import(`./persistence.mjs?test=${Date.now()}`);
  try {
    const now = Date.now();
    for (const key of ["one", "two", "three"]) {
      persistence.writeRuntimeCache("test", key, { key }, { itemCount: 1, fetchedAt: now, expiresAt: now + 1000, staleUntil: now + 2000, maxEntries: 2 });
    }
    assert.equal(persistence.runtimeCacheStats().test, 2);
    assert.equal(persistence.readRuntimeCache("test", "one"), null);
    assert.deepEqual(persistence.readRuntimeCache("test", "three").value, { key: "three" });

    persistence.writePersonalState("device:test_device_123456", "preferences", { dailyGoal: 5 });
    const migrated = persistence.readPersonalState({ primary: "user:7", fallback: "device:test_device_123456" }, "preferences");
    assert.equal(migrated.exists, true);
    assert.equal(migrated.value.dailyGoal, 5);
    assert.equal(persistence.readPersonalState({ primary: "user:7", fallback: null }, "preferences").value.dailyGoal, 5);

    const requestId = "submit-11111111-1111-4111-8111-111111111111";
    persistence.createPlatformSubmission("device:test_device_123456", {
      requestId,
      judge: "codeforces",
      problemCode: "1904C",
      problemTitle: "Array Game",
      problemHref: "/problem/1904C",
      contestId: 1904,
      problemIndex: "C",
      language: "GNU C++20",
      sourceCode: "#include <bits/stdc++.h>\nint main(){}",
      status: "queued",
      message: "正在连接 Codeforces",
    });
    const migratedSubmissions = persistence.listPlatformSubmissions({ primary: "user:7", fallback: "device:test_device_123456" });
    assert.equal(migratedSubmissions.length, 1);
    assert.equal(migratedSubmissions[0].status, "queued");
    persistence.updatePlatformSubmissionStatus("user:7", requestId, { status: "accepted", verdict: "AC", judgeSubmissionId: 987654, message: "Accepted" });
    persistence.updatePlatformSubmissionStatus("user:7", requestId, { status: "submitted", message: "旧状态重放" });
    const submissionDetail = persistence.readPlatformSubmission({ primary: "user:7", fallback: null }, requestId, { includeSource: true });
    assert.equal(submissionDetail.status, "accepted");
    assert.equal(submissionDetail.message, "Accepted");
    assert.equal(submissionDetail.judgeSubmissionId, 987654);
    assert.match(submissionDetail.sourceCode, /bits\/stdc\+\+\.h/);

    const session = { id: "vp-11111111-1111-4111-8111-111111111111", handle: "ShallowDream2", participants: ["ShallowDream2"], durationMinutes: 180, problems: [{ contestId: 1, index: "A", slot: "A" }] };
    persistence.persistVpSession("user:7", session);
    assert.equal(persistence.readActiveVpSession("user:7").id, session.id);
    const started = persistence.startVpSession(session.id, "user:7", now);
    assert.ok(started.startedAt >= now && started.startedAt <= Date.now() + 60_000);
    persistence.writeVpSnapshot(`session:${session.id}`, session.id, 3, { finished: true, participantRows: [{ handle: "ShallowDream2", rank: 7, solved: 4, penalty: 321 }], rows: [{ handle: "ShallowDream2" }] });
    assert.equal(persistence.readVpSnapshot(`session:${session.id}`, 3).value.rows[0].handle, "ShallowDream2");
    assert.equal(persistence.readVpSession(session.id, "user:7").standings.rows.length, 1);
    assert.equal(persistence.finishVpSession(session.id, "user:7"), true);
    assert.equal(persistence.readActiveVpSession("user:7"), null);
    const history = persistence.listVpHistory("user:7");
    assert.equal(history.length, 1);
    assert.equal(history[0].standings.participantRows[0].rank, 7);
    assert.ok(history[0].finishedAt >= now);
    assert.equal(persistence.persistenceStats().platformSubmissions, 2);
    assert.equal(persistence.persistenceStats().vpHistory, 1);
  } finally {
    persistence.closePersistenceForTests();
    await rm(directory, { recursive: true, force: true });
  }
});
