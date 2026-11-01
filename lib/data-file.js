// lib/data-file.js
// Reads and writes the folder data files and the standalone library in the data folder.
// Loaded by the popup, the organizer and the offscreen writer.
// Globals: accountFileName, activeAccountFileName, readDataFile, writeDataFile, refreshLibraryFiles
// Depends on: lib/handle-storage.js, lib/chat-markdown.js (generateExportFilename)
// Notes: docs/notes/lib/data-file.js.md

// Each signed-in account writes data.<key>.json; data.json mirrors the active one
function accountFileName(accountKey) {
  const key = String(accountKey || '').replace(/[^a-z0-9_-]/gi, '');
  return key ? 'data.' + key + '.json' : null;
}

async function activeAccountFileName() {
  try {
    const stored = await chrome.storage.local.get('activeAccountKey');
    return accountFileName(stored.activeAccountKey);
  } catch (e) {
    console.log('[STORAGE] No active account key readable here:', e.message);
    return null;
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
    
    // An account reads only its own file. data.json mirrors whichever account wrote
    // last, and is read only before any account key is known.
    const accountFile = await activeAccountFileName();
    const candidates = accountFile ? [accountFile] : ['data.json'];

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

// Write data.json to the selected folder. The service worker passes the account key,
// which pages without chrome.storage cannot read for themselves.
async function writeDataFile(data, accountKey) {
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
    const accountFile = accountKey ? accountFileName(accountKey) : await activeAccountFileName();
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
    
    // data.js is the offline library's chat list. A failed write returns false, which the sync summary reports.
    const jsContent = 'const claudeFoldersData = ' + JSON.stringify(data, null, 2) + ';';
    const jsHandle = await handle.getFileHandle('data.js', { create: true });
    const jsWritable = await jsHandle.createWritable();
    await jsWritable.write(jsContent);
    await jsWritable.close();
    console.log('[STORAGE] Wrote data.js for standalone viewer');

    // The viewer files are refreshed on every save
    await refreshLibraryFiles(handle);

    return true;
  } catch (error) {
    console.log('[STORAGE] writeDataFile error:', error.name, error.message);
    return false;
  }
}


// Copies the standalone viewer files into the data folder on every save. The viewer reads each chat's
// text from chats/ itself (standalone/library-files.js), so the library is current after every save.
async function refreshLibraryFiles(handle) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return false;
  // lib/chat-markdown.js is copied for the viewer's export filename helpers
  const files = [
    { name: 'index.html', path: 'standalone/index.html' },
    { name: 'styles.css', path: 'standalone/styles.css' },
    { name: 'chat-markdown.js', path: 'lib/chat-markdown.js' },
    { name: 'library-files.js', path: 'standalone/library-files.js' },
    { name: 'page-dialog.js', path: 'lib/page-dialog.js' },
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
