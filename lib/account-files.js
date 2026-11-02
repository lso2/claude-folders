// lib/account-files.js
// Reads the account data files in the data folder: data.<account key>.json, one per account that synced.
// Loaded by the offscreen document and the access window, the pages that answer folder requests.
// Globals: readAccountFiles, retireAccountFile
// Depends on: lib/handle-storage.js (checkFolderAccess, loadFolderHandle), lib/account-file-list.js (cfListAccountFiles, CF_ACCOUNT_FILE_PATTERN)
// Notes: docs/notes/lib/account-files.js.md

// known maps a file name to the lastModified of the copy the caller holds. A file with that same
// time is listed without its data.
async function readAccountFiles(known) {
  const access = await checkFolderAccess();
  if (!access.hasHandle) return { success: false, code: 'no-folder', error: access.error || 'No data folder is selected' };
  if (access.permission !== 'granted') return { success: false, code: 'permission', error: `Access to the data folder is "${access.permission}"` };
  const files = [];
  try {
    files.push(...await cfListAccountFiles(await loadFolderHandle(), known));
  } catch (e) {
    return { success: false, code: 'read', error: `${e.name}: ${e.message}` };
  }
  return { success: true, folderName: access.folderName, files };
}

// Removes data.<key>.json when it records the login with this uuid. A login moved to its own key in
// 1.4.0 writes a new file, and the file named for its organization is then its older copy.
async function retireAccountFile(key, uuid) {
  const access = await checkFolderAccess();
  if (!access.hasHandle) return { success: false, code: 'no-folder', error: access.error || 'No data folder is selected' };
  if (access.permission !== 'granted') return { success: false, code: 'permission', error: `Access to the data folder is "${access.permission}"` };
  const name = 'data.' + String(key || '').replace(/[^a-z0-9_-]/gi, '') + '.json';
  if (!CF_ACCOUNT_FILE_PATTERN.test(name)) return { success: false, error: `not an account data file name: ${name}` };
  try {
    const handle = await loadFolderHandle();
    let file;
    try {
      file = await (await handle.getFileHandle(name)).getFile();
    } catch (e) {
      if (e.name === 'NotFoundError') return { success: true, removed: false, reason: `${name} is not in the folder` };
      throw e;
    }
    const data = JSON.parse(await file.text());
    const recorded = data && data.metadata && data.metadata.account;
    if (!recorded || recorded.uuid !== uuid) return { success: true, removed: false, reason: `${name} records another login` };
    await handle.removeEntry(name);
    return { success: true, removed: true };
  } catch (e) {
    return { success: false, error: `${e.name}: ${e.message}` };
  }
}
