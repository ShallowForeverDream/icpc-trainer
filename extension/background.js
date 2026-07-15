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

  const storageKey = isCodeforces ? "pendingSubmission" : "pendingArchiveSubmission";
  const pending = { ...submission, originTabId: sender.tab.id, createdAt: Date.now() };
  try {
    await chrome.storage.local.set({ [storageKey]: pending });
    await chrome.tabs.create({ url: message.url, active: false });
    sendResponse({ ok: true, requestId: submission.requestId });
  } catch (error) {
    await chrome.storage.local.remove(storageKey);
    sendResponse({ ok: false, error: error instanceof Error ? error.message : "无法连接评测站" });
  }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "JUDGE_SUBMIT_STATUS") {
    if (!trustedJudgeSender(sender, message.judge) || !validRequestId(message.requestId)
      || !Number.isInteger(message.originTabId) || !["submitted", "judged", "failed", "needs_login"].includes(message.stage)) return;
    const result = {
      type: "ICPC_TRAINER_SUBMIT_STATUS",
      requestId: message.requestId,
      ok: ["submitted", "judged"].includes(message.stage),
      stage: message.stage,
      message: typeof message.message === "string" ? message.message.slice(0, 240) : "",
      judge: message.judge,
      archiveContestId: typeof message.archiveContestId === "string" ? message.archiveContestId.slice(0, 80) : undefined,
      qojContestId: Number.isInteger(message.qojContestId) ? message.qojContestId : undefined,
      slot: typeof message.slot === "string" && /^[A-Z][0-9]?$/.test(message.slot) ? message.slot : undefined,
      verdict: ["AC", "WA"].includes(message.verdict) ? message.verdict : undefined,
      submissionId: Number.isInteger(message.submissionId) ? message.submissionId : undefined,
    };
    rememberTrainerResult(result);
    chrome.tabs.sendMessage(message.originTabId, result).catch(() => undefined);
    if (message.stage === "judged" && sender.tab?.id !== undefined) {
      const judgeTabId = sender.tab.id;
      setTimeout(() => chrome.tabs.remove(judgeTabId).catch(() => undefined), 1200);
    } else if (["failed", "needs_login"].includes(message.stage) && sender.tab?.id !== undefined) {
      chrome.tabs.update(sender.tab.id, { active: true }).catch(() => undefined);
    }
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
