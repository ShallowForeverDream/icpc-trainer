import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("persists bounded runtime data, personal state, VP sessions, and scoreboard snapshots", async () => {
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

    const session = { id: "vp-11111111-1111-4111-8111-111111111111", handle: "ShallowDream2", participants: ["ShallowDream2"], durationMinutes: 180, problems: [{ contestId: 1, index: "A", slot: "A" }] };
    persistence.persistVpSession("user:7", session);
    assert.equal(persistence.readActiveVpSession("user:7").id, session.id);
    const started = persistence.startVpSession(session.id, "user:7", now);
    assert.ok(started.startedAt >= now && started.startedAt <= Date.now() + 60_000);
    persistence.writeVpSnapshot(`session:${session.id}`, session.id, 3, { rows: [{ handle: "ShallowDream2" }] });
    assert.equal(persistence.readVpSnapshot(`session:${session.id}`, 3).value.rows[0].handle, "ShallowDream2");
    assert.equal(persistence.readVpSession(session.id, "user:7").standings.rows.length, 1);
    assert.equal(persistence.finishVpSession(session.id, "user:7"), true);
    assert.equal(persistence.readActiveVpSession("user:7"), null);
  } finally {
    persistence.closePersistenceForTests();
    await rm(directory, { recursive: true, force: true });
  }
});
