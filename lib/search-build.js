// lib/search-build.js
// Brings the content search index up to date with the export files in chats/, one time slice per request.
// Loaded by the access window and the offscreen writer, which answer the background's folderIndexExports.
// Globals: CF_SEARCH_STEP_MS, cfIndexExportsStep
// Depends on: lib/handle-storage.js (loadFolderHandle, checkFolderAccess), lib/search-words.js, lib/search-store.js
// Notes: docs/notes/lib/search-build.js.md

// A step stops checking files after this long. The background waits up to 30 seconds for the access window's answer.
const CF_SEARCH_STEP_MS = 8000;

// after: the last file name the step before checked, or null for the first step, which also drops files no longer
// in chats/. Files are checked in name order, and one with another size, modification time or words version is read.
// Returns { success, total, checked, indexed, removed, unread, firstError, next, ms }. next is null once all are checked.
async function cfIndexExportsStep(after) {
  const started = Date.now();
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
  const entries = new Map();
  if (chats) {
    for await (const entry of chats.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) entries.set(entry.name, entry);
    }
  }
  const names = Array.from(entries.keys()).sort();
  const known = new Map((await cfSearchStoreAll('meta')).map(m => [m.name, m]));
  const removed = after === null ? Array.from(known.keys()).filter(name => !entries.has(name)) : [];
  const start = after === null ? 0 : names.findIndex(name => name > after);
  const written = [];
  let unread = 0;
  let firstError = null;
  let index = start < 0 ? names.length : start;
  // At least one file is checked per step, so a slow listing still moves the run forward
  for (; index < names.length; index++) {
    if (index > start && Date.now() - started >= CF_SEARCH_STEP_MS) break;
    const name = names[index];
    try {
      const file = await entries.get(name).getFile();
      const had = known.get(name);
      if (had && had.size === file.size && had.lastModified === file.lastModified && had.v === CF_SEARCH_WORDS_VERSION) continue;
      written.push({ meta: { name, size: file.size, lastModified: file.lastModified, v: CF_SEARCH_WORDS_VERSION }, words: cfSearchWords(await file.text()) });
    } catch (e) {
      unread++;
      if (!firstError) firstError = `${name}: ${e.name}: ${e.message}`;
    }
  }
  if (written.length || removed.length) await cfSearchWrite(written, removed);
  if (firstError) console.log('[SEARCH]', unread, 'export files not read, the first:', firstError);
  return {
    success: true, total: names.length, checked: index, indexed: written.length, removed: removed.length,
    unread, firstError, next: index < names.length ? names[index - 1] : null, ms: Date.now() - started
  };
}
