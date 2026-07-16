import { createHash, randomBytes } from "node:crypto";

function compareEntries([leftKey, leftValue], [rightKey, rightValue]) {
  if (leftKey !== rightKey) return leftKey < rightKey ? -1 : 1;
  if (leftValue === rightValue) return 0;
  return leftValue < rightValue ? -1 : 1;
}

export function signCodeforcesParams(method, params, {
  apiKey = "",
  apiSecret = "",
  timestamp = Math.floor(Date.now() / 1000),
  prefix = randomBytes(3).toString("hex"),
} = {}) {
  const requestParams = new URLSearchParams(params);
  const key = String(apiKey).trim();
  const secret = String(apiSecret).trim();
  if (!key || !secret) return requestParams;

  const randomPrefix = String(prefix);
  if (randomPrefix.length !== 6) throw new Error("Codeforces API signature prefix must contain exactly 6 characters");
  requestParams.set("apiKey", key);
  requestParams.set("time", String(Math.floor(Number(timestamp))));
  const ordered = new URLSearchParams([...requestParams.entries()].sort(compareEntries));
  const digest = createHash("sha512")
    .update(`${randomPrefix}/${method}?${ordered}#${secret}`)
    .digest("hex");
  ordered.set("apiSig", `${randomPrefix}${digest}`);
  return ordered;
}
