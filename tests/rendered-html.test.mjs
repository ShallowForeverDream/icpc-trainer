import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function render(path = "/") {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request(`http://localhost${path}`, { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("renders the icpc-trainer product home", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /icpc-trainer/i);
  assert.match(html, /今日训练/);
  assert.match(html, /每日目标/);
  assert.match(html, /最近完成/);
  assert.match(html, /为你推荐/);
  assert.doesNotMatch(html, /中文精选题/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});

test("keeps twenty readable offline statement fallback records", async () => {
  const source = await readFile(new URL("app/data/problems.ts", root), "utf8");
  assert.equal((source.match(/\{ code: "CF /g) ?? []).length, 20);
  assert.match(source, /titleZh/);
  assert.match(source, /summaryZh/);
});

test("ships readable Chinese fallbacks and a QOJ-like cached statement reader", async () => {
  const [statements, detailPage, statementClient] = await Promise.all([
    readFile(new URL("app/data/problem-statements.ts", root), "utf8"),
    readFile(new URL("app/problem/[code]/page.tsx", root), "utf8"),
    readFile(new URL("app/lib/statement-client.ts", root), "utf8"),
  ]);
  assert.equal((statements.match(/^    timeLimitSeconds:/gm) ?? []).length, 21);
  assert.match(statements, /"2176c"/);
  assert.match(statements, /奇数过程/);
  assert.match(statements, /examples: ProblemExample\[\]/);
  assert.match(detailPage, /原题面默认显示/);
  assert.match(detailPage, /中文题面/);
  assert.match(detailPage, /样例输入/);
  assert.match(detailPage, /样例输出/);
  assert.match(statementClient, /ICPC_TRAINER_FETCH_STATEMENT/);
  assert.match(statementClient, /图片文字翻译/);
  assert.match(statementClient, /window\.Translator/);
  assert.match(statementClient, /katex\.render/);
  assert.match(statementClient, /tex-span/);
  assert.match(statementClient, /cacheBrowserTranslation/);
  assert.match(detailPage, /中文题面已保存到当前设备/);
  assert.match(detailPage, /中文翻译正在排队重试/);
  const response = await render("/problem/2176C");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /奇数过程/);
  assert.match(html, /原题面/);
  assert.match(html, /中文题面/);
  assert.match(html, /首次打开自动导入/);
});

test("ships a constrained Manifest V3 statement and submit bridge", async () => {
  const [manifestText, background, bridge, fill] = await Promise.all([
    readFile(new URL("extension/manifest.json", root), "utf8"),
    readFile(new URL("extension/background.js", root), "utf8"),
    readFile(new URL("extension/trainer-bridge.js", root), "utf8"),
    readFile(new URL("extension/codeforces-fill.js", root), "utf8"),
  ]);
  const manifest = JSON.parse(manifestText);
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.host_permissions.includes("https://codeforces.com/*"));
  assert.ok(!manifest.permissions.includes("cookies"));
  assert.equal(manifest.version, "0.4.0");
  assert.ok(!manifest.host_permissions.includes("https://*.chatgpt.site/*"));
  assert.ok(manifest.host_permissions.includes("https://icpc-trainer-shallowdream.safe-chime-4451.chatgpt.site/*"));
  assert.match(background, /FETCH_CODEFORCES_STATEMENT/);
  assert.match(background, /problem-statement/);
  assert.match(bridge, /ICPC_TRAINER_SUBMIT_RESULT/);
  assert.doesNotMatch(`${background}\n${bridge}\n${fill}`, /autoSubmit/);
  assert.doesNotMatch(fill, /submitButton|\.click\s*\(/);
});

test("ships live multiplayer VP generation, combined contests, and standings", async () => {
  const [route, standingsRoute, recommendationRoute, page, catalog] = await Promise.all([
    readFile(new URL("app/api/vp/generate/route.ts", root), "utf8"),
    readFile(new URL("app/api/vp/standings/route.ts", root), "utf8"),
    readFile(new URL("app/api/codeforces/recommendations/route.ts", root), "utf8"),
    readFile(new URL("app/vp/page.tsx", root), "utf8"),
    readFile(new URL("app/problem/page.tsx", root), "utf8"),
  ]);
  assert.match(route, /getUserSubmissions/);
  assert.match(route, /pickRandomSet/);
  assert.match(route, /pickMirror/);
  assert.match(route, /pickCombined/);
  assert.match(route, /sourceContests/);
  assert.match(standingsRoute, /wrongAttempts/);
  assert.match(standingsRoute, /penalty/);
  assert.match(recommendationRoute, /targetRating/);
  assert.match(page, /ShallowDream2/);
  assert.match(page, /实时榜单/);
  assert.match(page, /多场组合/);
  assert.match(page, /来源参考/);
  assert.match(catalog, /个性化推荐/);
  assert.match(catalog, /目标 Rating/);
  assert.match(catalog, /selectedTags/);
});

test("ships historical ICPC upsolving with timestamp-replayed real standings", async () => {
  const [catalog, page, route, scoreboard] = await Promise.all([
    readFile(new URL("app/data/archive-contests.ts", root), "utf8"),
    readFile(new URL("app/vp/archive/page.tsx", root), "utf8"),
    readFile(new URL("app/api/archive/scoreboard/route.ts", root), "utf8"),
    readFile(new URL("app/lib/archive-scoreboard.ts", root), "utf8"),
  ]);
  assert.equal((catalog.match(/boardPath: "icpc\//g) ?? []).length, 24);
  assert.match(catalog, /2026-wuhan-invitational/);
  assert.match(catalog, /2025-chengdu/);
  assert.match(catalog, /2024-nanjing/);
  assert.match(page, /同时间轴真实榜单/);
  assert.match(page, /我的队伍实时插榜/);
  assert.match(route, /archiveScoreboard/);
  assert.match(scoreboard, /run\.json/);
  assert.match(scoreboard, /freezeAtSeconds/);
  assert.match(scoreboard, /pendingAttempts/);
  assert.match(scoreboard, /inFlight/);
  assert.match(scoreboard, /staleUntil/);
  const response = await render("/vp/archive");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /历届补题/);
  assert.match(html, /ICPC 武汉邀请赛/);
});

test("ships the domestic API, cached statements, OCR, and local translation deployment", async () => {
  const [backend, statements, compose, dockerfile, nginx, browserApi, worker] = await Promise.all([
    readFile(new URL("backend/server.mjs", root), "utf8"),
    readFile(new URL("backend/statements.mjs", root), "utf8"),
    readFile(new URL("backend/compose.yaml", root), "utf8"),
    readFile(new URL("backend/Dockerfile", root), "utf8"),
    readFile(new URL("deploy/nginx-icpc-trainer.conf", root), "utf8"),
    readFile(new URL("app/lib/browser-api.ts", root), "utf8"),
    readFile(new URL("worker/index.ts", root), "utf8"),
  ]);
  assert.match(backend, /\/vp\/generate/);
  assert.match(backend, /\/submissions\/raw/);
  assert.match(backend, /Access-Control-Allow-Origin/);
  assert.match(backend, /\/codeforces\/problems/);
  assert.match(backend, /\/codeforces\/recommendations/);
  assert.match(backend, /\/vp\/standings/);
  assert.match(backend, /createStatementHandler/);
  assert.match(statements, /problem_statements/);
  assert.match(statements, /statement_assets/);
  assert.match(statements, /tesseract/);
  assert.match(statements, /TRANSLATOR_MODEL/);
  assert.match(statements, /stale-while-revalidate/);
  assert.match(statements, /translateBatch/);
  assert.match(statements, /TRANSLATION_VERSION = 22/);
  assert.match(statements, /edge\.microsoft\.com\/translate\/auth/);
  assert.match(statements, /json_schema/);
  assert.match(statements, /processedBlocks/);
  assert.match(compose, /127\.0\.0\.1:8787:8787/);
  assert.match(compose, /ggml-org\/llama\.cpp:server/);
  assert.match(compose, /condition: service_healthy/);
  assert.match(dockerfile, /tesseract-ocr/);
  assert.match(nginx, /\/icpc-api\//);
  assert.match(nginx, /114\.55\.130\.137/);
  assert.match(browserApi, /https:\/\/114\.55\.130\.137\/icpc-api/);
  assert.match(worker, /X-Frame-Options/);
  assert.match(worker, /Permissions-Policy/);
});

test("ships invite-only authentication and administration", async () => {
  const [auth, compose, login, register, admin] = await Promise.all([
    readFile(new URL("backend/auth.mjs", root), "utf8"),
    readFile(new URL("backend/compose.yaml", root), "utf8"),
    readFile(new URL("app/login/page.tsx", root), "utf8"),
    readFile(new URL("app/register/page.tsx", root), "utf8"),
    readFile(new URL("app/admin/page.tsx", root), "utf8"),
  ]);
  assert.match(auth, /CREATE TABLE IF NOT EXISTS users/);
  assert.match(auth, /CREATE TABLE IF NOT EXISTS invites/);
  assert.match(auth, /scryptSync/);
  assert.match(auth, /\/auth\/register/);
  assert.match(auth, /\/admin\/invites/);
  assert.match(compose, /icpc-trainer-data:\/data/);
  assert.match(login, /ACCOUNT LOGIN/);
  assert.match(register, /inviteCode/);
  assert.match(admin, /生成邀请码/);
  assert.match(admin, /撤销/);
  assert.match(admin, /反馈处理状态/);
});

test("uses one validated training profile across dashboard, catalog, submissions, and VP", async () => {
  const [preferences, home, catalog, submissions, vp] = await Promise.all([
    readFile(new URL("app/lib/preferences.ts", root), "utf8"),
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/problem/page.tsx", root), "utf8"),
    readFile(new URL("app/submissions/page.tsx", root), "utf8"),
    readFile(new URL("app/vp/page.tsx", root), "utf8"),
  ]);
  assert.match(preferences, /validCodeforcesHandle/);
  assert.match(preferences, /dailyGoal/);
  for (const source of [home, catalog, submissions, vp]) assert.match(source, /readTrainerPreferences/);
});

test("ships a deliberate-practice loop and collects user experience feedback", async () => {
  const [home, catalog, detail, shell, auth, admin] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/problem/page.tsx", root), "utf8"),
    readFile(new URL("app/problem/[code]/page.tsx", root), "utf8"),
    readFile(new URL("app/components/AppShell.tsx", root), "utf8"),
    readFile(new URL("backend/auth.mjs", root), "utf8"),
    readFile(new URL("app/admin/page.tsx", root), "utf8"),
  ]);
  assert.match(home, /弱项攻坚/);
  assert.match(home, /赛后补题/);
  assert.match(catalog, /赛场思维模式/);
  assert.match(catalog, /Boss 题/);
  assert.match(detail, /THINKING MODE/);
  assert.match(detail, /独立完成/);
  assert.match(detail, /题解后完成/);
  assert.match(shell, /体验建议/);
  assert.match(auth, /CREATE TABLE IF NOT EXISTS training_events/);
  assert.match(auth, /CREATE TABLE IF NOT EXISTS feedback/);
  assert.match(admin, /USER FEEDBACK/);
});
