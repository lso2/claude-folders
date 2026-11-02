// lib/library-refresh.js
// Writes the offline library's page and files into the data folder again after the extension is updated or reloaded.
// Loaded by the service worker (CF_BACKGROUND_FILES in background.js).
// Globals: cfRefreshLibraryAfterUpdate
// Depends on: background.js (askFolderWorker), lib/folder-ops.js (folderRefreshLibrary), lib/activity-log.js (cfLogActivity)
// Notes: docs/notes/lib/library-refresh.js.md

// A data folder without access at this time gets the files from its next save (lib/data-file.js writeDataFile)
async function cfRefreshLibraryAfterUpdate(details) {
  if (details.reason !== 'update') return;
  const answer = await askFolderWorker({ action: 'folderRefreshLibrary' }, { success: false });
  if (answer && answer.success) cfLogActivity('Extension', 'Offline library files written to the data folder');
  else cfLogActivity('Extension', `Offline library files not written: ${(answer && answer.error) || 'the folder writer gave no answer'}`);
}

chrome.runtime.onInstalled.addListener((details) => {
  cfRefreshLibraryAfterUpdate(details).catch(e => console.log('[BG] Offline library files not written:', e.message));
});
