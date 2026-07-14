import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/health`);
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("test server did not start");
}

test("imports, sanitizes, and reads a first-open statement through HTTP", async () => {
  const directory = await mkdtemp(join(tmpdir(), "icpc-trainer-statements-"));
  const port = 18_000 + process.pid % 1_000;
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: {
      ...process.env,
      PORT: String(port),
      DB_PATH: join(directory, "test.sqlite"),
      OLLAMA_BASE_URL: "",
      ADMIN_EMAIL: "admin@example.com",
      ADMIN_PASSWORD: "StrongTest12345",
    },
    stdio: "ignore",
  });

  try {
    await waitForHealth(baseUrl);
    const loginResponse = await fetch(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "admin@example.com", password: "StrongTest12345" }),
    });
    assert.equal(loginResponse.status, 200);
    const { token } = await loginResponse.json();
    const authorization = { Authorization: `Bearer ${token}` };
    const passwordResponse = await fetch(`${baseUrl}/auth/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorization },
      body: JSON.stringify({ currentPassword: "StrongTest12345", newPassword: "StrongTest67890" }),
    });
    assert.equal(passwordResponse.status, 200);
    const importBody = {
      code: "2176C",
      sourceUrl: "https://codeforces.com/problemset/problem/2176/C?locale=en",
      html: `<div class="problem-statement"><div class="header"><div class="title">C. Odd Process</div><div class="time-limit">time limit per test 2 seconds</div><div class="memory-limit">memory limit per test 256 megabytes</div></div><div class="legend"><p>Read the original statement.</p><img src="https://codeforces.com/images/test.png" alt="Left and Right" onerror="alert(1)"></div><div class="input-specification"><div class="section-title">Input</div><p>One integer.</p></div><div class="output-specification"><div class="section-title">Output</div><p>Print the answer.</p></div></div>`,
    };
    const unauthorizedResponse = await fetch(`${baseUrl}/codeforces/statements/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(importBody),
    });
    assert.equal(unauthorizedResponse.status, 401);

    const response = await fetch(`${baseUrl}/codeforces/statements/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorization },
      body: JSON.stringify(importBody),
    });
    assert.equal(response.status, 201);
    const imported = await response.json();
    assert.equal(imported.statement.title, "C. Odd Process");
    assert.match(imported.statement.originalHtml, /Read the original statement/);
    assert.doesNotMatch(imported.statement.originalHtml, /onerror|alert/);

    const cachedResponse = await fetch(`${baseUrl}/codeforces/statements?code=2176C`);
    assert.equal(cachedResponse.status, 200);
    const cached = await cachedResponse.json();
    assert.equal(cached.statement.code, "2176C");
    assert.equal(cached.statement.images[0].sourceUrl, "https://codeforces.com/images/test.png");

    const translationResponse = await fetch(`${baseUrl}/codeforces/statements/translation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorization },
      body: JSON.stringify({ code: "2176C", chineseHtml: "<div class=\"legend\"><p>这是一段已经生成并且可以立即阅读的中文缓存题面。</p></div>" }),
    });
    assert.equal(translationResponse.status, 200);
    assert.equal((await translationResponse.json()).statement.translationCurrent, true);

    const reimportResponse = await fetch(`${baseUrl}/codeforces/statements/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorization },
      body: JSON.stringify(importBody),
    });
    assert.equal(reimportResponse.status, 201);
    const stale = (await reimportResponse.json()).statement;
    assert.match(stale.chineseHtml, /可以立即阅读的中文缓存题面/);
    assert.equal(stale.revalidating, true);
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
