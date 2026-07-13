window.addEventListener("message", async (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.source !== "icpc-trainer") return;

  if (message.type === "ICPC_TRAINER_SUBMIT") {
    const payload = message.payload;
    if (!payload || !Number.isInteger(payload.contestId) || !/^[A-Z][0-9]?$/.test(payload.index) || typeof payload.sourceCode !== "string") return;
    await chrome.storage.local.set({ pendingSubmission: { ...payload, createdAt: Date.now() } });
    const url = `https://codeforces.com/problemset/submit?contestId=${encodeURIComponent(payload.contestId)}&submittedProblemIndex=${encodeURIComponent(payload.index)}`;
    await chrome.runtime.sendMessage({ type: "OPEN_CODEFORCES_SUBMIT", url });
    return;
  }

  if (message.type === "ICPC_TRAINER_FETCH_STATEMENT" && typeof message.requestId === "string" && /^https:\/\/codeforces\.com\/problemset\/problem\/\d+\/[A-Z][0-9]?(?:[/?#]|$)/.test(message.url)) {
    const result = await chrome.runtime.sendMessage({ type: "FETCH_CODEFORCES_STATEMENT", url: message.url });
    window.postMessage({ source: "icpc-trainer-extension", type: "ICPC_TRAINER_STATEMENT_RESULT", requestId: message.requestId, result }, window.location.origin);
  }
});
