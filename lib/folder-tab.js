// lib/folder-tab.js
// Opens the settings page at its Data folder section in a browser tab, or focuses an open settings tab and opens that
// section in it.
// Loaded by the service worker (CF_BACKGROUND_FILES in background.js).
// Globals: CF_FOLDER_TAB_PATH, cfOpenFolderTab
// Notes: docs/notes/lib/folder-tab.js.md

// The settings page reads #folder as its Settings tab scrolled to the Data folder section (settings/settings-tabs.js)
const CF_FOLDER_TAB_PATH = 'settings/index.html';

// Choosing the folder and allowing access both need a click in an extension tab, where Chrome shows its prompt
async function cfOpenFolderTab() {
  const page = chrome.runtime.getURL(CF_FOLDER_TAB_PATH);
  const url = page + '#folder';
  // With no chrome-extension scheme in match patterns, the open tabs are compared by address
  const open = (await chrome.tabs.query({})).find(t => (t.url || '').startsWith(page));
  if (open) {
    await chrome.tabs.update(open.id, { url, active: true });
    await chrome.windows.update(open.windowId, { focused: true });
    return open.id;
  }
  const tab = await chrome.tabs.create({ url, active: true });
  return tab.id;
}
