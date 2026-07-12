(async () => {
  const { pendingSubmission } = await chrome.storage.local.get("pendingSubmission");
  if (!pendingSubmission || Date.now() - pendingSubmission.createdAt > 30 * 60 * 1000) return;
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
})();
