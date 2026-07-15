import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
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

    const gymImportResponse = await fetch(`${baseUrl}/codeforces/statements/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorization },
      body: JSON.stringify({
        code: "105143A",
        sourceUrl: "https://codeforces.com/gym/105143/problem/A?locale=en",
        html: `<div class="problem-statement"><div class="header"><div class="title">A. Public Gym Problem</div><div class="time-limit">time limit per test 1 second</div><div class="memory-limit">memory limit per test 512 megabytes</div></div><div class="legend"><p>Read this Gym statement directly in icpc-trainer.</p></div><div class="input-specification"><div class="section-title">Input</div><p>One integer.</p></div><div class="output-specification"><div class="section-title">Output</div><p>Print it.</p></div></div>`,
      }),
    });
    assert.equal(gymImportResponse.status, 201);
    const gymStatement = (await gymImportResponse.json()).statement;
    assert.equal(gymStatement.sourceKind, "codeforces-gym");
    assert.match(gymStatement.sourceUrl, /\/gym\/105143\/problem\/A/);

    const cachedGymResponse = await fetch(`${baseUrl}/codeforces/statements?code=105143A&source=gym`);
    assert.equal(cachedGymResponse.status, 200);
    assert.equal((await cachedGymResponse.json()).statement.title, "A. Public Gym Problem");

    const translationResponse = await fetch(`${baseUrl}/codeforces/statements/translation`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorization },
      body: JSON.stringify({ code: "2176C", chineseHtml: "<div class=\"legend\"><p>这是一段已经生成并且可以立即阅读的中文缓存题面。</p></div>" }),
    });
    assert.equal(translationResponse.status, 200);
    const reviewedTranslation = (await translationResponse.json()).statement;
    assert.equal(reviewedTranslation.translationCurrent, true);
    assert.equal(reviewedTranslation.translationReviewed, true);
    assert.ok(reviewedTranslation.translationReviewedAt);

    const reviewQueueResponse = await fetch(`${baseUrl}/codeforces/statements/review-queue`, { headers: authorization });
    assert.equal(reviewQueueResponse.status, 200);
    const reviewQueue = (await reviewQueueResponse.json()).items;
    assert.equal(reviewQueue.find((item) => item.id === "2176C")?.reviewed, true);

    const unauthorizedQueueResponse = await fetch(`${baseUrl}/codeforces/statements/review-queue`);
    assert.equal(unauthorizedQueueResponse.status, 401);

    const archiveDb = new DatabaseSync(join(directory, "test.sqlite"));
    const archiveTimestamp = Date.now();
    const archiveOriginal = { sections: [{ key: "statement", title: "Statement", blocks: [{ kind: "paragraph", text: "Given $n$, print $n$." }] }], samples: [] };
    const archiveChinese = { sections: [{ key: "statement", title: "题目描述", blocks: [{ kind: "paragraph", text: "给定一个整数 $n$，请按照题目要求在一行内输出整数 $n$。" }] }] };
    archiveDb.prepare(`INSERT INTO archive_statements (
      id, contest_slug, slot, qoj_contest_id, problem_id, contest_name, title_en, title_zh,
      source_url, original_json, chinese_json, translation_version, status, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ready', ?, ?)`)
      .run("2023-shenyang:A", "2023-shenyang", "A", 100, 200, "2023 ICPC Shenyang", "Example", "示例",
        "https://codeforces.com/gym/100/problem/A", JSON.stringify(archiveOriginal), JSON.stringify(archiveChinese), 2, archiveTimestamp, archiveTimestamp);
    archiveDb.close();

    const badArchiveReview = await fetch(`${baseUrl}/archive/statements/translation-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorization },
      body: JSON.stringify({ contestId: "2023-shenyang", slot: "A", titleZh: "示例题", chinese: { sections: [{ key: "statement", title: "题目描述", blocks: [{ kind: "paragraph", text: "给定 n，输出 n。" }] }] }, images: [] }),
    });
    assert.equal(badArchiveReview.status, 400);

    const archiveReviewResponse = await fetch(`${baseUrl}/archive/statements/translation-review`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authorization },
      body: JSON.stringify({ contestId: "2023-shenyang", slot: "A", titleZh: "示例题", chinese: archiveChinese, images: [] }),
    });
    assert.equal(archiveReviewResponse.status, 200);
    const archiveReviewed = (await archiveReviewResponse.json()).statement;
    assert.equal(archiveReviewed.translationReviewed, true);
    assert.equal(archiveReviewed.titleZh, "示例题");

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
