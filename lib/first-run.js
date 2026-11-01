// lib/first-run.js
// Opens the settings page on Help after the extension is installed.
// Loaded by the background (CF_BACKGROUND_FILES in background.js).
// Globals: cfOpenHelpOnInstall
// Depends on: lib/storage-keys.js (HELP_ON_OPEN_KEY)
// Notes: docs/notes/lib/first-run.js.md

// Only a new install opens the page. An update or a reload of the extension does not.
async function cfOpenHelpOnInstall(details) {
  if (!details || details.reason !== 'install') return;
  await chrome.storage.local.set({ [HELP_ON_OPEN_KEY]: true });
  await chrome.runtime.openOptionsPage();
}

chrome.runtime.onInstalled.addListener((details) => {
  cfOpenHelpOnInstall(details).catch(e => console.log('[BG] Help page not opened after install:', e.message));
});
