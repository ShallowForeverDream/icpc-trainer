function trustedTrainerOrigin(value) {
  try {
    const url = new URL(value);
    return url.origin === "https://icpc-trainer-shallowdream.safe-chime-4451.chatgpt.site"
      || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  } catch { return false; }
}

window.addEventListener("message", async (event) => {
  if (!trustedTrainerOrigin(window.location.origin)) return;
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.source !== "icpc-trainer") return;

  if (message.type === "ICPC_TRAINER_PING") {
    window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_PONG" }, window.location.origin);
    return;
  }

  if (message.type === "ICPC_TRAINER_ARCHIVE_SUBMIT") {
    const payload = message.payload;
    const expectedUrl = payload && Number.isInteger(payload.qojContestId) && Number.isInteger(payload.problemId)
      ? `https://contest.ucup.ac/contest/${payload.qojContestId}/problem/${payload.problemId}`
      : "";
    if (!payload || payload.judge !== "ucup"
      || payload.qojContestId < 1 || payload.qojContestId > 10_000_000
      || payload.problemId < 1 || payload.problemId > 100_000_000
      || !/^[A-Z][0-9]?$/.test(payload.slot)
      || typeof payload.submitUrl !== "string" || !payload.submitUrl.startsWith(expectedUrl)
      || typeof payload.sourceCode !== "string" || !payload.sourceCode.trim() || payload.sourceCode.length > 500_000
      || typeof payload.languageValue !== "string" || !/^[A-Za-z0-9+.]{1,24}$/.test(payload.languageValue)) return;
    const pendingArchiveSubmission = {
      judge: "ucup",
      qojContestId: payload.qojContestId,
      problemId: payload.problemId,
      slot: payload.slot,
      sourceCode: payload.sourceCode,
      languageValue: payload.languageValue,
      languageLabel: typeof payload.languageLabel === "string" ? payload.languageLabel.slice(0, 80) : "GNU C++20",
      createdAt: Date.now(),
    };
    try {
      await chrome.storage.local.set({ pendingArchiveSubmission });
      await chrome.runtime.sendMessage({ type: "OPEN_UCUP_SUBMIT", url: `${expectedUrl}?v=1#tab-submit-answer` });
      window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_SUBMIT_RESULT", ok: true }, window.location.origin);
    } catch {
      window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_SUBMIT_RESULT", ok: false }, window.location.origin);
    }
    return;
  }

  if (message.type === "ICPC_TRAINER_SUBMIT") {
    const payload = message.payload;
    if (!payload || !Number.isInteger(payload.contestId) || payload.contestId < 1 || payload.contestId > 10_000_000 || !/^[A-Z][0-9]?$/.test(payload.index) || typeof payload.sourceCode !== "string" || !payload.sourceCode.trim() || payload.sourceCode.length > 500_000 || (payload.isGym !== undefined && typeof payload.isGym !== "boolean")) return;
    const pendingSubmission = {
      contestId: payload.contestId,
      index: payload.index,
      sourceCode: payload.sourceCode,
      languageLabel: typeof payload.languageLabel === "string" ? payload.languageLabel.slice(0, 80) : "GNU C++20",
      isGym: payload.isGym === true,
      createdAt: Date.now(),
    };
    try {
      await chrome.storage.local.set({ pendingSubmission });
      const url = payload.isGym
        ? `https://codeforces.com/gym/${encodeURIComponent(payload.contestId)}/submit?submittedProblemIndex=${encodeURIComponent(payload.index)}`
        : `https://codeforces.com/problemset/submit?contestId=${encodeURIComponent(payload.contestId)}&submittedProblemIndex=${encodeURIComponent(payload.index)}`;
      await chrome.runtime.sendMessage({ type: "OPEN_CODEFORCES_SUBMIT", url });
      window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_SUBMIT_RESULT", ok: true }, window.location.origin);
    } catch {
      window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_SUBMIT_RESULT", ok: false }, window.location.origin);
    }
    return;
  }

  if (message.type === "ICPC_TRAINER_FETCH_STATEMENT" && typeof message.requestId === "string"
    && /^https:\/\/codeforces\.com\/(?:problemset\/problem\/\d+\/[A-Z][0-9]?|gym\/\d+\/problem\/[A-Z][0-9]?)(?:[/?#]|$)/.test(message.url)) {
    const result = await chrome.runtime.sendMessage({ type: "FETCH_CODEFORCES_STATEMENT", url: message.url });
    window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_STATEMENT_RESULT", requestId: message.requestId, result }, window.location.origin);
  }
});
