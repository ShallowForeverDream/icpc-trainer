function trustedSender(sender) {
  try {
    const url = new URL(sender.url || "");
    return url.origin === "https://icpc-trainer-shallowdream.safe-chime-4451.chatgpt.site"
      || (url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname));
  }
  catch { return false; }
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!trustedSender(sender)) return;
  if (message?.type === "OPEN_CODEFORCES_SUBMIT" && /^https:\/\/codeforces\.com\/problemset\/submit/.test(message.url)) {
    chrome.tabs.create({ url: message.url });
    return;
  }

  if (message?.type === "OPEN_UCUP_SUBMIT" && /^https:\/\/contest\.ucup\.ac\/contest\/\d+\/problem\/\d+\?v=1#tab-submit-answer$/.test(message.url)) {
    chrome.tabs.create({ url: message.url });
    return;
  }

  if (message?.type !== "FETCH_CODEFORCES_STATEMENT" || !/^https:\/\/codeforces\.com\/problemset\/problem\/\d+\/[A-Z][0-9]?(?:[/?#]|$)/.test(message.url)) return;
  (async () => {
    try {
      const response = await fetch(message.url, { credentials: "include", redirect: "follow", headers: { "Accept-Language": "en-US,en;q=0.9" } });
      const html = await response.text();
      if (!response.ok) throw new Error(`Codeforces HTTP ${response.status}`);
      if (!html.includes("problem-statement")) throw new Error("Codeforces 返回了验证页面，请先在新标签页打开原题并完成验证");
      sendResponse({ ok: true, html, url: response.url });
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : "原题面读取失败" });
    }
  })();
  return true;
});
