// settings/settings-group-sync.js
// The Claude groups section: turning the link between Claude's sidebar groups and their folders on and off.
// Globals: renderGroupSyncSection, onGroupSyncChange
// Depends on: lib/storage-keys.js (GROUP_FOLDER_SYNC_KEY), settings/settings-format.js (settingsShowResult)
// Notes: docs/notes/settings/settings-group-sync.js.md

// Nothing stored counts as on
async function renderGroupSyncSection() {
  let stored;
  try {
    stored = (await chrome.storage.local.get(GROUP_FOLDER_SYNC_KEY))[GROUP_FOLDER_SYNC_KEY];
  } catch (e) {
    console.log('[SETTINGS] Claude groups setting not read:', e.message);
  }
  document.getElementById('groupSyncOn').checked = stored !== false;
}

async function onGroupSyncChange() {
  const on = document.getElementById('groupSyncOn').checked;
  const result = document.getElementById('groupSyncResult');
  try {
    await chrome.storage.local.set({ [GROUP_FOLDER_SYNC_KEY]: on });
    settingsShowResult(result, 'Saved.', false);
  } catch (e) {
    settingsShowResult(result, `${e.name}: ${e.message}`, true);
  }
}

document.getElementById('groupSyncOn').addEventListener('change', onGroupSyncChange);
