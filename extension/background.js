chrome.runtime.onMessage.addListener((message) => {
  if (message?.type === "OPEN_CODEFORCES_SUBMIT" && /^https:\/\/codeforces\.com\/problemset\/submit/.test(message.url)) {
    chrome.tabs.create({ url: message.url });
  }
});
