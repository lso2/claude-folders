// lib/auto-sync.js
// Starts a sync in an open claude.ai tab on a timer while automatic sync is turned on in the settings.
// Loaded by the background (CF_BACKGROUND_FILES in background.js).
// Globals: CF_AUTO_SYNC_ALARM, CF_AUTO_SYNC_BUSY_MS, cfReadAutoSync, cfNoteAutoSync,
//          cfScheduleAutoSync, cfRunAutoSync
// Depends on: lib/storage-keys.js (AUTO_SYNC_KEY, AUTO_SYNC_DEFAULT, AUTO_SYNC_MINUTES, AUTO_SYNC_LAST_KEY, RUN_STATE_KEY)
// Notes: docs/notes/lib/auto-sync.js.md

const CF_AUTO_SYNC_ALARM = 'cfAutoSync';
// An unfinished run whose record changed within this time is still running, and the timer waits for the next turn
const CF_AUTO_SYNC_BUSY_MS = 10 * 60 * 1000;

// The stored setting, with an interval the settings page offers
async function cfReadAutoSync() {
  const stored = (await chrome.storage.local.get(AUTO_SYNC_KEY))[AUTO_SYNC_KEY] || {};
  const minutes = AUTO_SYNC_MINUTES.includes(stored.minutes) ? stored.minutes : AUTO_SYNC_DEFAULT.minutes;
  return { enabled: typeof stored.enabled === 'boolean' ? stored.enabled : AUTO_SYNC_DEFAULT.enabled, minutes };
}

// The settings page shows the last attempt: started is false when no sync was started
async function cfNoteAutoSync(started, text) {
  console.log('[AUTO SYNC]', text);
  await chrome.storage.local.set({ [AUTO_SYNC_LAST_KEY]: { at: Date.now(), started, text } })
    .catch(e => console.log('[AUTO SYNC] Last attempt not stored:', e.message));
}

// The alarm follows the setting: created with its interval while on, cleared while off
async function cfScheduleAutoSync() {
  const setting = await cfReadAutoSync();
  const alarm = await chrome.alarms.get(CF_AUTO_SYNC_ALARM);
  if (!setting.enabled) {
    if (alarm) await chrome.alarms.clear(CF_AUTO_SYNC_ALARM);
    return;
  }
  if (alarm && alarm.periodInMinutes === setting.minutes) return;
  await chrome.alarms.create(CF_AUTO_SYNC_ALARM, { delayInMinutes: setting.minutes, periodInMinutes: setting.minutes });
  console.log('[AUTO SYNC] Every', setting.minutes, 'minutes');
}

// The sync runs in an open claude.ai tab, the active one first, and no tab is opened for it.
// A run still in progress, or no tab that answers, skips this turn.
async function cfRunAutoSync() {
  const setting = await cfReadAutoSync();
  if (!setting.enabled) return;
  const state = (await chrome.storage.local.get(RUN_STATE_KEY))[RUN_STATE_KEY];
  if (state && !state.done && Date.now() - (state.at || 0) < CF_AUTO_SYNC_BUSY_MS) {
    await cfNoteAutoSync(false, `Skipped: a ${state.run || 'sync'} is running in a claude.ai tab`);
    return;
  }
  const tabs = (await chrome.tabs.query({ url: 'https://claude.ai/*' })).filter(t => !t.discarded);
  if (!tabs.length) {
    await cfNoteAutoSync(false, 'Skipped: no claude.ai tab is open');
    return;
  }
  tabs.sort((a, b) => (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
  let lastError = '';
  for (const tab of tabs) {
    try {
      await chrome.tabs.sendMessage(tab.id, { action: 'startScrape', auto: true });
      await cfNoteAutoSync(true, `Started in claude.ai tab ${tab.id}`);
      return;
    } catch (e) {
      lastError = e.message;
    }
  }
  await cfNoteAutoSync(false, `Skipped: none of the ${tabs.length} claude.ai tabs answered (${lastError})`);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === CF_AUTO_SYNC_ALARM) cfRunAutoSync().catch(e => cfNoteAutoSync(false, `Not started: ${e.message}`));
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[AUTO_SYNC_KEY]) cfScheduleAutoSync().catch(e => console.log('[AUTO SYNC] Not scheduled:', e.message));
});
// Every start of the background checks the alarm against the setting
cfScheduleAutoSync().catch(e => console.log('[AUTO SYNC] Not scheduled:', e.message));
