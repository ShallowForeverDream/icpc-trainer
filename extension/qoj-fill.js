(async () => {
  const { pendingArchiveSubmission } = await chrome.storage.local.get("pendingArchiveSubmission");
  if (!pendingArchiveSubmission || Date.now() - pendingArchiveSubmission.createdAt > 30 * 60 * 1000) return;

  const report = (stage, message, extra = {}) => chrome.runtime.sendMessage({
    type: "JUDGE_SUBMIT_STATUS",
    judge: "ucup",
    requestId: pendingArchiveSubmission.requestId,
    originTabId: pendingArchiveSubmission.originTabId,
    archiveContestId: pendingArchiveSubmission.archiveContestId,
    qojContestId: pendingArchiveSubmission.qojContestId,
    slot: pendingArchiveSubmission.slot,
    stage,
    message,
    ...extra,
  });
  const finishWithError = async (stage, message) => {
    await chrome.storage.local.remove("pendingArchiveSubmission");
    await report(stage, message);
  };

  if (pendingArchiveSubmission.phase === "tracking") {
    const submissionsPath = new RegExp(`^/contest/${pendingArchiveSubmission.qojContestId}/submissions/?$`);
    if (!submissionsPath.test(location.pathname)) return;
    for (let attempt = 0; attempt < 240; attempt += 1) {
      const rows = [...document.querySelectorAll("table tbody tr")];
      let row = null;
      if (Number.isInteger(pendingArchiveSubmission.submissionId)) {
        row = rows.find((item) => item.querySelector(`a[href='/submission/${pendingArchiveSubmission.submissionId}']`));
      } else {
        row = rows.find((item) => {
          const problemLink = item.querySelector(`a[href^='/contest/${pendingArchiveSubmission.qojContestId}/problem/${pendingArchiveSubmission.problemId}']`);
          return Boolean(problemLink);
        });
        const idLink = row?.querySelector("a[href^='/submission/']");
        const idMatch = idLink?.getAttribute("href")?.match(/^\/submission\/(\d+)$/);
        if (idMatch) {
          pendingArchiveSubmission.submissionId = Number(idMatch[1]);
          await chrome.storage.local.set({ pendingArchiveSubmission });
        }
      }

      if (row) {
        const scoreLink = row.querySelector("a.uoj-score[href^='/submission/']");
        if (scoreLink) {
          const score = Number(scoreLink.textContent?.trim());
          const verdict = Number.isFinite(score) && score >= 99.999 ? "AC" : "WA";
          await chrome.storage.local.remove("pendingArchiveSubmission");
          await report("judged", verdict === "AC" ? "Accepted · 已自动计入 VP 排名" : `未通过（${Number.isFinite(score) ? score : 0} 分）· 已自动计入罚时`, { verdict, submissionId: pendingArchiveSubmission.submissionId });
          return;
        }
        const resultLink = [...row.querySelectorAll("a.small[href^='/submission/']")].find((item) => item.getAttribute("href") === `/submission/${pendingArchiveSubmission.submissionId}`);
        const resultText = resultLink?.textContent?.trim() || "";
        if (resultText && !/Waiting|Judging|Rejudge|Queued/i.test(resultText)) {
          await chrome.storage.local.remove("pendingArchiveSubmission");
          await report("judged", `${resultText} · 已自动计入罚时`, { verdict: "WA", submissionId: pendingArchiveSubmission.submissionId });
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await chrome.storage.local.remove("pendingArchiveSubmission");
    await report("judged", "判题时间较长，可在平台提交记录中继续查看");
    return;
  }

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
    const candidates = [...(form || document).querySelectorAll(".button-submit-answer, #button-submit-answer, button[type='submit'], input[type='submit']")];
    const submitButton = candidates.find((item) => /submit|提交/i.test(`${item.value || ""} ${item.textContent || ""} ${item.className || ""}`));
    if (!(submitButton instanceof HTMLElement)) {
      await finishWithError("failed", "已填入代码，但没有找到 Universal Cup / QOJ 的提交按钮");
      return;
    }
    pendingArchiveSubmission.phase = "tracking";
    delete pendingArchiveSubmission.sourceCode;
    await chrome.storage.local.set({ pendingArchiveSubmission });
    await report("submitted", "代码已送达 Universal Cup / QOJ，正在等待判题");
    submitButton.click();
    return;
  }

  fields.source.scrollIntoView({ behavior: "smooth", block: "center" });
  fields.source.style.outline = "3px solid #c67ad8";
  await chrome.storage.local.remove("pendingArchiveSubmission");
})();
