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
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch { /* backend is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("test backend did not start");
}

function startBackend(port, dbPath) {
  return spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: String(port), DB_PATH: dbPath, ARCHIVE_PREWARM_PAUSED: "1", OLLAMA_BASE_URL: "" },
    stdio: "ignore",
  });
}

async function stopBackend(child) {
  if (!child || child.exitCode !== null) return;
  child.kill("SIGTERM");
  await new Promise((resolve) => child.once("exit", resolve));
}

test("persists a bounded whole-contest statement prewarm queue across restarts", async () => {
  const directory = await mkdtemp(join(tmpdir(), "icpc-trainer-prewarm-"));
  const dbPath = join(directory, "prewarm.sqlite");
  const port = await freePort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const body = {
    contestId: "2025-shenyang",
    contestName: "ICPC 区域赛沈阳站",
    problems: [
      { slot: "A", qojContestId: 2641, problemId: 14940, title: "Square Kingdom" },
      { slot: "B", qojContestId: 2641, problemId: 14941, title: "Problem B" },
    ],
  };
  let backend = startBackend(port, dbPath);
  try {
    await waitForHealth(baseUrl);
    const response = await fetch(`${baseUrl}/archive/statements/prewarm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 202);
    const created = (await response.json()).prewarm;
    assert.equal(created.total, 2);
    assert.equal(created.readyChinese, 0);
    assert.equal(created.status, "prewarming");

    const duplicate = await fetch(`${baseUrl}/archive/statements/prewarm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, problems: [body.problems[0], { ...body.problems[1], slot: "A" }] }),
    });
    assert.equal(duplicate.status, 400);

    await stopBackend(backend);
    backend = startBackend(port, dbPath);
    await waitForHealth(baseUrl);
    const restored = await fetch(`${baseUrl}/archive/statements/prewarm?contest=2025-shenyang`).then((item) => item.json());
    assert.equal(restored.prewarm.total, 2);
    assert.deepEqual(restored.prewarm.items.map((item) => item.slot), ["A", "B"]);
  } finally {
    await stopBackend(backend);
    await rm(directory, { recursive: true, force: true });
  }
});

