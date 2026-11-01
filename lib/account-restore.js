// lib/account-restore.js
// Reads a login's folders back from its data file when the extension's storage holds none for it.
// Loaded by the background (CF_BACKGROUND_FILES in background.js).
// Globals: cfReadAccountFile
// Depends on: background.js (askFolderWorker), lib/account-files.js (readAccountFiles, run by the folder worker)
// Notes: docs/notes/lib/account-restore.js.md

// Removing the extension empties its storage, and the login's folders are then only in data.<key>.json in
// the data folder. Returns that file's data when it has folders, else null with the reason logged.
async function cfReadAccountFile(key) {
  const want = String(key || '').toLowerCase();
  const answer = await askFolderWorker({ action: 'folderReadAccountFiles', known: null }, { success: false, error: 'the folder worker returned no result' });
  if (!answer || !answer.success) {
    console.log('[BG] Data file of account', key, 'not read:', (answer && answer.error) || 'no answer');
    return null;
  }
  const file = (answer.files || []).find(f => String(f.key).toLowerCase() === want);
  if (!file) {
    console.log('[BG] The data folder has no data file for account', key);
    return null;
  }
  if (file.error) {
    console.log('[BG]', file.name, 'not parsed:', file.error);
    return null;
  }
  const data = file.data;
  if (!data || !Array.isArray(data.folders) || !data.folders.length) {
    console.log('[BG]', file.name, 'has no folders');
    return null;
  }
  console.log('[BG] Folders of account', key, 'read from', file.name + ':', data.folders.length, 'folders');
  return data;
}
