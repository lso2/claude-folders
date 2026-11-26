// settings/settings-auto-sync.js
// The Automatic sync section: turning it on, its interval, hiding the new chats notice and the last attempt.
// Globals: autoSyncLabel, renderAutoSyncSection, renderAutoSyncLast, onAutoSyncChange, onHideNoticeChange
// Depends on: lib/storage-keys.js (AUTO_SYNC_KEY, AUTO_SYNC_DEFAULT, AUTO_SYNC_MINUTES, AUTO_SYNC_LAST_KEY, HIDE_SYNC_NOTICE_KEY),
//             settings/settings-format.js (settingsTime, settingsShowResult), lib/auto-sync.js (the background's timer)
// Notes: docs/notes/settings/settings-auto-sync.js.md

function autoSyncLabel(minutes) {
  if (minutes < 60) return `${minutes} minutes`;
  const hours = minutes / 60;
  return hours === 1 ? '1 hour' : `${hours} hours`;
}

async function renderAutoSyncSection() {
  const select = document.getElementById('autoSyncMinutes');
  if (!select.options.length) {
    select.innerHTML = AUTO_SYNC_MINUTES.map(m => `<option value="${m}">${autoSyncLabel(m)}</option>`).join('');
  }
  let setting = AUTO_SYNC_DEFAULT;
  let hide;
  try {
    const stored = await chrome.storage.local.get([AUTO_SYNC_KEY, HIDE_SYNC_NOTICE_KEY]);
    setting = { ...AUTO_SYNC_DEFAULT, ...(stored[AUTO_SYNC_KEY] || {}) };
    hide = stored[HIDE_SYNC_NOTICE_KEY];
  } catch (e) {
    console.log('[SETTINGS] Automatic sync setting not read:', e.message);
  }
  const enabled = typeof setting.enabled === 'boolean' ? setting.enabled : AUTO_SYNC_DEFAULT.enabled;
  document.getElementById('autoSyncOn').checked = enabled;
  select.value = String(AUTO_SYNC_MINUTES.includes(setting.minutes) ? setting.minutes : AUTO_SYNC_DEFAULT.minutes);
  // The notice choice applies only while automatic sync is on. Nothing stored counts as checked.
  const hideBox = document.getElementById('autoSyncHideNotice');
  hideBox.checked = hide !== false;
  hideBox.disabled = !enabled;
  await renderAutoSyncLast();
}

// The last attempt as lib/auto-sync.js or content/cf-sync.js stored it
async function renderAutoSyncLast() {
  const el = document.getElementById('autoSyncLast');
  let last = null;
  try {
    last = (await chrome.storage.local.get(AUTO_SYNC_LAST_KEY))[AUTO_SYNC_LAST_KEY] || null;
  } catch (e) {
    console.log('[SETTINGS] Last automatic sync not read:', e.message);
  }
  el.textContent = last ? `Last automatic sync, ${settingsTime(last.at)}: ${last.text}` : 'No automatic sync has run yet.';
}

async function onAutoSyncChange() {
  const result = document.getElementById('autoSyncResult');
  const enabled = document.getElementById('autoSyncOn').checked;
  const minutes = Number(document.getElementById('autoSyncMinutes').value);
  document.getElementById('autoSyncHideNotice').disabled = !enabled;
  try {
    await chrome.storage.local.set({ [AUTO_SYNC_KEY]: { enabled, minutes } });
    settingsShowResult(result, enabled ? `Saved. The sync runs every ${autoSyncLabel(minutes)}.` : 'Saved. Automatic sync is off.', false);
  } catch (e) {
    settingsShowResult(result, `${e.name}: ${e.message}`, true);
  }
}

async function onHideNoticeChange() {
  const result = document.getElementById('autoSyncResult');
  const hide = document.getElementById('autoSyncHideNotice').checked;
  try {
    await chrome.storage.local.set({ [HIDE_SYNC_NOTICE_KEY]: hide });
    settingsShowResult(result, hide ? 'Saved. The new chats notice is hidden while automatic sync is on.' : 'Saved. The new chats notice is shown.', false);
  } catch (e) {
    settingsShowResult(result, `${e.name}: ${e.message}`, true);
  }
}

document.getElementById('autoSyncOn').addEventListener('change', onAutoSyncChange);
document.getElementById('autoSyncMinutes').addEventListener('change', onAutoSyncChange);
document.getElementById('autoSyncHideNotice').addEventListener('change', onHideNoticeChange);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[AUTO_SYNC_LAST_KEY]) renderAutoSyncLast();
});
