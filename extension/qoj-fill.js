(async () => {
  const { pendingArchiveSubmission } = await chrome.storage.local.get("pendingArchiveSubmission");
  if (!pendingArchiveSubmission || Date.now() - pendingArchiveSubmission.createdAt > 30 * 60 * 1000) return;

  const report = (stage, message) => chrome.runtime.sendMessage({
    type: "JUDGE_SUBMIT_STATUS",
    judge: "ucup",
    requestId: pendingArchiveSubmission.requestId,
    originTabId: pendingArchiveSubmission.originTabId,
    stage,
    message,
  });
  const finishWithError = async (stage, message) => {
    await chrome.storage.local.remove("pendingArchiveSubmission");
    await report(stage, message);
  };

  const match = location.pathname.match(/^\/contest\/(\d+)\/problem\/(\d+)\/?$/);
  if (!match || Number(match[1]) !== pendingArchiveSubmission.qojContestId
    || Number(match[2]) !== pendingArchiveSubmission.problemId
    || typeof pendingArchiveSubmission.sourceCode !== "string" || !pendingArchiveSubmission.sourceCode.trim()
    || pendingArchiveSubmission.sourceCode.length > 500_000 || !Number.isInteger(pendingArchiveSubmission.originTabId)) {
    await finishWithError("failed", "评测页与目标题目不匹配，请返回平台重试");
    return;
  }

  const waitForSubmitForm = async () => {
    for (let attempt = 0; attempt < 80; attempt += 1) {
      const source = document.querySelector("#input-answer_answer_editor, textarea[name='answer_answer_editor']");
      const language = document.querySelector("#input-answer_answer_language, select[name='answer_answer_language']");
      if (source instanceof HTMLTextAreaElement && language instanceof HTMLSelectElement) return { source, language };
      await new Promise((resolve) => setTimeout(resolve, 125));
    }
    return null;
  };

  const submitTab = document.querySelector("a[href='#tab-submit-answer']");
  if (submitTab instanceof HTMLElement) submitTab.click();
  const fields = await waitForSubmitForm();
  if (!fields) {
    await finishWithError("needs_login", "Universal Cup / QOJ 未登录或提交表单不可用，请完成登录后重试");
    return;
  }

  const editorMode = document.querySelector("input[name='answer_answer_upload_type'][value='editor']");
  if (editorMode instanceof HTMLInputElement && !editorMode.checked) editorMode.click();
  const option = [...fields.language.options].find((item) => item.value === pendingArchiveSubmission.languageValue)
    || [...fields.language.options].find((item) => item.textContent?.includes(pendingArchiveSubmission.languageLabel || "C++20"));
  if (option) {
    fields.language.value = option.value;
    fields.language.dispatchEvent(new Event("change", { bubbles: true }));
  }
  fields.source.value = pendingArchiveSubmission.sourceCode;
  fields.source.dispatchEvent(new Event("input", { bubbles: true }));
  fields.source.dispatchEvent(new Event("change", { bubbles: true }));
  const codeMirror = fields.source.nextElementSibling?.CodeMirror;
  if (codeMirror && typeof codeMirror.setValue === "function") codeMirror.setValue(pendingArchiveSubmission.sourceCode);

  if (pendingArchiveSubmission.autoSubmit) {
    const form = fields.source.closest("form");
    const candidates = [...(form || document).querySelectorAll(".button-submit-answer, button[type='submit'], input[type='submit']")];
    const submitButton = candidates.find((item) => /submit|提交/i.test(`${item.value || ""} ${item.textContent || ""} ${item.className || ""}`));
    if (!(submitButton instanceof HTMLElement)) {
      await finishWithError("failed", "已填入代码，但没有找到 Universal Cup / QOJ 的提交按钮");
      return;
    }
    await chrome.storage.local.remove("pendingArchiveSubmission");
    await report("submitted", "代码已提交到 Universal Cup / QOJ，平台已记录本次提交");
    submitButton.click();
    return;
  }

  fields.source.scrollIntoView({ behavior: "smooth", block: "center" });
  fields.source.style.outline = "3px solid #c67ad8";
  await chrome.storage.local.remove("pendingArchiveSubmission");
})();
