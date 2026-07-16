import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

async function waitForHealth(baseUrl) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try { if ((await fetch(`${baseUrl}/health`)).ok) return; } catch { /* starting */ }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("test server did not start");
}

async function post(baseUrl, path, body, token = "") {
  return fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
}

test("enforces initial-password, invite, revocation, and admin boundaries", async () => {
  const directory = await mkdtemp(join(tmpdir(), "icpc-trainer-auth-"));
  const databasePath = join(directory, "test.sqlite");
  const legacyDatabase = new DatabaseSync(databasePath);
  legacyDatabase.exec(`CREATE TABLE training_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    client_id TEXT NOT NULL,
    handle TEXT NOT NULL,
    code TEXT NOT NULL,
    outcome TEXT NOT NULL,
    duration_minutes INTEGER NOT NULL DEFAULT 0,
    hint_level INTEGER NOT NULL DEFAULT 0,
    difficulty TEXT NOT NULL DEFAULT 'right',
    reflection TEXT NOT NULL DEFAULT '',
    created_at INTEGER NOT NULL
  )`);
  legacyDatabase.close();
  const port = 20_000 + process.pid % 1_000;
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ["server.mjs"], {
    cwd: new URL(".", import.meta.url),
    env: { ...process.env, PORT: String(port), DB_PATH: databasePath, ADMIN_EMAIL: "admin@example.com", ADMIN_PASSWORD: "StrongTest12345", OLLAMA_BASE_URL: "" },
    stdio: "ignore",
  });

  try {
    await waitForHealth(baseUrl);
    const login = await post(baseUrl, "/auth/login", { email: "admin@example.com", password: "StrongTest12345" });
    assert.equal(login.status, 200);
    const adminToken = (await login.json()).token;

    const blockedAdmin = await post(baseUrl, "/admin/invites", { maxUses: 1, expiresInDays: 7 }, adminToken);
    assert.equal(blockedAdmin.status, 403);
    const changed = await post(baseUrl, "/auth/change-password", { currentPassword: "StrongTest12345", newPassword: "StrongTest67890" }, adminToken);
    assert.equal(changed.status, 200);
    const samePassword = await post(baseUrl, "/auth/change-password", { currentPassword: "StrongTest67890", newPassword: "StrongTest67890" }, adminToken);
    assert.equal(samePassword.status, 400);

    const inviteResponse = await post(baseUrl, "/admin/invites", { maxUses: 1, expiresInDays: 7 }, adminToken);
    assert.equal(inviteResponse.status, 201);
    const invite = (await inviteResponse.json()).invite;
    const register = await post(baseUrl, "/auth/register", { email: "member@example.com", password: "MemberTest12345", inviteCode: invite.code });
    assert.equal(register.status, 201);
    const memberToken = (await register.json()).token;
    assert.equal((await post(baseUrl, "/admin/invites", { maxUses: 1 }, memberToken)).status, 403);
    assert.equal((await post(baseUrl, "/auth/register", { email: "second@example.com", password: "MemberTest12345", inviteCode: invite.code })).status, 400);

    const memberEvent = await post(baseUrl, "/training/events", { clientId: "member_device_123456", handle: "ShallowDream2", code: "2172C", outcome: "independent", durationMinutes: 31, hintLevel: 0, difficulty: "right", reflection: "独立完成" }, memberToken);
    assert.equal(memberEvent.status, 201);
    const crossDeviceSummary = await fetch(`${baseUrl}/training/summary?clientId=second_device_123456&handle=ShallowDream2`, { headers: { Authorization: `Bearer ${memberToken}` } });
    assert.equal(crossDeviceSummary.status, 200);
    assert.equal((await crossDeviceSummary.json()).stats.total, 1);
    const anonymousSummary = await fetch(`${baseUrl}/training/summary?clientId=second_device_123456&handle=ShallowDream2`);
    assert.equal((await anonymousSummary.json()).stats.total, 0);

    assert.equal((await post(baseUrl, "/training/events", { clientId: "legacy_device_12345", handle: "ShallowDream2", code: "2172D", outcome: "unsolved", durationMinutes: 45, hintLevel: 2, difficulty: "hard", reflection: "旧设备待补题" })).status, 201);
    const claimedSummary = await fetch(`${baseUrl}/training/summary?clientId=legacy_device_12345&handle=ShallowDream2`, { headers: { Authorization: `Bearer ${memberToken}` } });
    assert.equal((await claimedSummary.json()).stats.total, 2);
    const migratedSummary = await fetch(`${baseUrl}/training/summary?clientId=third_device_123456&handle=ShallowDream2`, { headers: { Authorization: `Bearer ${memberToken}` } });
    const migratedPayload = await migratedSummary.json();
    assert.equal(migratedPayload.stats.total, 2);
    assert.deepEqual(migratedPayload.recent.map((event) => event.code).sort(), ["CF 2172C", "CF 2172D"]);

    const sharedInviteResponse = await post(baseUrl, "/admin/invites", { maxUses: 2, expiresInDays: 7 }, adminToken);
    assert.equal(sharedInviteResponse.status, 201);
    const sharedInvite = (await sharedInviteResponse.json()).invite;
    assert.equal(sharedInvite.maxUses, 2);
    assert.equal((await post(baseUrl, "/auth/register", { email: "shared-one@example.com", password: "MemberTest12345", inviteCode: sharedInvite.code })).status, 201);
    assert.equal((await post(baseUrl, "/auth/register", { email: "shared-two@example.com", password: "MemberTest12345", inviteCode: sharedInvite.code })).status, 201);
    assert.equal((await post(baseUrl, "/auth/register", { email: "shared-three@example.com", password: "MemberTest12345", inviteCode: sharedInvite.code })).status, 400);

    const revokedInviteResponse = await post(baseUrl, "/admin/invites", { maxUses: 2, expiresInDays: 7 }, adminToken);
    const revokedInvite = (await revokedInviteResponse.json()).invite;
    assert.equal((await post(baseUrl, "/admin/invites/revoke", { id: revokedInvite.id }, adminToken)).status, 200);
    assert.equal((await post(baseUrl, "/auth/register", { email: "revoked@example.com", password: "MemberTest12345", inviteCode: revokedInvite.code })).status, 400);

    const feedbackResponse = await post(baseUrl, "/feedback", { clientId: "test_device_123456", category: "功能建议", rating: 4, message: "希望管理员能够维护反馈处理状态。", page: "/admin" }, memberToken);
    const feedbackId = (await feedbackResponse.json()).id;
    assert.equal(feedbackResponse.status, 201);
    assert.equal((await post(baseUrl, "/admin/feedback/status", { id: feedbackId, status: "planned" }, adminToken)).status, 200);
    const feedbackList = await fetch(`${baseUrl}/admin/feedback`, { headers: { Authorization: `Bearer ${adminToken}` } });
    assert.equal(feedbackList.status, 200);
    assert.equal((await feedbackList.json()).feedback[0].status, "planned");
  } finally {
    child.kill("SIGTERM");
    await new Promise((resolve) => child.once("exit", resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
