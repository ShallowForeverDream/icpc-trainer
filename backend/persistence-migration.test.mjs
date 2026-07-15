import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

test("migrates the submission judge constraint without losing existing data", async () => {
  const directory = await mkdtemp(join(tmpdir(), "icpc-trainer-persistence-migration-"));
  const dbPath = join(directory, "legacy.sqlite");
  const legacy = new DatabaseSync(dbPath);
  legacy.exec(`
    CREATE TABLE platform_submissions (
      owner_key TEXT NOT NULL, request_id TEXT NOT NULL,
      judge TEXT NOT NULL CHECK (judge IN ('codeforces', 'ucup')),
      problem_code TEXT NOT NULL, problem_title TEXT NOT NULL, problem_href TEXT NOT NULL,
      contest_id INTEGER NOT NULL, problem_index TEXT NOT NULL, language TEXT NOT NULL,
      source_payload BLOB, source_bytes INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL CHECK (status IN ('queued', 'submitted', 'accepted', 'rejected', 'failed', 'needs_login')),
      verdict TEXT, message TEXT NOT NULL, judge_submission_id INTEGER,
      archive_contest_id TEXT, slot TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
      PRIMARY KEY (owner_key, request_id)
    );
    INSERT INTO platform_submissions (
      owner_key, request_id, judge, problem_code, problem_title, problem_href, contest_id, problem_index,
      language, source_bytes, status, message, created_at, updated_at
    ) VALUES (
      'device:legacy_device_123456', 'submit-legacy-12345678', 'codeforces', '1904C', 'Array Game',
      '/problem/1904C', 1904, 'C', 'GNU C++20', 0, 'accepted', 'Accepted', 1, 1
    );
  `);
  legacy.close();

  process.env.NODE_ENV = "test";
  process.env.DB_PATH = dbPath;
  const persistence = await import(`./persistence.mjs?migration=${Date.now()}`);
  try {
    assert.equal(persistence.listPlatformSubmissions({ primary: "device:legacy_device_123456", fallback: null }).length, 1);
    const created = persistence.createPlatformSubmission("device:legacy_device_123456", {
      requestId: "submit-luogu-12345678",
      judge: "luogu",
      problemCode: "2024-xian-invitational-A",
      problemTitle: "Guess The Tree",
      problemHref: "/vp/archive/problem?contest=2024-xian-invitational&slot=A",
      contestId: 173404,
      problemIndex: "A",
      language: "GNU C++20",
      sourceCode: "int main(){}",
      status: "queued",
      message: "正在连接洛谷",
      archiveContestId: "2024-xian-invitational",
      slot: "A",
    });
    assert.equal(created.judge, "luogu");
    assert.equal(persistence.persistenceStats().platformSubmissions, 2);
  } finally {
    persistence.closePersistenceForTests();
    await rm(directory, { recursive: true, force: true });
  }
});
