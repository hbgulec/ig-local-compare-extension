// Collect followers/following usernames by auto-scrolling the modal list.
// Runs on instagram.com pages. This script stores results in chrome.storage.local.

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function parseUsernameFromHref(href) {
  // Instagram profile URLs look like "/username/" (sometimes with query)
  if (!href) return null;
  try {
    const u = new URL(href, location.origin);
    const m = u.pathname.match(/^\/([^\/]+)\/$/);
    if (!m) return null;
    const name = m[1];
    if (!name) return null;
    // exclude common non-profile paths
    const bad = new Set(['accounts', 'explore', 'reels', 'p', 'direct', 'stories', 'about', 'api', 'web']);
    if (bad.has(name)) return null;
    return name;
  } catch {
    // href might be relative already
    const m = href.match(/^\/([^\/]+)\/$/);
    return m ? m[1] : null;
  }
}

function findDialog() {
  // Modal dialog typically has role="dialog"
  return document.querySelector('div[role="dialog"]');
}

function findScrollableInDialog(dialog) {
  if (!dialog) return null;
  // Heuristic: pick the largest element with overflow auto/scroll and scrollHeight > clientHeight
  const candidates = Array.from(dialog.querySelectorAll('div, ul')).filter(el => {
    const st = getComputedStyle(el);
    const overflowY = st.overflowY;
    return (overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight + 20;
  });

  if (!candidates.length) {
    // fallback: sometimes list container is a UL with parent scroll
    const ul = dialog.querySelector('ul');
    if (ul && ul.parentElement && ul.parentElement.scrollHeight > ul.parentElement.clientHeight + 20) {
      return ul.parentElement;
    }
    return null;
  }

  candidates.sort((a,b) => (b.clientHeight*b.clientWidth) - (a.clientHeight*a.clientWidth));
  return candidates[0];
}

function collectUsernames(dialog) {
  const anchors = Array.from(dialog.querySelectorAll('a[href^="/"]'));
  const names = [];
  for (const a of anchors) {
    const name = parseUsernameFromHref(a.getAttribute('href'));
    if (name) names.push(name);
  }
  return names;
}

async function scanList(listType) {
  const dialog = findDialog();
  if (!dialog) {
    return { ok: false, error: 'Takipçi/Takip edilen modalı bulunamadı. Profilinizde followers/following penceresini açın (veya verdiğiniz /followers/ /following/ linkini açın).' };
  }

  const scroller = findScrollableInDialog(dialog);
  if (!scroller) {
    return { ok: false, error: 'Kaydırılabilir liste alanı bulunamadı. Instagram arayüzü değişmiş olabilir; sayfayı yenileyin ve tekrar deneyin.' };
  }

  const seen = new Set();
  let stableRounds = 0;
  let lastCount = 0;

  for (let i=0; i<400; i++) { // safety cap
    const batch = collectUsernames(dialog);
    for (const u of batch) seen.add(u);

    const count = seen.size;

    // progress update
    chrome.runtime.sendMessage({
      type: 'SCAN_PROGRESS',
      status: `Taranıyor: ${listType}`,
      text: `${listType}: ${count} bulundu`
    }).catch(() => {});

    // scroll down
    scroller.scrollTop = scroller.scrollHeight;
    await sleep(800);

    if (count === lastCount) stableRounds += 1;
    else stableRounds = 0;

    lastCount = count;

    // If list is fully loaded, no new items for a few rounds
    if (stableRounds >= 6) break;
  }

  const usernames = Array.from(seen);

  const key = listType === 'followers' ? 'followers' : 'following';
  await chrome.storage.local.set({ [key]: usernames, [`${key}ScannedAt`]: Date.now() });

  chrome.runtime.sendMessage({
    type: 'SCAN_DONE',
    status: `Tarama bitti: ${listType} (${usernames.length})`,
    text: `followers/following verisi kaydedildi.`
  }).catch(() => {});

  return { ok: true, count: usernames.length };
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === 'START_SCAN') {
    const { listType } = msg;
    scanList(listType).then(res => sendResponse(res));
    return true; // async
  }
});
