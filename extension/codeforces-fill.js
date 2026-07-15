(async () => {
  const { pendingSubmission } = await chrome.storage.local.get("pendingSubmission");
  if (!pendingSubmission || Date.now() - pendingSubmission.createdAt > 30 * 60 * 1000) return;
  if (!Number.isInteger(pendingSubmission.contestId) || !/^[A-Z][0-9]?$/.test(pendingSubmission.index) || typeof pendingSubmission.sourceCode !== "string" || !pendingSubmission.sourceCode.trim() || pendingSubmission.sourceCode.length > 500_000 || (pendingSubmission.isGym !== undefined && typeof pendingSubmission.isGym !== "boolean")) {
    await chrome.storage.local.remove("pendingSubmission");
    return;
  }
  const source = document.querySelector('textarea[name="source"]');
  const problem = document.querySelector('select[name="submittedProblemIndex"]');
  const language = document.querySelector('select[name="programTypeId"]');
  if (!(source instanceof HTMLTextAreaElement)) return;
  if (problem instanceof HTMLSelectElement) {
    const option = [...problem.options].find((item) => item.value === pendingSubmission.index || item.textContent?.trim().startsWith(pendingSubmission.index));
    if (option) problem.value = option.value;
  }
  if (language instanceof HTMLSelectElement) {
    const option = [...language.options].find((item) => item.textContent?.includes(pendingSubmission.languageLabel || "GNU C++20"));
    if (option) language.value = option.value;
  }
  source.value = pendingSubmission.sourceCode;
  source.dispatchEvent(new Event("input", { bubbles: true }));
  source.dispatchEvent(new Event("change", { bubbles: true }));
  source.scrollIntoView({ behavior: "smooth", block: "center" });
  source.style.outline = "3px solid #b8f23e";
  await chrome.storage.local.remove("pendingSubmission");
  const notice = document.createElement("div");
  notice.textContent = "icpc-trainer 已填入代码。请检查题号、语言和代码后，手动点击 Submit。";
  notice.style.cssText = "margin:12px 0;padding:12px 14px;border:1px solid #9bc53d;background:#f5ffe3;color:#24320d;font-weight:600;border-radius:6px";
  source.insertAdjacentElement("beforebegin", notice);
})();
