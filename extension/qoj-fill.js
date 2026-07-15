(async () => {
  const { pendingArchiveSubmission } = await chrome.storage.local.get("pendingArchiveSubmission");
  if (!pendingArchiveSubmission || Date.now() - pendingArchiveSubmission.createdAt > 30 * 60 * 1000) return;
  const match = location.pathname.match(/^\/contest\/(\d+)\/problem\/(\d+)\/?$/);
  if (!match
    || Number(match[1]) !== pendingArchiveSubmission.qojContestId
    || Number(match[2]) !== pendingArchiveSubmission.problemId
    || typeof pendingArchiveSubmission.sourceCode !== "string"
    || !pendingArchiveSubmission.sourceCode.trim()
    || pendingArchiveSubmission.sourceCode.length > 500_000) return;

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
  if (!fields) return;

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
  fields.source.scrollIntoView({ behavior: "smooth", block: "center" });
  fields.source.style.outline = "3px solid #c67ad8";
  await chrome.storage.local.remove("pendingArchiveSubmission");

  const notice = document.createElement("div");
  notice.textContent = "icpc-trainer 已填入题目、语言和代码。请检查后手动点击 Submit。";
  notice.style.cssText = "margin:12px 0;padding:12px 14px;border:1px solid #c894d6;background:#fff5fc;color:#55365d;font-weight:600;border-radius:7px";
  fields.source.closest(".form-group")?.insertAdjacentElement("afterbegin", notice);
})();
