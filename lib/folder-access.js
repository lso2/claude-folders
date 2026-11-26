// lib/folder-access.js
// Chooses the data folder and allows its access from a click on the settings page, the one place both happen.
// Loaded by the settings page. Chrome shows its folder prompts only during a click in an extension tab.
// Globals: grantFolderAccess, chooseDataFolder, announceFolderAccess
// Depends on: lib/handle-storage.js (loadFolderHandle, saveFolderHandle), background.js (folderAccessChanged)
// Notes: docs/notes/lib/folder-access.js.md

// Must run inside a click handler. After a browser restart Chrome's prompt offers Allow on every visit,
// and in the session the folder was chosen in it offers Allow only.
async function grantFolderAccess() {
  const handle = await loadFolderHandle();
  if (!handle) return { granted: false, permission: 'none', folderName: '' };
  const permission = await handle.requestPermission({ mode: 'readwrite' });
  return { granted: permission === 'granted', permission, folderName: handle.name || '' };
}

// Must run inside a click handler. The chosen folder becomes the data folder, and the background writes the
// offline library into it once the choice is announced.
async function chooseDataFolder() {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
  await saveFolderHandle(handle);
  const permission = await handle.queryPermission({ mode: 'readwrite' });
  return { granted: permission === 'granted', permission, folderName: handle.name || '' };
}

// The background logs the change, tells the claude.ai tabs to read the state again and writes the offline library
async function announceFolderAccess(folderName) {
  await chrome.runtime.sendMessage({ action: 'folderAccessChanged', folderName: folderName || '' })
    .catch(e => console.log('[ACCESS] The background was not told about the folder access:', e.message));
}
