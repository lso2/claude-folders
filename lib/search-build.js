// lib/search-build.js
// Brings the content search index up to date with the export files in chats/, one time slice per request.
// Loaded by the access window and the offscreen writer, which answer the background's folderIndexExports.
// Globals: cfIndexExportsStep
// Depends on: lib/handle-storage.js (loadFolderHandle, checkFolderAccess), lib/search-index.js (cfIndexChatsStep)
// Notes: docs/notes/lib/search-build.js.md

// The data folder's access is checked first. A step with access reads the chats folder (lib/search-index.js).
async function cfIndexExportsStep(after) {
  const access = await checkFolderAccess();
  if (!access.hasHandle) return { success: false, code: 'no-folder', error: access.error || 'No data folder is selected' };
  if (access.permission !== 'granted') {
    return { success: false, code: 'permission', folderName: access.folderName, permission: access.permission,
      error: `Access to the data folder "${access.folderName}" is "${access.permission}"` };
  }
  let chats = null;
  try {
    chats = await (await loadFolderHandle()).getDirectoryHandle('chats', { create: false });
  } catch (e) {
    if (e.name !== 'NotFoundError') return { success: false, code: 'read', error: `${e.name}: ${e.message}` };
  }
  return cfIndexChatsStep(chats, after);
}
