import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";
import { HttpError, boundedInteger, createWindowLimiter, pruneMap, publicError, readJsonBody } from "./http-utils.mjs";

function requestBody(value, contentType = "application/json") {
  const body = Buffer.from(value);
  const request = Readable.from([body]);
  request.headers = { "content-type": contentType, "content-length": String(body.length) };
  return request;
}

test("bounds numeric request values", () => {
  assert.equal(boundedInteger("17.6", { min: 1, max: 20, fallback: 5 }), 18);
  assert.equal(boundedInteger(-10, { min: 1, max: 20, fallback: 5 }), 1);
  assert.equal(boundedInteger("bad", { min: 1, max: 20, fallback: 5 }), 5);
  assert.equal(boundedInteger(null, { min: 1, max: 20, fallback: 5 }), 5);
  assert.equal(boundedInteger(undefined, { min: 1, max: 20, fallback: 5 }), 5);
  assert.equal(boundedInteger("", { min: 1, max: 20, fallback: 5 }), 5);
});

test("window limiter caps keys, enforces limits, and resets", () => {
  const limiter = createWindowLimiter({ windowMs: 60_000, limit: 2, maxEntries: 3 });
  assert.equal(limiter("one").allowed, true);
  assert.equal(limiter("one").allowed, true);
  assert.equal(limiter("one").allowed, false);
  limiter("two"); limiter("three"); limiter("four");
  assert.equal(limiter.size(), 3);
  limiter.reset("one");
  assert.equal(limiter("one").allowed, true);
});

test("prunes expired and oldest map entries", () => {
  const map = new Map([["old", 0], ["one", 1], ["two", 2], ["three", 3]]);
  pruneMap(map, (value) => value === 0, 2);
  assert.deepEqual([...map.keys()], ["two", "three"]);
});

test("reads bounded JSON and returns safe public errors", async () => {
  assert.deepEqual(await readJsonBody(requestBody('{"ok":true}')), { ok: true });
  await assert.rejects(readJsonBody(requestBody("not json")), (error) => error instanceof HttpError && error.status === 400);
  await assert.rejects(readJsonBody(requestBody('{"large":true}', "text/plain")), (error) => error instanceof HttpError && error.status === 415);
  assert.deepEqual(publicError(new HttpError(502, "internal"), "fallback"), { status: 502, message: "fallback" });
  assert.deepEqual(publicError(new HttpError(400, "bad request"), "fallback"), { status: 400, message: "bad request" });
});
