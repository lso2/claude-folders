// lib/handle-storage.js
// Keeps the data-folder handle in IndexedDB and reports or requests access to it.
// Loaded by the popup, the organizer, the offscreen writer and the access window.
// Globals: openDB, saveFolderHandle, loadFolderHandle, hasFolderHandle,
//          requestPermissionSafe, checkFolderAccess
// Notes: docs/notes/lib/handle-storage.js.md

// A FileSystemHandle cannot cross a message, so it is shared through IndexedDB

const DB_NAME = 'claudeFoldersDB';
const DB_VERSION = 1;
const STORE_NAME = 'handles';
const HANDLE_KEY = 'dataFolderHandle';

let dbInstance = null;

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

async function loadFolderHandle() {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(HANDLE_KEY);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);
    });
  } catch (e) {
    console.log('[STORAGE] loadFolderHandle failed:', e.message);
    return null;
  }
}

async function hasFolderHandle() {
  try {
    const handle = await loadFolderHandle();
    return !!handle;
  } catch (error) {
    console.log('[STORAGE] hasFolderHandle check failed:', error.message);
    return false;
  }
}

// Request permission with user gesture handling
async function requestPermissionSafe(handle) {
  try {
    // First check if we already have permission
    const queryResult = await handle.queryPermission({ mode: 'readwrite' });
    if (queryResult === 'granted') {
      return 'granted';
    }
    
    // Try to request permission (requires user gesture)
    const result = await handle.requestPermission({ mode: 'readwrite' });
    return result;
  } catch (e) {
    console.log('[STORAGE] Permission request failed:', e.message);
    // If DOMException, it's likely due to missing user gesture
    if (e.name === 'SecurityError' || e.name === 'NotAllowedError') {
      console.log('[STORAGE] Permission needs user gesture - showing prompt');
      return 'prompt';
    }
    return 'denied';
  }
}

// The handle and its permission as they stand, without asking. A writer without a
// user gesture cannot request access, so it reports this state instead.
async function checkFolderAccess() {
  let handle = null;
  try {
    handle = await loadFolderHandle();
  } catch (e) {
    return { hasHandle: false, permission: 'unknown', folderName: '', error: `${e.name}: ${e.message}` };
  }
  if (!handle) return { hasHandle: false, permission: 'none', folderName: '' };
  try {
    const permission = await handle.queryPermission({ mode: 'readwrite' });
    return { hasHandle: true, permission, folderName: handle.name || '' };
  } catch (e) {
    return { hasHandle: true, permission: 'unknown', folderName: handle.name || '', error: `${e.name}: ${e.message}` };
  }
}
