// lib/handle-storage.js
// Keeps the data-folder handle in IndexedDB and reports the access Chrome holds for it, without asking.
// Loaded by the popup, the organizer, the settings page and the offscreen writer.
// Globals: DB_NAME, DB_VERSION, STORE_NAME, HANDLE_KEY, dbInstance, CF_HANDLE_READ_MS, CF_ACCESS_QUERY_MS,
//          cfWithinTime, openDB, saveFolderHandle, loadFolderHandle, checkFolderAccess, cfAccessRefusal, cfFolderState
// Notes: docs/notes/lib/handle-storage.js.md

// A FileSystemHandle cannot cross a message, so it is shared through IndexedDB

const DB_NAME = 'claudeFoldersDB';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const HANDLE_KEY = 'dataFolderHandle';

let dbInstance = null;

// The longest a check waits for the stored handle and for Chrome's access query. A check that misses one reports it
// as its error.
const CF_HANDLE_READ_MS = 10000;
const CF_ACCESS_QUERY_MS = 10000;

// The promise's own result, or a rejection with text once ms pass
function cfWithinTime(promise, ms, text) {
  let timer = null;
  const late = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error(text)), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

async function openDB() {
  if (dbInstance) return dbInstance;
  
  return new Promise((resolve, reject) => {
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = (event) => {
        console.log('[STORAGE] IndexedDB open error:', event.target.error);
        reject(event.target.error);
      };
      
      request.onsuccess = (event) => {
        dbInstance = event.target.result;
        // A connection Chrome closes (site data cleared) is opened again by the next call
        dbInstance.onclose = () => { dbInstance = null; };
        resolve(dbInstance);
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
    } catch (e) {
      console.log('[STORAGE] IndexedDB not available:', e.message);
      reject(e);
    }
  });
}

async function saveFolderHandle(handle) {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(handle, HANDLE_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch (e) {
    console.log('[STORAGE] saveFolderHandle failed:', e.message);
    throw e;
  }
}

// The stored handle, or undefined with none stored. A failed database read is thrown to the caller.
async function loadFolderHandle() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const request = db.transaction([STORE_NAME], 'readonly').objectStore(STORE_NAME).get(HANDLE_KEY);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
  });
}

// The handle and its permission as they stand. Access is asked for only from a click on the settings page
// (lib/folder-access.js); every other caller reports this state. error is set when either step failed or
// missed its time, and permission is then 'unknown'.
async function checkFolderAccess() {
  let handle = null;
  try {
    handle = await cfWithinTime(loadFolderHandle(), CF_HANDLE_READ_MS,
      `The data folder was not read from the extension's database within ${CF_HANDLE_READ_MS / 1000} seconds`);
  } catch (e) {
    return { hasHandle: false, permission: 'unknown', folderName: '', error: e.name === 'Error' ? e.message : `${e.name}: ${e.message}` };
  }
  if (!handle) return { hasHandle: false, permission: 'none', folderName: '' };
  const folderName = handle.name || '';
  try {
    const permission = await cfWithinTime(handle.queryPermission({ mode: 'readwrite' }), CF_ACCESS_QUERY_MS,
      `Chrome did not answer the access query for the data folder "${folderName}" within ${CF_ACCESS_QUERY_MS / 1000} seconds`);
    return { hasHandle: true, permission, folderName };
  } catch (e) {
    return { hasHandle: true, permission: 'unknown', folderName, error: e.name === 'Error' ? e.message : `${e.name}: ${e.message}` };
  }
}

// The failure a folder operation returns for a check without usable access, or null when access is granted.
// code: 'unreadable' when a step of the check failed, 'no-folder' without a chosen folder, 'permission' otherwise.
function cfAccessRefusal(access) {
  if (access.error) {
    return { success: false, code: 'unreadable', folderName: access.folderName, permission: access.permission, error: access.error };
  }
  if (!access.hasHandle) return { success: false, code: 'no-folder', error: 'No data folder is chosen' };
  if (access.permission !== 'granted') {
    return { success: false, code: 'permission', folderName: access.folderName, permission: access.permission,
      error: `Access to the data folder "${access.folderName}" is "${access.permission}"` };
  }
  return null;
}

// The state the background writer reports (background.js checkWriteAccess): the check, and its refusal or null
async function cfFolderState() {
  const access = await checkFolderAccess();
  return { success: true, ...access, refusal: cfAccessRefusal(access) };
}
