// standalone/library-files.js
// Reads exported chats from the chats folder beside the library page, opened straight from disk.
// Globals: LIBRARY_DB, libraryHandle, libraryExports, libraryDb, libraryLoadHandle, librarySaveHandle,
//          libraryAccessState, libraryOpenFolder, libraryListExports, libraryExportPrefix, libraryReadExport
// Depends on: chat-markdown.js (exportIdPrefix, exportPrefixOfFilename), copied beside this page
// Notes: docs/notes/standalone/library-files.js.md

// A page opened from file:// cannot fetch chats/*.md. Chrome's folder access reads them once the
// person picks the library folder, and the handle is kept in this page's IndexedDB for later visits.
const LIBRARY_DB = { name: 'claudeFoldersLibrary', store: 'handles', key: 'libraryFolder' };
let libraryHandle = null;
// Export file names in chats/ by lowercased id prefix
let libraryExports = new Map();

function libraryDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(LIBRARY_DB.name, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(LIBRARY_DB.store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function libraryLoadHandle() {
  try {
    const db = await libraryDb();
    libraryHandle = await new Promise((resolve, reject) => {
      const get = db.transaction(LIBRARY_DB.store).objectStore(LIBRARY_DB.store).get(LIBRARY_DB.key);
      get.onsuccess = () => resolve(get.result || null);
      get.onerror = () => reject(get.error);
    });
  } catch (e) {
    console.log('[LIBRARY] The stored folder was not read:', e.message);
    libraryHandle = null;
  }
  return libraryHandle;
}

async function librarySaveHandle(handle) {
  const db = await libraryDb();
  await new Promise((resolve, reject) => {
    const put = db.transaction(LIBRARY_DB.store, 'readwrite').objectStore(LIBRARY_DB.store).put(handle, LIBRARY_DB.key);
    put.onsuccess = () => resolve();
    put.onerror = () => reject(put.error);
  });
  libraryHandle = handle;
}

// 'unsupported' (no folder access in this browser), 'none' (no folder picked yet), 'prompt' or 'granted'
async function libraryAccessState() {
  if (typeof window.showDirectoryPicker !== 'function') return 'unsupported';
  if (!libraryHandle) await libraryLoadHandle();
  if (!libraryHandle) return 'none';
  try {
    return await libraryHandle.queryPermission({ mode: 'read' });
  } catch (e) {
    return 'none';
  }
}

// Runs in a click: asks again for a stored folder, else lets the person pick the library folder
async function libraryOpenFolder() {
  if (libraryHandle && (await libraryHandle.requestPermission({ mode: 'read' })) === 'granted') return true;
  const handle = await window.showDirectoryPicker({ id: 'claude-folders-library', mode: 'read' });
  await librarySaveHandle(handle);
  return true;
}

// The chats folder is either inside the picked folder or the picked folder itself
async function libraryChatsFolder() {
  try {
    return await libraryHandle.getDirectoryHandle('chats');
  } catch (e) {
    return libraryHandle;
  }
}

async function libraryListExports() {
  libraryExports = new Map();
  const folder = await libraryChatsFolder();
  for await (const entry of folder.values()) {
    if (entry.kind !== 'file' || !entry.name.endsWith('.md')) continue;
    const prefix = exportPrefixOfFilename(entry.name);
    if (prefix && !libraryExports.has(prefix)) libraryExports.set(prefix, entry.name);
  }
  return libraryExports.size;
}

function libraryExportPrefix(chatId) {
  return exportIdPrefix(chatId).toLowerCase();
}

// The chat's export text, or null when its file is not in the chats folder
async function libraryReadExport(chatId) {
  const name = libraryExports.get(libraryExportPrefix(chatId));
  if (!name) return null;
  const folder = await libraryChatsFolder();
  return (await (await folder.getFileHandle(name)).getFile()).text();
}
