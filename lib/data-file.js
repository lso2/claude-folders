// lib/data-file.js
// Reads and writes the folder data files and the standalone library in the data folder.
// Loaded by the popup, the organizer and the offscreen writer.
// Globals: accountFileName, activeAccountFileName, readDataFile, writeDataFile, refreshLibraryFiles
// Depends on: lib/handle-storage.js, lib/chat-markdown.js (generateExportFilename), lib/storage-keys.js (BUTTON_COLOR_DEFAULT)
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

// Write data.json to the selected folder. The service worker passes the account key and the button color,
// which pages without chrome.storage cannot read for themselves. buttonColor null keeps the library's oranges.
async function writeDataFile(data, accountKey, buttonColor) {
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
    // The offline library applies claudeFoldersButtonColor (standalone/library-color.js)
    const color = /^#[0-9a-f]{6}$/i.test(String(buttonColor || '')) && buttonColor.toLowerCase() !== BUTTON_COLOR_DEFAULT ? buttonColor : null;
    const jsContent = 'const claudeFoldersData = ' + JSON.stringify(data, null, 2) + ';\nconst claudeFoldersButtonColor = ' + JSON.stringify(color) + ';\n';
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


// Copies the library page and its files into the data folder on every save, when a data folder is chosen, and after the
// extension is updated or reloaded (lib/library-refresh.js). The page reads each chat's text from chats/ itself.
// Returns { success } or { success: false, error }.
async function refreshLibraryFiles(handle) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.getURL) return { success: false, error: 'chrome.runtime.getURL is not available on this page' };
  // The library page runs the organizer's shared files, copied beside it with the library's own (standalone/)
  const files = [
    { name: 'index.html', path: 'standalone/index.html' },
    { name: 'styles.css', path: 'organizer/styles.css' },
    { name: 'page-frame.css', path: 'lib/page-frame.css' },
    { name: 'sidebar.css', path: 'organizer/sidebar.css' },
    { name: 'content-search.css', path: 'organizer/content-search.css' },
    { name: 'chat-lists.css', path: 'organizer/chat-lists.css' },
    { name: 'library.css', path: 'standalone/library.css' },
    { name: 'color-variants.css', path: 'lib/color-variants.css' },
    { name: 'select-picker.css', path: 'lib/select-picker.css' },
    { name: 'storage-keys.js', path: 'lib/storage-keys.js' },
    { name: 'library-store.js', path: 'standalone/library-store.js' },
    { name: 'color-variants.js', path: 'lib/color-variants.js' },
    { name: 'select-size.js', path: 'lib/select-size.js' },
    { name: 'library-color.js', path: 'standalone/library-color.js' },
    { name: 'html-escape.js', path: 'lib/html-escape.js' },
    { name: 'chat-markdown.js', path: 'lib/chat-markdown.js' },
    { name: 'page-dialog.js', path: 'lib/page-dialog.js' },
    { name: 'sidebar-layout.js', path: 'lib/sidebar-layout.js' },
    { name: 'search-words.js', path: 'lib/search-words.js' },
    { name: 'search-store.js', path: 'lib/search-store.js' },
    { name: 'search-index.js', path: 'lib/search-index.js' },
    { name: 'library-files.js', path: 'standalone/library-files.js' },
    { name: 'account-view.js', path: 'lib/account-view.js' },
    { name: 'account-entries.js', path: 'lib/account-entries.js' },
    { name: 'account-file-list.js', path: 'lib/account-file-list.js' },
    { name: 'app.js', path: 'standalone/app.js' },
    { name: 'accounts.js', path: 'organizer/accounts.js' },
    { name: 'folders.js', path: 'organizer/folders.js' },
    { name: 'chats.js', path: 'organizer/chats.js' },
    { name: 'chat-rows.js', path: 'organizer/chat-rows.js' },
    { name: 'chat-sort.js', path: 'organizer/chat-sort.js' },
    { name: 'home-views.js', path: 'organizer/home-views.js' },
    { name: 'analytics.js', path: 'organizer/analytics.js' },
    { name: 'content-index.js', path: 'organizer/content-index.js' },
    { name: 'content-sort.js', path: 'organizer/content-sort.js' },
    { name: 'content-search.js', path: 'organizer/content-search.js' },
    { name: 'view-controls.js', path: 'organizer/view-controls.js' },
    { name: 'library-host.js', path: 'standalone/library-host.js' },
    { name: 'view.html', path: 'standalone/view.html' },
    { name: 'view.js', path: 'standalone/view.js' },
    { name: 'export-render.js', path: 'lib/export-render.js' },
    { name: 'export-page.js', path: 'lib/export-page.js' },
    { name: 'export-page.css', path: 'lib/export-page.css' }
  ];
  // Each file is written on its own. A file that fails is named in the error, and the others are still written.
  const failed = [];
  for (const file of files) {
    try {
      const res = await fetch(chrome.runtime.getURL(file.path));
      if (!res.ok) throw new Error(`${file.path} answered ${res.status}`);
      const text = await res.text();
      const fh = await handle.getFileHandle(file.name, { create: true });
      const w = await fh.createWritable();
      await w.write(text);
      await w.close();
    } catch (e) {
      failed.push(`${file.name}: ${e.name}: ${e.message}`);
    }
  }
  if (failed.length) {
    console.log('[STORAGE] Library files not written:', failed.length, 'of', files.length, failed);
    return { success: false, error: `${failed.length} of ${files.length} library files not written: ${failed.join('; ')}` };
  }
  console.log('[STORAGE] Refreshed standalone viewer files');
  return { success: true };
}
