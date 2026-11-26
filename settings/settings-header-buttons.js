// settings/settings-header-buttons.js
// The Sidebar header section: the Folders and Groups buttons in the title bar of Claude's sidebar, on or off.
// Globals: renderHeaderButtonsSection, onHeaderButtonsChange
// Depends on: lib/storage-keys.js (HEADER_BUTTONS_KEY), settings/settings-format.js (settingsShowResult)
// Notes: docs/notes/settings/settings-header-buttons.js.md

// Nothing stored counts as on
async function renderHeaderButtonsSection() {
  let stored;
  try {
    stored = (await chrome.storage.local.get(HEADER_BUTTONS_KEY))[HEADER_BUTTONS_KEY];
  } catch (e) {
    console.log('[SETTINGS] Header buttons setting not read:', e.message);
  }
  document.getElementById('headerButtonsOn').checked = stored !== false;
}

async function onHeaderButtonsChange() {
  const result = document.getElementById('headerButtonsResult');
  try {
    await chrome.storage.local.set({ [HEADER_BUTTONS_KEY]: document.getElementById('headerButtonsOn').checked });
    settingsShowResult(result, 'Saved.', false);
  } catch (e) {
    settingsShowResult(result, `${e.name}: ${e.message}`, true);
  }
}

document.getElementById('headerButtonsOn').addEventListener('change', onHeaderButtonsChange);
