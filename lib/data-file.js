// lib/data-file.js
// Reads and writes the folder data files and the standalone library in the data folder.
// Loaded by the popup, the organizer and the offscreen writer.
// Globals: activeAccountFileName, readDataFile, writeDataFile, refreshLibraryFiles, buildLibrary
// Depends on: lib/handle-storage.js, lib/chat-markdown.js (generateExportFilename)
// Notes: docs/notes/lib/data-file.js.md

// Each signed-in account writes data.<key>.json; data.json mirrors the active one
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

    // The viewer files are refreshed on every save
    await refreshLibraryFiles(handle);

    return true;
  } catch (error) {
    console.log('[STORAGE] writeDataFile error:', error.name, error.message);
    return false;
  }
}


// Copies the standalone viewer files into the data folder on every save
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

// Embeds every exported chat into data.js, since a file:// page cannot fetch chats/*.md
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
        const fh = await chatsFolder.getFileHandle(generateExportFilename(chat.id, chat.title));
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
