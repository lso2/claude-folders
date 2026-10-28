// lib/folder-access.js
// Grants access to the data folder from a click and writes the exports queued while it was missing.
// Loaded by the access window and the popup, the two extension pages a user clicks in.
// Globals: grantFolderAccess, chooseDataFolder, readQueuedExports, flushQueuedExports
// Depends on: lib/storage-keys.js, lib/handle-storage.js, lib/export-files.js
// Notes: docs/notes/lib/folder-access.js.md

// Must run inside a click handler, where Chrome shows its permission prompt for the folder
async function grantFolderAccess() {
  const handle = await loadFolderHandle();
  if (!handle) return { granted: false, permission: 'none', folderName: '' };
  const permission = await handle.requestPermission({ mode: 'readwrite' });
  return { granted: permission === 'granted', permission, folderName: handle.name || '' };
}

// Must run inside a click handler; the chosen folder becomes the data folder
async function chooseDataFolder() {
  const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
  await saveFolderHandle(handle);
  const permission = await handle.queryPermission({ mode: 'readwrite' });
  return { granted: permission === 'granted', permission, folderName: handle.name || '' };
}

async function readQueuedExports() {
  const stored = await chrome.storage.local.get(QUEUED_EXPORTS_KEY);
  return Array.isArray(stored[QUEUED_EXPORTS_KEY]) ? stored[QUEUED_EXPORTS_KEY] : [];
}

// Exports that still fail stay queued with the reason from their last attempt
async function flushQueuedExports() {
  const queued = await readQueuedExports();
  const kept = [];
  const exportedIds = [];
  let written = 0;
  for (const item of queued) {
    const result = await writeExportFileChecked(item.filename, item.content);
    if (result.success) {
      written++;
      if (item.chatId) exportedIds.push(item.chatId);
    } else {
      kept.push({ ...item, lastError: result.error });
    }
  }
  if (exportedIds.length) {
    const stored = await chrome.storage.local.get(EXPORTED_CHATS_KEY);
    const exported = stored[EXPORTED_CHATS_KEY] || {};
    const now = new Date().toISOString();
    exportedIds.forEach(id => { exported[id] = now; });
    await chrome.storage.local.set({ [EXPORTED_CHATS_KEY]: exported });
  }
  await chrome.storage.local.set({ [QUEUED_EXPORTS_KEY]: kept });
  return { written, failed: kept.length, lastError: kept.length ? kept[kept.length - 1].lastError : null };
}
