const $ = (sel) => document.querySelector(sel);

function setStatus(msg) { $('#status').textContent = msg; }

async function storageGet(keys) { return await chrome.storage.local.get(keys); }
async function storageSet(obj) { return await chrome.storage.local.set(obj); }
async function storageClear() { return await chrome.storage.local.clear(); }
const uniq = (arr) => Array.from(new Set(arr));

function renderList(usernames) {
  const list = $('#list');
  list.innerHTML = '';
  if (!usernames.length) { list.innerHTML = '<div class="small">Liste boş.</div>'; return; }

  for (const u of usernames) {
    const row = document.createElement('div');
    row.className = 'item';

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.dataset.username = u;

    const a = document.createElement('a');
    a.href = `https://www.instagram.com/${u}/`;
    a.target = '_blank';
    a.rel = 'noreferrer';
    a.textContent = u;

    const actions = document.createElement('div');
    actions.className = 'actions';

    const btnGo = document.createElement('button');
    btnGo.className = 'act';
    btnGo.textContent = 'Git';
    btnGo.title = 'Profil sekmesini aç';
    btnGo.addEventListener('click', async (e) => {
      e.preventDefault();
      await chrome.tabs.create({ url: `https://www.instagram.com/${u}/` });
    });

    const btnUnfollow = document.createElement('button');
    btnUnfollow.className = 'act danger';
    btnUnfollow.textContent = 'Unfollow';
    btnUnfollow.title = 'Bu profili unfollow et (yeni sekmede çalışır)';
    btnUnfollow.addEventListener('click', async (e) => {
      e.preventDefault();
      btnUnfollow.disabled = true;
      setStatus(`${u} için unfollow deneniyor…`);
      try {
        // Open profile in a new tab (user gesture) and trigger unfollow via content script
        const tab = await chrome.tabs.create({ url: `https://www.instagram.com/${u}/`, active: true });

        // Wait for the tab to finish loading
        await new Promise((resolve) => {
          const timeout = setTimeout(resolve, 15000);
          function listener(tabId, info) {
            if (tabId === tab.id && info.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              clearTimeout(timeout);
              resolve();
            }
          }
          chrome.tabs.onUpdated.addListener(listener);
        });

        const resp = await chrome.tabs.sendMessage(tab.id, { action: 'UNFOLLOW_ON_PROFILE' }).catch(() => null);
        if (!resp) setStatus('İçerik scriptine ulaşılamadı. Sayfayı yenileyip tekrar dene.');
        else if (resp.ok) setStatus(`${u}: tamamlandı.`);
        else setStatus(`${u}: ${resp.error || 'başarısız'}`);
      } catch (err) {
        setStatus('Hata oluştu.');
      } finally {
        btnUnfollow.disabled = false;
      }
    });

    actions.appendChild(btnGo);
    actions.appendChild(btnUnfollow);

    row.appendChild(cb);
    row.appendChild(a);
    row.appendChild(actions);
    list.appendChild(row);
  }
}

async function compute() {
  const { followers = [], following = [] } = await storageGet(['followers','following']);
  const setFollowers = new Set(followers);
  const notFollowingBack = following.filter(u => !setFollowers.has(u));
  const unique = uniq(notFollowingBack).sort((a,b)=>a.localeCompare(b));

  await storageSet({ notFollowingBack: unique, lastComputedAt: Date.now() });

  $('#counts').textContent = `followers: ${followers.length} • following: ${following.length} • sonuç: ${unique.length}`;
  renderList(unique);
  setStatus('Karşılaştırma tamamlandı.');
}

async function startScan(listType) {
  // Popup closes easily; pick any instagram tab in the current window
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const instaTab = tabs.find(t => (t.url || '').startsWith('https://www.instagram.com/'));
  if (!instaTab?.id) { setStatus("Instagram sekmesi bulunamadı. Instagram\'ı açıp giriş yapın."); return; }

  setStatus(`${listType} taraması başlatıldı… (Instagram sekmesinde modal açık olmalı)`);
  const resp = await chrome.tabs.sendMessage(instaTab.id, { action:'START_SCAN', listType }).catch(()=>null);
  if (!resp) { setStatus('İçerik scripti cevap vermedi. Instagram sayfasını yenileyip tekrar deneyin.'); return; }
  if (resp.ok !== true) { setStatus(resp.error || 'Tarama başlatılamadı.'); return; }
}

async function openSelectedProfiles() {
  const cbs = Array.from(document.querySelectorAll('.item input[type="checkbox"]'));
  const selected = cbs.filter(cb => cb.checked).map(cb => cb.dataset.username);
  if (!selected.length) { setStatus('Seçim yok.'); return; }

  for (const u of selected) {
    await chrome.tabs.create({ url: `https://www.instagram.com/${u}/` });
    await new Promise(r => setTimeout(r, 250));
  }
  setStatus(`${selected.length} profil açıldı.`);
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'SCAN_PROGRESS') {
    $('#counts').textContent = msg.text;
    setStatus(msg.status || 'Taranıyor…');
  }
  if (msg?.type === 'SCAN_DONE') {
    setStatus(msg.status || 'Tarama bitti.');
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  $('#btnScanFollowers').addEventListener('click', () => startScan('followers'));
  $('#btnScanFollowing').addEventListener('click', () => startScan('following'));
  $('#btnCompute').addEventListener('click', compute);
  $('#btnClear').addEventListener('click', async () => {
    await storageClear();
    $('#counts').textContent = '—';
    renderList([]);
    setStatus('Veriler temizlendi.');
  });
  $('#btnOpenSelected').addEventListener('click', openSelectedProfiles);

  const { notFollowingBack = [], followers = [], following = [] } = await storageGet(['notFollowingBack','followers','following']);
  $('#counts').textContent = `followers: ${followers.length || 0} • following: ${following.length || 0} • sonuç: ${notFollowingBack.length || 0}`;
  renderList(notFollowingBack || []);
});
