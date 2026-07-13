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
  assert.match(html, /中文精选题/);
  assert.doesNotMatch(html, /Your site is taking shape|codex-preview/);
});

test("ships exactly twenty curated Chinese problem records", async () => {
  const source = await readFile(new URL("app/data/problems.ts", root), "utf8");
  assert.equal((source.match(/\{ code: "CF /g) ?? []).length, 20);
  assert.match(source, /titleZh/);
  assert.match(source, /summaryZh/);
});

test("ships readable Chinese statements and the requested CF 2176C import", async () => {
  const [statements, detailPage] = await Promise.all([
    readFile(new URL("app/data/problem-statements.ts", root), "utf8"),
    readFile(new URL("app/problem/[code]/page.tsx", root), "utf8"),
  ]);
  assert.equal((statements.match(/^    timeLimitSeconds:/gm) ?? []).length, 21);
  assert.match(statements, /"2176c"/);
  assert.match(statements, /奇数过程/);
  assert.match(statements, /examples: ProblemExample\[\]/);
  assert.match(detailPage, /完整中文题面/);
  assert.match(detailPage, /样例输入/);
  assert.match(detailPage, /样例输出/);
  const response = await render("/problem/2176C");
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /奇数过程/);
  assert.match(html, /完整中文题面/);
  assert.match(html, /1 0 1/);
});

test("ships a constrained Manifest V3 submit bridge", async () => {
  const manifest = JSON.parse(await readFile(new URL("extension/manifest.json", root), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.host_permissions.includes("https://codeforces.com/*"));
  assert.ok(!manifest.permissions.includes("cookies"));
  assert.equal(manifest.version, "0.2.0");
});

test("ships live VP generation and the configured handle", async () => {
  const [route, page] = await Promise.all([
    readFile(new URL("app/api/vp/generate/route.ts", root), "utf8"),
    readFile(new URL("app/vp/page.tsx", root), "utf8"),
  ]);
  assert.match(route, /getUserSubmissions/);
  assert.match(route, /pickRandomSet/);
  assert.match(route, /pickMirror/);
  assert.match(page, /ShallowDream2/);
  assert.match(page, /同步 Codeforces 判题/);
});

test("ships the lightweight domestic API deployment", async () => {
  const [backend, compose, nginx, browserApi] = await Promise.all([
    readFile(new URL("backend/server.mjs", root), "utf8"),
    readFile(new URL("backend/compose.yaml", root), "utf8"),
    readFile(new URL("deploy/nginx-icpc-trainer.conf", root), "utf8"),
    readFile(new URL("app/lib/browser-api.ts", root), "utf8"),
  ]);
  assert.match(backend, /\/vp\/generate/);
  assert.match(backend, /\/submissions\/raw/);
  assert.match(backend, /Access-Control-Allow-Origin/);
  assert.match(backend, /\/codeforces\/problems/);
  assert.match(compose, /127\.0\.0\.1:8787:8787/);
  assert.match(nginx, /\/icpc-api\//);
  assert.match(nginx, /114\.55\.130\.137/);
  assert.match(browserApi, /https:\/\/114\.55\.130\.137\/icpc-api/);
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
});
