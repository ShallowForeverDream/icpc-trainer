function trustedTrainerSender(sender) {
  try {
    const url = new URL(sender.url || "");
    return url.origin === "https://icpc-trainer-shallowdream.safe-chime-4451.chatgpt.site"
      || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch { return false; }
}

function trustedJudgeSender(sender, judge) {
  try {
    const url = new URL(sender.url || "");
    if (judge === "codeforces") return url.origin === "https://codeforces.com";
    return ["https://contest.ucup.ac", "https://qoj.ac"].includes(url.origin);
  } catch { return false; }
}

function validRequestId(value) {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,80}$/.test(value);
}

const PENDING_KEY = "pendingJudgeSubmissions";
let storageQueue = Promise.resolve();

function withStorageLock(task) {
  const next = storageQueue.then(task, task);
  storageQueue = next.catch(() => undefined);
  return next;
}

function validPendingJob(item) {
  return item && validRequestId(item.requestId) && ["codeforces", "ucup"].includes(item.judge)
    && Number.isInteger(item.originTabId) && Number.isInteger(item.judgeTabId)
    && Number.isFinite(item.createdAt) && Date.now() - item.createdAt < 30 * 60 * 1000;
}

async function readPendingJobs() {
  const stored = await chrome.storage.local.get(PENDING_KEY);
  return (Array.isArray(stored[PENDING_KEY]) ? stored[PENDING_KEY] : []).filter(validPendingJob).slice(-32);
}

async function mutatePendingJobs(mutator) {
  return withStorageLock(async () => {
    const current = await readPendingJobs();
    const result = await mutator(current);
    const jobs = Array.isArray(result?.jobs) ? result.jobs.filter(validPendingJob).slice(-32) : current;
    await chrome.storage.local.set({ [PENDING_KEY]: jobs });
    return result?.value;
  });
}

function addPendingJob(job) {
  return mutatePendingJobs((jobs) => ({ jobs: [...jobs.filter((item) => item.requestId !== job.requestId && item.judgeTabId !== job.judgeTabId), job], value: job }));
}

function pendingJobForTab(tabId, judge) {
  return mutatePendingJobs((jobs) => ({ jobs, value: jobs.find((item) => item.judgeTabId === tabId && item.judge === judge) || null }));
}

function updatePendingJob(tabId, requestId, patch) {
  return mutatePendingJobs((jobs) => {
    let value = null;
    const next = jobs.map((item) => {
      if (item.judgeTabId !== tabId || item.requestId !== requestId) return item;
      value = { ...item, ...patch };
      if (patch.sourceCode === undefined && Object.prototype.hasOwnProperty.call(patch, "sourceCode")) delete value.sourceCode;
      return value;
    });
    return { jobs: next, value };
  });
}

function removePendingJob(tabId, requestId = "") {
  return mutatePendingJobs((jobs) => ({ jobs: jobs.filter((item) => item.judgeTabId !== tabId || (requestId && item.requestId !== requestId)), value: true }));
}

let resultQueue = Promise.resolve();
function rememberTrainerResult(result) {
  resultQueue = resultQueue.then(async () => {
    const stored = await chrome.storage.local.get("trainerSubmissionResults");
    const timestamp = Date.now();
    const current = Array.isArray(stored.trainerSubmissionResults) ? stored.trainerSubmissionResults : [];
    const next = [...current.filter((item) => item && timestamp - Number(item.createdAt || 0) < 7 * 24 * 60 * 60 * 1000), { ...result, createdAt: timestamp }].slice(-200);
    await chrome.storage.local.set({ trainerSubmissionResults: next });
  }).catch(() => undefined);
}

async function openJudgeTab(message, sender, sendResponse) {
  const isCodeforces = message.type === "OPEN_CODEFORCES_SUBMIT";
  const validUrl = isCodeforces
    ? /^https:\/\/codeforces\.com\/(?:problemset\/submit(?:\?|$)|gym\/\d+\/submit(?:\?|$))/.test(message.url)
    : /^https:\/\/contest\.ucup\.ac\/contest\/\d+\/problem\/\d+\?v=1#tab-submit-answer$/.test(message.url);
  const submission = message.submission;
  if (!validUrl || !submission || !validRequestId(submission.requestId) || typeof submission.sourceCode !== "string"
    || !submission.sourceCode.trim() || submission.sourceCode.length > 500_000 || sender.tab?.id === undefined) {
    sendResponse({ ok: false, error: "提交参数无效" });
    return;
  }

  let tab;
  try {
    tab = await chrome.tabs.create({ url: "about:blank", active: false });
    if (!Number.isInteger(tab.id)) throw new Error("无法创建评测标签页");
    const pending = {
      ...submission,
      judge: isCodeforces ? "codeforces" : "ucup",
      originTabId: sender.tab.id,
      judgeTabId: tab.id,
      createdAt: Date.now(),
    };
    await addPendingJob(pending);
    await chrome.tabs.update(tab.id, { url: message.url });
    sendResponse({ ok: true, requestId: submission.requestId });
  } catch (error) {
    if (Number.isInteger(tab?.id)) {
      await removePendingJob(tab.id).catch(() => undefined);
      await chrome.tabs.remove(tab.id).catch(() => undefined);
    }
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "无法连接评测站" });
  }
}

chrome.tabs.onRemoved.addListener((tabId) => { void removePendingJob(tabId).catch(() => undefined); });

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "GET_PENDING_SUBMISSION") {
    if (!trustedJudgeSender(sender, message.judge) || sender.tab?.id === undefined) return;
    void pendingJobForTab(sender.tab.id, message.judge).then((submission) => sendResponse({ submission })).catch(() => sendResponse({ submission: null }));
    return true;
  }

  if (message?.type === "UPDATE_PENDING_SUBMISSION") {
    if (!trustedJudgeSender(sender, message.judge) || sender.tab?.id === undefined || !validRequestId(message.requestId)) return;
    const patch = {};
    if (message.phase === "tracking") patch.phase = "tracking";
    if (Number.isInteger(message.submissionId) && message.submissionId > 0) patch.submissionId = message.submissionId;
    if (message.removeSource === true) patch.sourceCode = undefined;
    void updatePendingJob(sender.tab.id, message.requestId, patch).then((submission) => sendResponse({ ok: Boolean(submission) })).catch(() => sendResponse({ ok: false }));
    return true;
  }

  if (message?.type === "JUDGE_SUBMIT_STATUS") {
    if (!trustedJudgeSender(sender, message.judge) || sender.tab?.id === undefined || !validRequestId(message.requestId)
      || !Number.isInteger(message.originTabId) || !["submitted", "judged", "failed", "needs_login"].includes(message.stage)) return;
    void (async () => {
      const pending = await pendingJobForTab(sender.tab.id, message.judge);
      if (!pending || pending.requestId !== message.requestId || pending.originTabId !== message.originTabId) return;
      const result = {
        type: "ICPC_TRAINER_SUBMIT_STATUS",
        requestId: pending.requestId,
        ok: ["submitted", "judged"].includes(message.stage),
        stage: message.stage,
        message: typeof message.message === "string" ? message.message.slice(0, 240) : "",
        judge: pending.judge,
        archiveContestId: typeof pending.archiveContestId === "string" ? pending.archiveContestId.slice(0, 80) : undefined,
        qojContestId: Number.isInteger(pending.qojContestId) ? pending.qojContestId : undefined,
        slot: typeof pending.slot === "string" && /^[A-Z][0-9]?$/.test(pending.slot) ? pending.slot : undefined,
        verdict: ["AC", "WA"].includes(message.verdict) ? message.verdict : undefined,
        submissionId: Number.isInteger(message.submissionId) ? message.submissionId : undefined,
      };
      rememberTrainerResult(result);
      chrome.tabs.sendMessage(pending.originTabId, result).catch(() => undefined);
      if (["judged", "failed", "needs_login"].includes(message.stage)) await removePendingJob(sender.tab.id, pending.requestId);
      if (message.stage === "judged") {
        const judgeTabId = sender.tab.id;
        setTimeout(() => chrome.tabs.remove(judgeTabId).catch(() => undefined), 1200);
      } else if (["failed", "needs_login"].includes(message.stage)) {
        chrome.tabs.update(sender.tab.id, { active: true }).catch(() => undefined);
      }
    })().catch(() => undefined);
    return;
  }

  if (!trustedTrainerSender(sender)) return;
  if (message?.type === "OPEN_CODEFORCES_SUBMIT" || message?.type === "OPEN_UCUP_SUBMIT") {
    void openJudgeTab(message, sender, sendResponse);
    return true;
  }

  if (message?.type !== "FETCH_CODEFORCES_STATEMENT"
    || !/^https:\/\/codeforces\.com\/(?:problemset\/problem\/\d+\/[A-Z][0-9]?|gym\/\d+\/problem\/[A-Z][0-9]?)(?:[/?#]|$)/.test(message.url)) return;
  (async () => {
    try {
      const response = await fetch(message.url, { credentials: "include", redirect: "follow", headers: { "Accept-Language": "en-US,en;q=0.9" } });
      const html = await response.text();
      if (!response.ok) throw new Error(`Codeforces HTTP ${response.status}`);
      if (!html.includes("problem-statement")) throw new Error("Codeforces 返回了验证页面，请先在新标签页打开原题并完成验证");
      sendResponse({ ok: true, html, url: response.url });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "原题面读取失败" });
    }
  })();
  return true;
});
