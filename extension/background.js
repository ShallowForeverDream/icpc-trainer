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
      || !Number.isInteger(message.originTabId) || !["submitted", "failed", "needs_login"].includes(message.stage)) return;
    chrome.tabs.sendMessage(message.originTabId, {
      type: "ICPC_TRAINER_SUBMIT_STATUS",
      requestId: message.requestId,
      ok: message.stage === "submitted",
      stage: message.stage,
      message: typeof message.message === "string" ? message.message.slice(0, 240) : "",
    }).catch(() => undefined);
    if (message.stage === "submitted" && sender.tab?.id !== undefined) {
      const judgeTabId = sender.tab.id;
      setTimeout(() => chrome.tabs.remove(judgeTabId).catch(() => undefined), 6000);
    } else if (sender.tab?.id !== undefined) {
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
