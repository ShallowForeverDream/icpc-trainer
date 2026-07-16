import assert from "node:assert/strict";
import test from "node:test";
import { codeforcesRequestParams, signCodeforcesParams } from "./codeforces-auth.mjs";

test("signs Codeforces API parameters using the documented canonical order", () => {
  const signed = signCodeforcesParams("contest.hacks", new URLSearchParams({ contestId: "566" }), {
    apiKey: "xxx",
    apiSecret: "yyy",
    timestamp: 1_234_567_890,
    prefix: "123456",
  });

  assert.equal(signed.get("apiKey"), "xxx");
  assert.equal(signed.get("contestId"), "566");
  assert.equal(signed.get("time"), "1234567890");
  assert.equal(
    signed.get("apiSig"),
    "1234567f467d1cd837599d2f0dc9fd8beec8fad80ee7d02f0b65ad153a963bca2923de885e11c96cba96beceaba6dd7433d20c0cbb507b7615b3dccfb693b6163ccc94",
  );
});

test("keeps anonymous Codeforces requests unsigned", () => {
  const unsigned = signCodeforcesParams("problemset.problems", new URLSearchParams({ tags: "math" }));
  assert.equal(unsigned.toString(), "tags=math");
  assert.equal(unsigned.has("apiSig"), false);
});

test("forces regular contest standings to remain anonymous even when credentials exist", () => {
  const params = codeforcesRequestParams("contest.standings", new URLSearchParams({ contestId: "2172" }), {
    authenticated: false,
    apiKey: "configured-key",
    apiSecret: "configured-secret",
  });
  assert.equal(params.toString(), "contestId=2172");
  assert.equal(params.has("apiKey"), false);
  assert.equal(params.has("apiSig"), false);
});
