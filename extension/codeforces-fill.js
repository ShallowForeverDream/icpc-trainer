(async () => {
  const pendingSubmission = (await chrome.runtime.sendMessage({ type: "GET_PENDING_SUBMISSION", judge: "codeforces" }))?.submission;
  if (!pendingSubmission || Date.now() - pendingSubmission.createdAt > 30 * 60 * 1000) return;

  const report = (stage, message, extra = {}) => chrome.runtime.sendMessage({
    type: "JUDGE_SUBMIT_STATUS",
    judge: "codeforces",
    requestId: pendingSubmission.requestId,
    originTabId: pendingSubmission.originTabId,
    archiveContestId: pendingSubmission.archiveContestId,
    slot: pendingSubmission.slot,
    stage,
    message,
    ...extra,
  });
  const finishWithError = async (stage, message) => {
    await report(stage, message);
  };

  if (pendingSubmission.phase === "tracking") {
    const problemPaths = pendingSubmission.isGym
      ? [`/gym/${pendingSubmission.contestId}/problem/${pendingSubmission.index}`]
      : [`/problemset/problem/${pendingSubmission.contestId}/${pendingSubmission.index}`, `/contest/${pendingSubmission.contestId}/problem/${pendingSubmission.index}`];
    for (let attempt = 0; attempt < 2400; attempt += 1) {
      const rows = [...document.querySelectorAll("tr[data-submission-id], .status-frame-datatable tbody tr")];
      let row = null;
      if (Number.isInteger(pendingSubmission.submissionId)) {
        row = rows.find((item) => Number(item.getAttribute("data-submission-id")) === pendingSubmission.submissionId
          || Boolean(item.querySelector(`a[href$='/submission/${pendingSubmission.submissionId}']`)));
      } else {
        row = rows.find((item) => [...item.querySelectorAll("a[href]")].some((link) => {
          try { return problemPaths.includes(new URL(link.href, location.href).pathname); } catch { return false; }
        }));
        const rawId = row?.getAttribute("data-submission-id")
          || row?.querySelector("a[href*='/submission/']")?.getAttribute("href")?.match(/\/submission\/(\d+)/)?.[1];
        if (rawId && Number.isInteger(Number(rawId))) {
          pendingSubmission.submissionId = Number(rawId);
          await chrome.runtime.sendMessage({ type: "UPDATE_PENDING_SUBMISSION", judge: "codeforces", requestId: pendingSubmission.requestId, submissionId: pendingSubmission.submissionId });
        }
      }

      if (row) {
        const verdictCell = row.querySelector(".status-verdict-cell, .verdict-accepted, .verdict-rejected");
        const verdictText = verdictCell?.textContent?.replace(/\s+/g, " ").trim() || "";
        if (/Accepted/i.test(verdictText)) {
          await report("judged", "Accepted · 判题结果已同步到平台", { verdict: "AC", submissionId: pendingSubmission.submissionId });
          return;
        }
        if (verdictText && !/In queue|Running|Judging|Testing|Compiling|Submitted|Queued/i.test(verdictText)) {
          await report("judged", `${verdictText} · 判题结果已同步到平台`, { verdict: "WA", submissionId: pendingSubmission.submissionId });
          return;
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    await report("submitted", "判题超过 20 分钟，请在平台提交记录中稍后刷新");
    return;
  }

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
    const aliases = wanted.includes("C++23") ? ["C++23", "G++23"]
      : wanted.includes("C++20") ? ["C++20", "G++20"]
        : wanted.includes("C++17") ? ["C++17", "G++17"]
          : wanted.includes("C11") ? ["C11", "GNU C11"]
            : wanted.includes("PyPy") ? ["PyPy 3", "PyPy"]
              : wanted.includes("Python") ? ["Python 3", "Python"]
                : wanted.includes("Java 21") ? ["Java 21"]
                  : wanted.includes("Java 17") ? ["Java 17", "Java"]
                    : wanted.includes("Kotlin") ? ["Kotlin"]
                      : wanted.includes("Rust") ? ["Rust"] : [wanted];
    const option = [...language.options].find((item) => aliases.some((alias) => item.textContent?.includes(alias)))
      || [...language.options].find((item) => wanted.includes("C++") && /C\+\+20|G\+\+20/.test(item.textContent || ""));
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
    pendingSubmission.phase = "tracking";
    delete pendingSubmission.sourceCode;
    await chrome.runtime.sendMessage({ type: "UPDATE_PENDING_SUBMISSION", judge: "codeforces", requestId: pendingSubmission.requestId, phase: "tracking", removeSource: true });
    await report("submitted", "代码已送达 Codeforces，正在等待判题");
    submitButton.click();
    return;
  }

  source.scrollIntoView({ behavior: "smooth", block: "center" });
  source.style.outline = "3px solid #c67ad8";
  const notice = document.createElement("div");
  notice.textContent = "icpc-trainer 已填入代码，请检查后提交。";
  notice.style.cssText = "margin:12px 0;padding:12px 14px;border:1px solid #c894d6;background:#fff5fc;color:#55365d;font-weight:600;border-radius:7px";
  source.insertAdjacentElement("beforebegin", notice);
})();
