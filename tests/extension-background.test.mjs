import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import test from "node:test";

test("keeps concurrent judge submissions isolated by their background tab", async () => {
  const source = await readFile(new URL("../extension/background.js", import.meta.url), "utf8");
  const storage = {};
  const tabs = new Map();
  const sentMessages = [];
  let nextTabId = 100;
  let messageListener;
  let removedListener;
  const chrome = {
    storage: { local: {
      async get(key) {
        if (typeof key === "string") return { [key]: storage[key] };
        return { ...storage };
      },
      async set(value) { Object.assign(storage, value); },
    } },
    tabs: {
      async create(input) { const tab = { id: nextTabId++, ...input }; tabs.set(tab.id, tab); return tab; },
      async update(id, input) { Object.assign(tabs.get(id), input); return tabs.get(id); },
      async remove(id) { tabs.delete(id); removedListener?.(id); },
      async sendMessage(id, message) { sentMessages.push({ id, message }); },
      onRemoved: { addListener(listener) { removedListener = listener; } },
    },
    runtime: { onMessage: { addListener(listener) { messageListener = listener; } } },
  };
  const healthFetch = async (url) => {
    if (String(url).includes("codeforces.com")) {
      return new Response('<a href="/logout">Logout</a>', { status: 200 });
    }
    return new Response('<a href="/login">Login</a>', { status: 200 });
  };
  vm.runInNewContext(source, { chrome, URL, fetch: healthFetch, setTimeout, clearTimeout, console }, { filename: "background.js" });

  const dispatch = (message, sender) => new Promise((resolve) => {
    const returned = messageListener(message, sender, resolve);
    if (returned !== true) setTimeout(() => resolve(undefined), 0);
  });
  const trainerSender = (tabId) => ({ url: "https://icpc-trainer-shallowdream.safe-chime-4451.chatgpt.site/problem/1904C", tab: { id: tabId } });
  const submission = (requestId, index) => ({ requestId, contestId: 1904, index, sourceCode: "int main(){}", languageLabel: "GNU C++20", autoSubmit: true });

  const health = await dispatch({ type: "CHECK_JUDGE_SESSIONS" }, trainerSender(9));
  assert.equal(health.sessions.codeforces.status, "ready");
  assert.equal(health.sessions.ucup.status, "signed_out");

  const first = await dispatch({ type: "OPEN_CODEFORCES_SUBMIT", url: "https://codeforces.com/problemset/submit?contestId=1904&submittedProblemIndex=A", submission: submission("submit-concurrent-a", "A") }, trainerSender(10));
  const second = await dispatch({ type: "OPEN_CODEFORCES_SUBMIT", url: "https://codeforces.com/problemset/submit?contestId=1904&submittedProblemIndex=B", submission: submission("submit-concurrent-b", "B") }, trainerSender(11));
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(storage.pendingJudgeSubmissions.length, 2);
  const [firstJob, secondJob] = storage.pendingJudgeSubmissions;
  assert.notEqual(firstJob.judgeTabId, secondJob.judgeTabId);

  const firstPending = await dispatch({ type: "GET_PENDING_SUBMISSION", judge: "codeforces" }, { url: "https://codeforces.com/problemset/submit", tab: { id: firstJob.judgeTabId } });
  const secondPending = await dispatch({ type: "GET_PENDING_SUBMISSION", judge: "codeforces" }, { url: "https://codeforces.com/problemset/submit", tab: { id: secondJob.judgeTabId } });
  assert.equal(firstPending.submission.requestId, "submit-concurrent-a");
  assert.equal(secondPending.submission.requestId, "submit-concurrent-b");

  await dispatch({ type: "UPDATE_PENDING_SUBMISSION", judge: "codeforces", requestId: firstJob.requestId, phase: "tracking", removeSource: true }, { url: "https://codeforces.com/problemset/submit", tab: { id: firstJob.judgeTabId } });
  const tracking = storage.pendingJudgeSubmissions.find((item) => item.requestId === firstJob.requestId);
  assert.equal(tracking.phase, "tracking");
  assert.equal("sourceCode" in tracking, false);

  await dispatch({ type: "JUDGE_SUBMIT_STATUS", judge: "codeforces", requestId: firstJob.requestId, originTabId: 10, stage: "judged", message: "spoofed", verdict: "AC" }, { url: "https://codeforces.com/submissions/user", tab: { id: secondJob.judgeTabId } });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(storage.pendingJudgeSubmissions.length, 2);
  assert.equal(storage.trainerSubmissionResults, undefined);

  await dispatch({ type: "JUDGE_SUBMIT_STATUS", judge: "codeforces", requestId: firstJob.requestId, originTabId: 10, stage: "judged", message: "Accepted", verdict: "AC", submissionId: 123456 }, { url: "https://codeforces.com/submissions/user", tab: { id: firstJob.judgeTabId } });
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(storage.pendingJudgeSubmissions.some((item) => item.requestId === firstJob.requestId), false);
  assert.equal(storage.pendingJudgeSubmissions.some((item) => item.requestId === secondJob.requestId), true);
  assert.equal(storage.trainerSubmissionResults.at(-1).verdict, "AC");
  assert.equal(sentMessages.at(-1).id, 10);
});
