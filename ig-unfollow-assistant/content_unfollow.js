// Optional: Provide a small floating button on profile pages to help unfollow with one click.
// This still requires user initiation (clicking the assist button) and works per-profile.

function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }

function isProfilePage() {
  const path = location.pathname.replace(/\/+$/, '/');
  // "/username/" (not "/p/..", "/reels/..", etc.)
  if (!/^\/[^\/]+\/$/.test(path)) return false;
  const u = path.split('/').filter(Boolean)[0];
  const bad = new Set(['accounts','explore','reels','p','direct','stories','about','api','web']);
  return !bad.has(u);
}

function findFollowButton() {
  // On profile header, the primary action button typically is a <button> with text "Following" / "Takiptesin" / "Follow" / "Takip Et"
  const buttons = Array.from(document.querySelectorAll('button'));
  const texts = buttons.map(b => (b.textContent || '').trim());
  for (const b of buttons) {
    const t = (b.textContent || '').trim().toLowerCase();
    if (!t) continue;
    if (t.includes('following') || t.includes('takiptesin') || t.includes('requested') || t.includes('istek gönderildi')) {
      return b;
    }
    if (t === 'follow' || t === 'takip et') return b;
  }
  return null;
}

async function clickUnfollowSequence() {
  const btn = findFollowButton();
  if (!btn) return { ok:false, error:'Follow/Following düğmesi bulunamadı.' };

  const t = (btn.textContent || '').trim().toLowerCase();
  if (t === 'follow' || t === 'takip et') {
    return { ok:false, error:'Bu profili zaten takip etmiyorsun.' };
  }

  btn.click();
  await sleep(400);

  // Confirmation dialog might appear with a button labeled "Unfollow" / "Takibi Bırak"
  const cand = Array.from(document.querySelectorAll('button')).find(b => {
    const tt = (b.textContent || '').trim().toLowerCase();
    return tt === 'unfollow' || tt === 'takibi bırak' || tt === 'takibi birak';
  });
  if (cand) {
    cand.click();
    return { ok:true };
  }

  // If no confirm, Instagram may have directly unfollowed.
  return { ok:true, note:'Onay penceresi bulunmadı; Instagram direkt işlem yapmış olabilir.' };
}

function ensureWidget() {
  if (document.getElementById('ig-unfollow-assist')) return;
  if (!isProfilePage()) return;

  const btn = document.createElement('button');
  btn.id = 'ig-unfollow-assist';
  btn.textContent = 'Unfollow Assist';
  btn.style.position = 'fixed';
  btn.style.right = '14px';
  btn.style.bottom = '14px';
  btn.style.zIndex = '999999';
  btn.style.padding = '10px 12px';
  btn.style.borderRadius = '999px';
  btn.style.border = '1px solid rgba(255,255,255,0.2)';
  btn.style.background = 'rgba(20,22,28,0.85)';
  btn.style.color = 'white';
  btn.style.fontWeight = '700';
  btn.style.cursor = 'pointer';
  btn.style.backdropFilter = 'blur(6px)';

  const msg = document.createElement('div');
  msg.id = 'ig-unfollow-assist-msg';
  msg.style.position = 'fixed';
  msg.style.right = '14px';
  msg.style.bottom = '58px';
  msg.style.zIndex = '999999';
  msg.style.maxWidth = '240px';
  msg.style.padding = '8px 10px';
  msg.style.borderRadius = '12px';
  msg.style.border = '1px solid rgba(255,255,255,0.12)';
  msg.style.background = 'rgba(20,22,28,0.85)';
  msg.style.color = 'rgba(255,255,255,0.85)';
  msg.style.fontSize = '12px';
  msg.style.display = 'none';
  msg.style.backdropFilter = 'blur(6px)';

  function show(text) {
    msg.textContent = text;
    msg.style.display = 'block';
    clearTimeout(show._t);
    show._t = setTimeout(()=>{ msg.style.display='none'; }, 2200);
  }

  btn.addEventListener('click', async () => {
    btn.disabled = true;
    show('İşleniyor…');
    try {
      const res = await clickUnfollowSequence();
      if (res.ok) show('Tamamlandı.');
      else show(res.error || 'Başarısız.');
    } catch {
      show('Hata oluştu.');
    } finally {
      btn.disabled = false;
    }
  });

  document.documentElement.appendChild(btn);
  document.documentElement.appendChild(msg);
}

// Observe navigation in SPA
let lastUrl = location.href;
setInterval(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    setTimeout(ensureWidget, 800);
  }
}, 500);

setTimeout(ensureWidget, 1200);


// Allow extension UI (popup) to trigger unfollow on the currently open profile tab.
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.action === 'UNFOLLOW_ON_PROFILE') {
    (async () => {
      try {
        if (!isProfilePage()) return { ok:false, error:'Bu sayfa profil sayfası değil.' };
        const res = await clickUnfollowSequence();
        return res;
      } catch (e) {
        return { ok:false, error:'Unfollow sırasında hata.' };
      }
    })().then(r => sendResponse(r));
    return true;
  }
});
