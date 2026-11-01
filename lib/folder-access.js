// lib/folder-access.js
// Grants access to the data folder from a click and writes the exports queued while it was missing.
// Loaded by the access window, the popup, the organizer and the settings page, the extension pages a user clicks in.
// Globals: grantFolderAccess, chooseDataFolder, readQueuedExports, flushQueuedExports, announceFolderAccess
// Depends on: lib/storage-keys.js, lib/handle-storage.js, lib/export-files.js, lib/export-state.js
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
  const exported = [];
  let written = 0;
  for (const item of queued) {
    const result = await writeExportFileChecked(item.filename, item.content);
    if (result.success) {
      written++;
      // A queued item has the export format of the build that queued it; an item queued before formats were recorded has none
      if (item.chatId) exported.push({ chatId: item.chatId, filename: item.filename, mark: item.mark || null, format: item.format || null });
    } else {
      kept.push({ ...item, lastError: result.error });
    }
  }
  await recordExports(exported);
  await chrome.storage.local.set({ [QUEUED_EXPORTS_KEY]: kept });
  return { written, failed: kept.length, lastError: kept.length ? kept[kept.length - 1].lastError : null };
}

// Writes the queued exports and tells the background and the claude.ai tabs that access changed
async function announceFolderAccess() {
  const flushed = await flushQueuedExports();
  await chrome.runtime.sendMessage({ action: 'folderAccessChanged', written: flushed.written, failed: flushed.failed }).catch(() => {});
  return flushed;
}
