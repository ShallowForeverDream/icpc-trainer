(async () => {
  const pending = (await chrome.runtime.sendMessage({ type: "GET_PENDING_SUBMISSION", judge: "luogu" }))?.submission;
  if (!pending || Date.now() - pending.createdAt > 30 * 60 * 1000) return;

  const report = (stage, message, extra = {}) => chrome.runtime.sendMessage({
    type: "JUDGE_SUBMIT_STATUS",
    judge: "luogu",
    requestId: pending.requestId,
    originTabId: pending.originTabId,
    archiveContestId: pending.archiveContestId,
    slot: pending.slot,
    stage,
    message,
    ...extra,
  });

  function parseContext(html) {
    const parsed = new DOMParser().parseFromString(html, "text/html");
    const context = parsed.querySelector("#lentille-context")?.textContent;
    if (!context) return null;
    try { return JSON.parse(context); } catch { return null; }
  }

  async function loadContext(url) {
    const response = await fetch(url, { credentials: "include", redirect: "follow", cache: "no-store", headers: { Accept: "text/html" } });
    const html = await response.text();
    return { response, context: parseContext(html) };
  }

  if (pending.phase === "tracking") {
    if (!Number.isInteger(pending.submissionId) || location.pathname !== `/record/${pending.submissionId}`) return;
    const statusNames = {
      2: "Compile Error", 3: "Output Limit Exceeded", 4: "Memory Limit Exceeded", 5: "Time Limit Exceeded",
      6: "Wrong Answer", 7: "Runtime Error", 8: "Unknown Error", 9: "Partially Accepted", 10: "System Error",
      11: "Unaccepted", 12: "Accepted", 14: "Unaccepted Hack", 15: "Hack Accepted",
    };
    for (let attempt = 0; attempt < 1200; attempt += 1) {
      try {
        const { response, context } = await loadContext(`/record/${pending.submissionId}`);
        if (/\/auth\/login(?:[/?#]|$)/.test(response.url)) {
          await report("needs_login", "洛谷登录已失效，请登录后返回平台重试");
          return;
        }
        const record = context?.data?.record || context?.data?.currentRecord || context?.data;
        const status = Number(record?.status);
        if (status === 12) {
          await report("judged", "Accepted · 已自动计入 VP 排名", { verdict: "AC", submissionId: pending.submissionId });
          return;
        }
        if (Number.isInteger(status) && ![-1, 0, 1].includes(status)) {
          await report("judged", `${statusNames[status] || `未通过（状态 ${status}）`} · 已自动计入罚时`, { verdict: "WA", submissionId: pending.submissionId });
          return;
        }
      } catch { /* Keep polling through transient judge-page errors. */ }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
    await report("submitted", "判题超过 20 分钟，请在平台提交记录中稍后刷新");
    return;
  }

  const pathMatch = location.pathname.match(/^\/problem\/(P\d{4,8})\/?$/);
  if (!pathMatch || pathMatch[1] !== pending.luoguProblemId
    || typeof pending.sourceCode !== "string" || !pending.sourceCode.trim() || pending.sourceCode.length > 500_000
    || !Number.isInteger(pending.originTabId)) {
    await report("failed", "洛谷评测页与目标题目不匹配，请返回平台重试");
    return;
  }

  try {
    const { response, context } = await loadContext(`/problem/${pending.luoguProblemId}`);
    if (/\/auth\/login(?:[/?#]|$)/.test(response.url) || !context?.user || Number(context.user.uid) < 1) {
      await report("needs_login", "洛谷尚未登录，请在打开的页面登录后返回平台重试");
      return;
    }
    const csrf = document.querySelector('meta[name="csrf-token"]')?.getAttribute("content") || "";
    if (!csrf) {
      await report("failed", "洛谷提交令牌不可用，请刷新页面后重试");
      return;
    }
    const languageIds = { C11: 2, "C++17": 12, "C++20": 27, "C++23": 34, Python3: 7, PyPy3: 25, Java17: 33, Java21: 33, Kotlin: 21, Rust: 15 };
    const languageId = languageIds[pending.languageValue] || 27;
    const acceptedLanguages = context?.data?.problem?.acceptLanguages;
    if (Array.isArray(acceptedLanguages) && !acceptedLanguages.includes(languageId)) {
      await report("failed", `该题不支持所选语言（${pending.languageLabel || pending.languageValue}）`);
      return;
    }
    const submitResponse = await fetch(`/fe/api/problem/submit/${pending.luoguProblemId}`, {
      method: "POST",
      credentials: "include",
      redirect: "follow",
      headers: { "Content-Type": "application/json", Accept: "application/json", "X-CSRF-TOKEN": csrf },
      body: JSON.stringify({ lang: languageId, code: pending.sourceCode, enableO2: 1 }),
    });
    const raw = await submitResponse.text();
    let payload = {};
    try { payload = JSON.parse(raw); } catch { /* Report the HTTP status below. */ }
    const submissionId = Number(payload.rid || payload.data?.rid);
    if (!submitResponse.ok || !Number.isInteger(submissionId) || submissionId < 1) {
      const errorType = String(payload.errorType || payload.error || "");
      const captcha = /captcha|verify|验证/i.test(`${errorType} ${raw}`);
      await report(captcha ? "needs_login" : "failed", captcha
        ? "洛谷要求完成一次验证码，请在打开的页面手动提交一次后再从平台重试"
        : String(payload.message || payload.errorMessage || `洛谷提交失败（HTTP ${submitResponse.status}）`).slice(0, 220));
      return;
    }
    await chrome.runtime.sendMessage({ type: "UPDATE_PENDING_SUBMISSION", judge: "luogu", requestId: pending.requestId, phase: "tracking", submissionId, removeSource: true });
    await report("submitted", "代码已送达洛谷，正在等待判题", { submissionId });
    location.replace(`/record/${submissionId}`);
  } catch (error) {
    await report("failed", error instanceof Error ? error.message.slice(0, 220) : "洛谷提交失败，请返回平台重试");
  }
})();
