// lib/library-refresh.js
// Writes the offline library's page and files into the data folder after an update and after a folder change.
// Loaded by the service worker (CF_BACKGROUND_FILES in background.js).
// Globals: cfWriteLibraryFiles, cfRefreshLibraryAfterUpdate
// Depends on: lib/folder-worker.js (askFolderWorker), lib/folder-ops.js (folderRefreshLibrary), lib/activity-log.js (cfLogActivity)
// Notes: docs/notes/lib/library-refresh.js.md

// The answer is logged either way. Without access at this time the files are written after the next grant.
async function cfWriteLibraryFiles() {
  const answer = await askFolderWorker({ action: 'folderRefreshLibrary' }, { success: false });
  if (answer && answer.success) cfLogActivity('Extension', 'Offline library files written to the data folder');
  else cfLogActivity('Extension', `Offline library files not written: ${(answer && answer.error) || 'the folder writer gave no answer'}`);
  return answer;
}

async function cfRefreshLibraryAfterUpdate(details) {
  if (details.reason === 'update') await cfWriteLibraryFiles();
}

chrome.runtime.onInstalled.addListener((details) => {
  cfRefreshLibraryAfterUpdate(details).catch(e => console.log('[BG] Offline library files not written:', e.message));
});
