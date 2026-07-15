import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/health`)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("test server did not start");
}

test("records deliberate-practice outcomes and accepts product feedback", async () => {
  const directory = await mkdtemp(join(tmpdir(), "icpc-trainer-practice-"));
  const port = 19_000 + process.pid % 1_000;
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: String(port), DB_PATH: join(directory, "test.sqlite"), OLLAMA_BASE_URL: "" },
    stdio: "ignore",
  });

  try {
    await waitForHealth(baseUrl);
    const clientId = "test_device_123456";
    const eventResponse = await fetch(`${baseUrl}/training/events`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, handle: "ShallowDream2", code: "CF 1904C", outcome: "unsolved", durationMinutes: 47, hintLevel: 3, difficulty: "hard", reflection: "暴力做法会重复枚举相同的最小差值。" }),
    });
    assert.equal(eventResponse.status, 201);
    const event = await eventResponse.json();
    assert.equal(event.event.code, "CF 1904C");
    assert.equal(event.event.outcome, "unsolved");

    const summaryResponse = await fetch(`${baseUrl}/training/summary?clientId=${clientId}&handle=ShallowDream2`);
    assert.equal(summaryResponse.status, 200);
    const summary = await summaryResponse.json();
    assert.equal(summary.stats.total, 1);
    assert.equal(summary.stats.unsolved, 1);
    assert.equal(summary.recent[0].durationMinutes, 47);

    const sprintPlan = { date: "2026-07-15", contestId: "2025-shenyang", slots: ["A", "B", "C"], reflection: "D 题先验证单调性。" };
    const savePlanResponse = await fetch(`${baseUrl}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, key: "shenyang-sprint", value: sprintPlan }),
    });
    assert.equal(savePlanResponse.status, 200);
    const loadPlanResponse = await fetch(`${baseUrl}/state?clientId=${clientId}&key=shenyang-sprint`);
    assert.equal(loadPlanResponse.status, 200);
    assert.deepEqual((await loadPlanResponse.json()).value, sprintPlan);

    const historyResponse = await fetch(`${baseUrl}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, key: "archive-vp-history", value: { sessions: [] } }),
    });
    assert.equal(historyResponse.status, 200);

    const archiveDraft = { sourceCode: "int main() { return 0; }", languageValue: "C++20", fileName: "main.cpp" };
    const saveDraftResponse = await fetch(`${baseUrl}/state`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, key: "archive-draft:2025-shenyang:A", value: archiveDraft }),
    });
    assert.equal(saveDraftResponse.status, 200);
    const loadDraftResponse = await fetch(`${baseUrl}/state?clientId=${clientId}&key=archive-draft%3A2025-shenyang%3AA`);
    assert.equal(loadDraftResponse.status, 200);
    assert.deepEqual((await loadDraftResponse.json()).value, archiveDraft);

    const feedbackResponse = await fetch(`${baseUrl}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId, category: "推荐不准确", rating: 3, message: "希望补题模式能优先显示最近比赛没做出的题。", page: "/problem" }),
    });
    assert.equal(feedbackResponse.status, 201);
    assert.equal((await feedbackResponse.json()).ok, true);
  } finally {
    if (child.exitCode === null) {
      const exited = new Promise((resolve) => child.once("exit", resolve));
      child.kill("SIGTERM");
      await exited;
    }
    await rm(directory, { recursive: true, force: true });
  }
});
