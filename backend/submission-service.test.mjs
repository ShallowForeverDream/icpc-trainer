import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import http from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function freePort() {
  const server = http.createServer();
  await new Promise((resolve, reject) => server.listen(0, "127.0.0.1", resolve).once("error", reject));
  const port = server.address().port;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/health`)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("test backend did not start");
}

function startBackend(port, dbPath) {
  return spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, OLLAMA_BASE_URL: "", ARCHIVE_PREWARM_PAUSED: "1" },
    stdio: "ignore",
  });
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

test("persists owner-scoped source code and monotonic judge results across restarts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "icpc-trainer-submission-"));
  const dbPath = join(directory, "submission.sqlite");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const clientId = "test_device_123456";
  const requestId = "submit-22222222-2222-4222-8222-222222222222";
  let backend = startBackend(port, dbPath);
  try {
    await waitForHealth(baseUrl);
    const create = await fetch(`${baseUrl}/platform-submissions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId,
        requestId,
        judge: "luogu",
        problemCode: "2024-xian-invitational-A",
        problemTitle: "Guess The Tree",
        problemHref: "/vp/archive/problem?contest=2024-xian-invitational&slot=A",
        contestId: 173404,
        problemIndex: "A",
        language: "GNU C++20",
        sourceCode: "#include <bits/stdc++.h>\nusing namespace std;\nint main(){ return 0; }",
        status: "queued",
        message: "正在连接洛谷",
        archiveContestId: "2024-xian-invitational",
        slot: "A",
      }),
    });
    assert.equal(create.status, 201);
    assert.equal((await create.json()).submission.sourceCode.includes("bits/stdc++.h"), true);

    const accepted = await fetch(`${baseUrl}/platform-submissions/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, requestId, status: "accepted", verdict: "AC", judgeSubmissionId: 314159, message: "Accepted" }),
    });
    assert.equal(accepted.status, 200);
    assert.equal((await accepted.json()).submission.status, "accepted");

    const replay = await fetch(`${baseUrl}/platform-submissions/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, requestId, status: "submitted", message: "旧的评测中状态" }),
    });
    const replayed = (await replay.json()).submission;
    assert.equal(replayed.status, "accepted");
    assert.equal(replayed.message, "Accepted");

    const list = await fetch(`${baseUrl}/platform-submissions?clientId=${clientId}`).then((response) => response.json());
    assert.equal(list.submissions.length, 1);
    assert.equal("sourceCode" in list.submissions[0], false);

    const hidden = await fetch(`${baseUrl}/platform-submissions/${requestId}?clientId=another_device_123456`);
    assert.equal(hidden.status, 404);

    await stopBackend(backend);
    backend = startBackend(port, dbPath);
    await waitForHealth(baseUrl);
    const detail = await fetch(`${baseUrl}/platform-submissions/${requestId}?clientId=${clientId}`).then((response) => response.json());
    assert.equal(detail.submission.status, "accepted");
    assert.equal(detail.submission.judgeSubmissionId, 314159);
    assert.match(detail.submission.sourceCode, /return 0/);
  } finally {
    await stopBackend(backend);
    await rm(directory, { recursive: true, force: true });
  }
});
