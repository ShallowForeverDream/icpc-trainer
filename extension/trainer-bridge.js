function trustedTrainerOrigin(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://icpc-trainer-shallowdream.safe-chime-4451.chatgpt.site"
      || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch { return false; }
}

function validRequestId(value) {
  return typeof value === "string" && /^[A-Za-z0-9-]{8,80}$/.test(value);
}

function postSubmitResult(result) {
  window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_SUBMIT_RESULT", ...result }, window.location.origin);
}

chrome.runtime.onMessage.addListener((message) => {
  if (message?.type !== "ICPC_TRAINER_SUBMIT_STATUS" || !validRequestId(message.requestId)) return;
  postSubmitResult(message);
});

window.addEventListener("message", async (event) => {
  if (!trustedTrainerOrigin(window.location.origin)) return;
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.source !== "icpc-trainer") return;

  if (message.type === "ICPC_TRAINER_PING") {
    window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_PONG", version: "0.7.0" }, window.location.origin);
    return;
  }

  if (message.type === "ICPC_TRAINER_ARCHIVE_SUBMIT") {
    const payload = message.payload;
    const expectedUrl = payload && Number.isInteger(payload.qojContestId) && Number.isInteger(payload.problemId)
      ? `https://contest.ucup.ac/contest/${payload.qojContestId}/problem/${payload.problemId}`
      : "";
    if (!payload || payload.judge !== "ucup" || !validRequestId(payload.requestId)
      || payload.qojContestId < 1 || payload.qojContestId > 10_000_000
      || payload.problemId < 1 || payload.problemId > 100_000_000
      || !/^[A-Z][0-9]?$/.test(payload.slot)
      || typeof payload.submitUrl !== "string" || !payload.submitUrl.startsWith(expectedUrl)
      || typeof payload.sourceCode !== "string" || !payload.sourceCode.trim() || payload.sourceCode.length > 500_000
      || typeof payload.languageValue !== "string" || !/^[A-Za-z0-9+.]{1,24}$/.test(payload.languageValue)) return;
    const submission = {
      requestId: payload.requestId,
      judge: "ucup",
      qojContestId: payload.qojContestId,
      problemId: payload.problemId,
      slot: payload.slot,
      sourceCode: payload.sourceCode,
      languageValue: payload.languageValue,
      languageLabel: typeof payload.languageLabel === "string" ? payload.languageLabel.slice(0, 80) : "GNU C++20",
      autoSubmit: payload.autoSubmit === true,
    };
    try {
      const result = await chrome.runtime.sendMessage({ type: "OPEN_UCUP_SUBMIT", url: `${expectedUrl}?v=1#tab-submit-answer`, submission });
      postSubmitResult({ requestId: payload.requestId, ok: Boolean(result?.ok), stage: result?.ok ? "queued" : "failed", message: result?.ok ? "已在后台连接 Universal Cup，正在代理提交" : result?.error || "无法连接评测站" });
    } catch {
      postSubmitResult({ requestId: payload.requestId, ok: false, stage: "failed", message: "扩展无法连接评测站" });
    }
    return;
  }

  if (message.type === "ICPC_TRAINER_SUBMIT") {
    const payload = message.payload;
    if (!payload || !validRequestId(payload.requestId) || !Number.isInteger(payload.contestId)
      || payload.contestId < 1 || payload.contestId > 10_000_000 || !/^[A-Z][0-9]?$/.test(payload.index)
      || typeof payload.sourceCode !== "string" || !payload.sourceCode.trim() || payload.sourceCode.length > 500_000
      || (payload.isGym !== undefined && typeof payload.isGym !== "boolean")) return;
    const submission = {
      requestId: payload.requestId,
      judge: "codeforces",
      contestId: payload.contestId,
      index: payload.index,
      sourceCode: payload.sourceCode,
      languageLabel: typeof payload.languageLabel === "string" ? payload.languageLabel.slice(0, 80) : "GNU C++20",
      isGym: payload.isGym === true,
      autoSubmit: payload.autoSubmit === true,
    };
    const url = payload.isGym
      ? `https://codeforces.com/gym/${encodeURIComponent(payload.contestId)}/submit?submittedProblemIndex=${encodeURIComponent(payload.index)}`
      : `https://codeforces.com/problemset/submit?contestId=${encodeURIComponent(payload.contestId)}&submittedProblemIndex=${encodeURIComponent(payload.index)}`;
    try {
      const result = await chrome.runtime.sendMessage({ type: "OPEN_CODEFORCES_SUBMIT", url, submission });
      postSubmitResult({ requestId: payload.requestId, ok: Boolean(result?.ok), stage: result?.ok ? "queued" : "failed", message: result?.ok ? "已在后台连接 Codeforces，正在代理提交" : result?.error || "无法连接评测站" });
    } catch {
      postSubmitResult({ requestId: payload.requestId, ok: false, stage: "failed", message: "扩展无法连接评测站" });
    }
    return;
  }

  if (message.type === "ICPC_TRAINER_FETCH_STATEMENT" && typeof message.requestId === "string"
    && /^https:\/\/codeforces\.com\/(?:problemset\/problem\/\d+\/[A-Z][0-9]?|gym\/\d+\/problem\/[A-Z][0-9]?)(?:[/?#]|$)/.test(message.url)) {
    const result = await chrome.runtime.sendMessage({ type: "FETCH_CODEFORCES_STATEMENT", url: message.url });
    window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_STATEMENT_RESULT", requestId: message.requestId, result }, window.location.origin);
  }
});
