// settings/settings-auto-sync.js
// The Automatic sync section: turning it on, its interval and the last attempt.
// Globals: autoSyncLabel, renderAutoSyncSection, renderAutoSyncLast, onAutoSyncChange
// Depends on: lib/storage-keys.js (AUTO_SYNC_KEY, AUTO_SYNC_DEFAULT, AUTO_SYNC_MINUTES, AUTO_SYNC_LAST_KEY),
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
  try {
    setting = { ...AUTO_SYNC_DEFAULT, ...((await chrome.storage.local.get(AUTO_SYNC_KEY))[AUTO_SYNC_KEY] || {}) };
  } catch (e) {
    console.log('[SETTINGS] Automatic sync setting not read:', e.message);
  }
  document.getElementById('autoSyncOn').checked = typeof setting.enabled === 'boolean' ? setting.enabled : AUTO_SYNC_DEFAULT.enabled;
  select.value = String(AUTO_SYNC_MINUTES.includes(setting.minutes) ? setting.minutes : AUTO_SYNC_DEFAULT.minutes);
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
  try {
    await chrome.storage.local.set({ [AUTO_SYNC_KEY]: { enabled, minutes } });
    settingsShowResult(result, enabled ? `Saved. The sync runs every ${autoSyncLabel(minutes)}.` : 'Saved. Automatic sync is off.', false);
  } catch (e) {
    settingsShowResult(result, `${e.name}: ${e.message}`, true);
  }
}

document.getElementById('autoSyncOn').addEventListener('change', onAutoSyncChange);
document.getElementById('autoSyncMinutes').addEventListener('change', onAutoSyncChange);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[AUTO_SYNC_LAST_KEY]) renderAutoSyncLast();
});
