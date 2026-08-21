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

// The data folder holds one data.json, so two signed-in accounts pointed at the
// same folder overwrite each other on every sync and whichever synced last owns
// the file. Each account now also gets its own data.<key>.json, and data.json
// stays as the active account's mirror so the organizer and the standalone
// viewer keep reading the file they already read.
async function activeAccountFileName() {
  try {
    const stored = await chrome.storage.local.get('activeAccountKey');
    const key = String(stored.activeAccountKey || '').replace(/[^a-z0-9_-]/gi, '');
    if (key) return 'data.' + key + '.json';
  } catch (e) {}
  return null;
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
    
    // Prefer this account's own file, and fall back to the shared one so a folder
    // written by an earlier version still loads
    const accountFile = await activeAccountFileName();
    const candidates = accountFile ? [accountFile, 'data.json'] : ['data.json'];

    try {
      let data = null;
      let readFrom = null;
      for (const name of candidates) {
        try {
          const fileHandle = await handle.getFileHandle(name);
          const file = await fileHandle.getFile();
          const text = await file.text();
          data = JSON.parse(text);
          readFrom = name;
          console.log('[STORAGE] Read', name, 'length:', text.length);
          break;
        } catch (inner) {
          if (inner.name !== 'NotFoundError') throw inner;
        }
      }
      if (data) {
        console.log('[STORAGE] Parsed', readFrom + ':', data.folders?.length, 'folders,', data.categories?.length, 'categories');
        return data;
      }

      console.log('[STORAGE] No data file found, returning empty structure');
      return {
        folders: [],
        categories: ['Personal', 'Work', 'Projects'],
        metadata: { userName: 'James', userInitial: 'J', userTeam: '' }
      };
    } catch (e) {
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
    
    const payload = JSON.stringify(data, null, 2);

    // This account's own file, so a second account syncing into the same folder
    // cannot replace this account's set
    const accountFile = await activeAccountFileName();
    if (accountFile) {
      const accountHandle = await handle.getFileHandle(accountFile, { create: true });
      const accountWritable = await accountHandle.createWritable();
      await accountWritable.write(payload);
      await accountWritable.close();
      console.log('[STORAGE] Wrote', accountFile);
    } else {
      console.log('[STORAGE] No active account key yet, writing the shared file only');
    }

    // The shared file stays current for the organizer and the standalone viewer
    const fileHandle = await handle.getFileHandle('data.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(payload);
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

    // Keep the standalone viewer files current so the library never goes stale
    // (this is why you previously had to clear the folder out to update it)
    await refreshLibraryFiles(handle);

    return true;
  } catch (error) {
    console.log('[STORAGE] writeDataFile error:', error.name, error.message);
    return false;
  }
}


// ========== STANDALONE LIBRARY ==========

// Same filename scheme as chat-exporter.js / offscreen.js
function libSanitizeFilename(name) {
  return String(name || '')
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    .substring(0, 80)
    .trim();
}
function libExportFilename(chatId, title) {
  return `${String(chatId || 'unknown').substring(0, 8)}_${libSanitizeFilename(title || 'Untitled')}.md`;
}

// Copy the standalone viewer files from the extension into the data folder so the
// library always matches the installed version. Called on every save, so fixes
// reach an already-set-up folder without the user clearing it out and re-selecting.
async function refreshLibraryFiles(handle) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return false;
  const files = [
    { name: 'index.html', path: 'standalone/index.html' },
    { name: 'styles.css', path: 'standalone/styles.css' },
    { name: 'app.js', path: 'standalone/app.js' }
  ];
  try {
    for (const file of files) {
      const res = await fetch(chrome.runtime.getURL(file.path));
      const text = await res.text();
      const fh = await handle.getFileHandle(file.name, { create: true });
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
    }
    console.log('[STORAGE] Refreshed standalone viewer files');
    return true;
  } catch (e) {
    console.log('[STORAGE] refreshLibraryFiles failed:', e.message);
    return false;
  }
}

// Build a directly-openable offline library: writes data + viewer files, then
// embeds every exported chat's markdown into data.js so "View Offline" works when
// index.html is opened straight from disk (where fetching chats/*.md is blocked).
async function buildLibrary(data, onProgress) {
  const handle = await loadFolderHandle();
  if (!handle) return { success: false, error: 'No data folder selected' };

  const permission = await requestPermissionSafe(handle);
  if (permission !== 'granted') return { success: false, error: 'Permission not granted' };

  // Write the latest data and refresh the viewer files first
  await writeDataFile(data);

  // Read exported markdown from chats/ into a content map keyed by chat id
  const content = {};
  let embedded = 0;
  const allChats = [];
  (data.folders || []).forEach(f => (f.chats || []).forEach(c => allChats.push(c)));

  try {
    const chatsFolder = await handle.getDirectoryHandle('chats', { create: false });
    for (let i = 0; i < allChats.length; i++) {
      const chat = allChats[i];
      if (onProgress) onProgress(i + 1, allChats.length);
      try {
        const fh = await chatsFolder.getFileHandle(libExportFilename(chat.id, chat.title));
        const file = await fh.getFile();
        content[chat.id] = await file.text();
        embedded++;
      } catch (e) { /* this chat has no export yet - skip */ }
    }
  } catch (e) {
    console.log('[STORAGE] buildLibrary: no chats folder yet');
  }

  // Rewrite data.js WITH the embedded content map
  try {
    const withContent = Object.assign({}, data, { content });
    const jsContent = 'const claudeFoldersData = ' + JSON.stringify(withContent, null, 2) + ';';
    const jsHandle = await handle.getFileHandle('data.js', { create: true });
    const w = await jsHandle.createWritable();
    await w.write(jsContent);
    await w.close();
  } catch (e) {
    return { success: false, error: e.message };
  }

  console.log('[STORAGE] buildLibrary embedded', embedded, 'of', allChats.length, 'chats');
  return { success: true, embedded, total: allChats.length };
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
