// lib/access-window.js
// Opens the data folder access window, the extension page that asks Chrome for folder access and holds it.
// Loaded by the background (CF_BACKGROUND_FILES in background.js).
// Globals: CF_ACCESS_PAGE, accessWindowId, cfFindAccessWindow, openAccessWindow, cfAskAccessOnStartup
// Depends on: background.js (askFolderWorker), called after background.js has run
// Notes: docs/notes/lib/access-window.js.md

const CF_ACCESS_PAGE = 'access/index.html';
// The window's id while it is open. A restarted service worker finds it again among the open tabs.
let accessWindowId = null;

async function cfFindAccessWindow() {
  if (accessWindowId !== null) {
    try {
      await chrome.windows.get(accessWindowId);
      return accessWindowId;
    } catch (e) {
      accessWindowId = null;
    }
  }
  const page = chrome.runtime.getURL(CF_ACCESS_PAGE);
  const tab = (await chrome.tabs.query({})).find(t => (t.url || '').startsWith(page));
  accessWindowId = tab ? tab.windowId : null;
  return accessWindowId;
}

// mode 'setup' chooses the data folder, 'restore' asks for it again after a browser start, and 'hold' keeps
// the access of a folder chosen on another extension page for the rest of the browser session, minimized.
// Without a mode the window only shows the folder state.
async function openAccessWindow(mode) {
  const query = mode === 'setup' || mode === 'restore' ? `?mode=${mode}` : '';
  const url = chrome.runtime.getURL(CF_ACCESS_PAGE + query);
  const open = await cfFindAccessWindow();
  if (open !== null) {
    if (mode === 'hold') return open;
    if (query) {
      const [tab] = await chrome.tabs.query({ windowId: open });
      if (tab) await chrome.tabs.update(tab.id, { url });
    }
    await chrome.windows.update(open, { state: 'normal', focused: true });
    return open;
  }
  const win = await chrome.windows.create({ url, type: 'popup', width: 460, height: 520, focused: mode !== 'hold' });
  accessWindowId = win && typeof win.id === 'number' ? win.id : null;
  if (mode === 'hold' && accessWindowId !== null) await chrome.windows.update(accessWindowId, { state: 'minimized' });
  return accessWindowId;
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === accessWindowId) accessWindowId = null;
});

// Chrome keeps folder access through a browser start only after it was allowed on every visit. Without that
// choice the window opens once, and its one button brings Chrome's prompt that offers it.
async function cfAskAccessOnStartup() {
  const access = await askFolderWorker({ action: 'folderCheckAccess' }, { success: false });
  console.log('[ACCESS] Folder access at browser start:', access.success ? (access.hasHandle ? access.permission : 'no folder') : access.error);
  if (access.success && access.hasHandle && access.permission !== 'granted') await openAccessWindow('restore');
}

chrome.runtime.onStartup.addListener(() => {
  cfAskAccessOnStartup().catch(e => console.log('[ACCESS] Browser start check not run:', e.message));
});
