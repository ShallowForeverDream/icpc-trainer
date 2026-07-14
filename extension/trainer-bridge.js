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

  if (message.type === "ICPC_TRAINER_SUBMIT") {
    const payload = message.payload;
    if (!payload || !Number.isInteger(payload.contestId) || payload.contestId < 1 || payload.contestId > 10_000_000 || !/^[A-Z][0-9]?$/.test(payload.index) || typeof payload.sourceCode !== "string" || !payload.sourceCode.trim() || payload.sourceCode.length > 500_000) return;
    const pendingSubmission = {
      contestId: payload.contestId,
      index: payload.index,
      sourceCode: payload.sourceCode,
      languageLabel: typeof payload.languageLabel === "string" ? payload.languageLabel.slice(0, 80) : "GNU C++20",
      createdAt: Date.now(),
    };
    try {
      await chrome.storage.local.set({ pendingSubmission });
      const url = `https://codeforces.com/problemset/submit?contestId=${encodeURIComponent(payload.contestId)}&submittedProblemIndex=${encodeURIComponent(payload.index)}`;
      await chrome.runtime.sendMessage({ type: "OPEN_CODEFORCES_SUBMIT", url });
      window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_SUBMIT_RESULT", ok: true }, window.location.origin);
    } catch {
      window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_SUBMIT_RESULT", ok: false }, window.location.origin);
    }
    return;
  }

  if (message.type === "ICPC_TRAINER_FETCH_STATEMENT" && typeof message.requestId === "string" && /^https:\/\/codeforces\.com\/problemset\/problem\/\d+\/[A-Z][0-9]?(?:[/?#]|$)/.test(message.url)) {
    const result = await chrome.runtime.sendMessage({ type: "FETCH_CODEFORCES_STATEMENT", url: message.url });
    window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_STATEMENT_RESULT", requestId: message.requestId, result }, window.location.origin);
  }
});
