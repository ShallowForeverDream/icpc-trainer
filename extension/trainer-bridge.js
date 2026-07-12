window.addEventListener("message", async (event) => {
  if (event.source !== window || event.origin !== window.location.origin) return;
  const message = event.data;
  if (!message || message.source !== "icpc-trainer" || message.type !== "ICPC_TRAINER_SUBMIT") return;
  const payload = message.payload;
  if (!payload || !Number.isInteger(payload.contestId) || !/^[A-Z][0-9]?$/.test(payload.index) || typeof payload.sourceCode !== "string") return;
  await chrome.storage.local.set({ pendingSubmission: { ...payload, createdAt: Date.now() } });
  const url = `https://codeforces.com/problemset/submit?contestId=${encodeURIComponent(payload.contestId)}&submittedProblemIndex=${encodeURIComponent(payload.index)}`;
  await chrome.runtime.sendMessage({ type: "OPEN_CODEFORCES_SUBMIT", url });
});
