// lib/search-build.js
// Brings the content search index up to date with the export files in chats/, one time slice per request.
// Loaded by the offscreen writer, which answers the background's folderIndexExports.
// Globals: cfIndexExportsStep
// Depends on: lib/handle-storage.js (loadFolderHandle, checkFolderAccess, cfAccessRefusal), lib/search-index.js (cfIndexChatsStep)
// Notes: docs/notes/lib/search-build.js.md

// The data folder's access is checked first. A step with access reads the chats folder (lib/search-index.js).
async function cfIndexExportsStep(after) {
  const refusal = cfAccessRefusal(await checkFolderAccess());
  if (refusal) return refusal;
  let chats = null;
  try {
    chats = await (await loadFolderHandle()).getDirectoryHandle('chats', { create: false });
  } catch (e) {
    if (e.name !== 'NotFoundError') return { success: false, code: 'read', error: `${e.name}: ${e.message}` };
  }
  return cfIndexChatsStep(chats, after);
}
