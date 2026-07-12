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

test("ships a constrained Manifest V3 submit bridge", async () => {
  const manifest = JSON.parse(await readFile(new URL("extension/manifest.json", root), "utf8"));
  assert.equal(manifest.manifest_version, 3);
  assert.ok(manifest.host_permissions.includes("https://codeforces.com/*"));
  assert.ok(!manifest.permissions.includes("cookies"));
});
