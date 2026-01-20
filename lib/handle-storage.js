// File System Handle Storage using IndexedDB
// FileSystemHandle objects can't be cloned/sent via messages, so we use IndexedDB

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

// Read data.json from the selected folder
async function readDataFile() {
  console.log('[STORAGE] readDataFile called');
  try {
    const handle = await loadFolderHandle();
    if (!handle) {
      console.log('[STORAGE] No handle stored');
      return null;
    }
    
    // Request permission
    const permission = await requestPermissionSafe(handle);
    console.log('[STORAGE] Permission status:', permission);
    
    if (permission !== 'granted') {
      console.log('[STORAGE] Permission not granted');
      return null;
    }
    
    try {
      const fileHandle = await handle.getFileHandle('data.json');
      const file = await fileHandle.getFile();
      const text = await file.text();
      console.log('[STORAGE] Read data.json, length:', text.length);
      const data = JSON.parse(text);
      console.log('[STORAGE] Parsed data:', data.folders?.length, 'folders,', data.categories?.length, 'categories');
      return data;
    } catch (e) {
      if (e.name === 'NotFoundError') {
        console.log('[STORAGE] data.json not found, returning empty structure');
        return {
          folders: [],
          categories: ['Personal', 'Work', 'Projects'],
          metadata: { userName: 'James', userInitial: 'J', userTeam: '' }
        };
      }
      console.log('[STORAGE] Error reading file:', e.name, e.message);
      return null;
    }
  } catch (error) {
    console.log('[STORAGE] readDataFile error:', error.name, error.message);
    return null;
  }
}

// Write data.json to the selected folder
async function writeDataFile(data) {
  console.log('[STORAGE] writeDataFile called');
  try {
    const handle = await loadFolderHandle();
    if (!handle) {
      console.log('[STORAGE] No handle stored');
      return false;
    }
    
    const permission = await requestPermissionSafe(handle);
    console.log('[STORAGE] Permission status:', permission);
    
    if (permission !== 'granted') {
      console.log('[STORAGE] Permission not granted for write');
      return false;
    }
    
    // Write data.json
    const fileHandle = await handle.getFileHandle('data.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify(data, null, 2));
    await writable.close();
    console.log('[STORAGE] Wrote data.json successfully');
    
    // Also write data.js for standalone viewer (no server needed)
    try {
      const jsContent = 'const claudeFoldersData = ' + JSON.stringify(data, null, 2) + ';';
      const jsHandle = await handle.getFileHandle('data.js', { create: true });
      const jsWritable = await jsHandle.createWritable();
      await jsWritable.write(jsContent);
      await jsWritable.close();
      console.log('[STORAGE] Wrote data.js for standalone viewer');
    } catch (e) {
      console.log('[STORAGE] Failed to write data.js:', e.message);
    }
    
    return true;
  } catch (error) {
    console.log('[STORAGE] writeDataFile error:', error.name, error.message);
    return false;
  }
}


// ========== CHAT EXPORT FUNCTIONS ==========

/**
 * Write a chat export file to the chats folder
 * @param {string} filename - Filename for the export
 * @param {string} content - Markdown content
 * @returns {Promise<boolean>}
 */
async function writeExportFile(filename, content) {
  try {
    const handle = await loadFolderHandle();
    if (!handle) return false;
    
    // Get or create chats subfolder
    const chatsFolder = await handle.getDirectoryHandle('chats', { create: true });
    
    const fileHandle = await chatsFolder.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Check if a chat has been exported (file exists)
 * @param {string} filename - Filename to check
 * @returns {Promise<boolean>}
 */
async function checkExportExists(filename) {
  try {
    const handle = await loadFolderHandle();
    if (!handle) return false;
    
    const chatsFolder = await handle.getDirectoryHandle('chats', { create: false });
    await chatsFolder.getFileHandle(filename);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * List all exported chat files
 * @returns {Promise<string[]>} Array of filenames
 */
async function listExportedChats() {
  try {
    const handle = await loadFolderHandle();
    if (!handle) return [];
    
    const chatsFolder = await handle.getDirectoryHandle('chats', { create: false });
    
    const files = [];
    for await (const entry of chatsFolder.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        files.push(entry.name);
      }
    }
    return files;
  } catch (e) {
    return [];
  }
}

/**
 * Read an exported chat file
 * @param {string} filename - Filename to read
 * @returns {Promise<string|null>} File content or null
 */
async function readExportFile(filename) {
  try {
    const handle = await loadFolderHandle();
    if (!handle) return null;
    
    const chatsFolder = await handle.getDirectoryHandle('chats', { create: false });
    const fileHandle = await chatsFolder.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (e) {
    return null;
  }
}
