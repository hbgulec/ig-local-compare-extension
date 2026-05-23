// Background (service worker)
// NOTE: We DO NOT need to relay messages, but some Chrome versions deliver content-script messages
// unreliably to extension pages. If we relay, we MUST avoid infinite loops.

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || (msg.type !== 'SCAN_PROGRESS' && msg.type !== 'SCAN_DONE')) return;

  // Only relay messages coming from a tab (content scripts). Avoid re-relaying our own.
  if (!sender?.tab) { sendResponse?.({ ok: true }); return; }
  if (msg.__relayed) { sendResponse?.({ ok: true }); return; }

  const relayed = { ...msg, __relayed: true };
  chrome.runtime.sendMessage(relayed).catch(()=>{});
  sendResponse?.({ ok: true });
});
