chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["rep_wallet"]).then((x) => {
    if (!x.rep_wallet) chrome.storage.local.set({ rep_wallet: null });
  });
});

// Meneruskan request JSON-RPC dari content script ke RPC (menghindari CORS di x.com).
// Origin RPC harus ada di host_permissions pada manifest.json.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || msg.type !== "rpc") return;
  fetch(msg.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(msg.payload)
  })
    .then((r) => r.json())
    .then((result) => sendResponse({ result }))
    .catch((e) => sendResponse({ error: String(e) }));
  return true; // respons asinkron
});
