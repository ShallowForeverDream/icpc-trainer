(async () => {
  const { pendingSubmission } = await chrome.storage.local.get("pendingSubmission");
  if (!pendingSubmission || Date.now() - pendingSubmission.createdAt > 30 * 60 * 1000) return;

  const report = (stage, message) => chrome.runtime.sendMessage({
    type: "JUDGE_SUBMIT_STATUS",
    judge: "codeforces",
    requestId: pendingSubmission.requestId,
    originTabId: pendingSubmission.originTabId,
    stage,
    message,
  });
  const finishWithError = async (stage, message) => {
    await chrome.storage.local.remove("pendingSubmission");
    await report(stage, message);
  };

  if (!Number.isInteger(pendingSubmission.contestId) || !/^[A-Z][0-9]?$/.test(pendingSubmission.index)
    || typeof pendingSubmission.sourceCode !== "string" || !pendingSubmission.sourceCode.trim()
    || pendingSubmission.sourceCode.length > 500_000 || !Number.isInteger(pendingSubmission.originTabId)) {
    await finishWithError("failed", "提交数据无效，请返回平台重试");
    return;
  }

  const waitForForm = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const source = document.querySelector('textarea[name="source"]');
      if (source instanceof HTMLTextAreaElement) return source;
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
    return null;
  };

  const source = await waitForForm();
  if (!source) {
    await finishWithError("needs_login", "Codeforces 未登录或触发了验证，请在打开的页面完成登录后重试");
    return;
  }
  const form = source.closest("form");
  const problem = form?.querySelector('select[name="submittedProblemIndex"]') || document.querySelector('select[name="submittedProblemIndex"]');
  const language = form?.querySelector('select[name="programTypeId"]') || document.querySelector('select[name="programTypeId"]');
  if (problem instanceof HTMLSelectElement) {
    const option = [...problem.options].find((item) => item.value === pendingSubmission.index || item.textContent?.trim().startsWith(pendingSubmission.index));
    if (!option) {
      await finishWithError("failed", "Codeforces 提交页中没有找到目标题目");
      return;
    }
    problem.value = option.value;
    problem.dispatchEvent(new Event("change", { bubbles: true }));
  }
  if (language instanceof HTMLSelectElement) {
    const wanted = pendingSubmission.languageLabel || "GNU C++20";
    const option = [...language.options].find((item) => item.textContent?.includes(wanted))
      || [...language.options].find((item) => wanted.includes("C++") && item.textContent?.includes("GNU C++20"));
    if (option) {
      language.value = option.value;
      language.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }
  source.value = pendingSubmission.sourceCode;
  source.dispatchEvent(new Event("input", { bubbles: true }));
  source.dispatchEvent(new Event("change", { bubbles: true }));

  if (pendingSubmission.autoSubmit) {
    const candidates = [...(form || document).querySelectorAll('input[type="submit"], button[type="submit"]')];
    const submitButton = candidates.find((item) => /submit/i.test(`${item.value || ""} ${item.textContent || ""} ${item.className || ""}`));
    if (!(submitButton instanceof HTMLElement)) {
      await finishWithError("failed", "已填入代码，但没有找到 Codeforces 的提交按钮");
      return;
    }
    await chrome.storage.local.remove("pendingSubmission");
    await report("submitted", "代码已提交到 Codeforces，平台将自动同步判题结果");
    submitButton.click();
    return;
  }

  source.scrollIntoView({ behavior: "smooth", block: "center" });
  source.style.outline = "3px solid #c67ad8";
  await chrome.storage.local.remove("pendingSubmission");
  const notice = document.createElement("div");
  notice.textContent = "icpc-trainer 已填入代码，请检查后提交。";
  notice.style.cssText = "margin:12px 0;padding:12px 14px;border:1px solid #c894d6;background:#fff5fc;color:#55365d;font-weight:600;border-radius:7px";
  source.insertAdjacentElement("beforebegin", notice);
})();
