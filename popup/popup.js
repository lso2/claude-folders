// popup/popup.js
// Starts the toolbar popup: checks the data folder, loads folder data and wires the header controls.
// Globals: folders, categories, allChats, metadata, currentFilter, searchTerm, init, checkDataFolder,
//          showSetupScreen, copyOrganizerFiles, showMainScreen, countChatsInData, loadData, saveData,
//          setupEventListeners
// Depends on: the lib/ files and popup parts listed in popup/popup.html
// Notes: docs/notes/popup/popup.js.md

let folders = [];
let categories = [];
let allChats = [];
let metadata = {};
let currentFilter = 'all';
let searchTerm = '';

document.addEventListener('DOMContentLoaded', init);

function init() {
  console.log('[POPUP] init');
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[POPUP] Message:', message.action);
    
    if (message.action === 'getData') {
      sendResponse({ 
        success: true, 
        folders: folders, 
        categories: categories, 
        allChats: allChats 
      });
      return true;
    }
    
    if (message.action === 'reloadData') {
      loadData().then(() => sendResponse({ success: true }));
      return true;
    }
  });
  
  checkDataFolder().then(hasFolder => {
    if (hasFolder) {
      showMainScreen();
      loadData().then(() => {
        setupEventListeners();
        processPendingExports(); // Process any pending exports
      });
    } else {
      showSetupScreen();
    }
  });
}

async function checkDataFolder() {
  return await hasFolderHandle();
}

function showSetupScreen() {
  document.getElementById('setupScreen').classList.remove('hidden');
  document.getElementById('mainScreen').classList.add('hidden');
  
  document.getElementById('selectFolderBtn').addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      await saveFolderHandle(handle);
      
      // Copy organizer files to the data folder for standalone viewing
      await copyOrganizerFiles(handle);
      
      showMainScreen();
      await loadData();
      setupEventListeners();
    } catch (error) {
      if (error.name !== 'AbortError') {
        alert('Error: ' + error.message);
      }
    }
  });
}

async function copyOrganizerFiles(folderHandle) {
  // Copy standalone viewer files from extension
  const files = [
    { name: 'index.html', path: 'standalone/index.html' },
    { name: 'styles.css', path: 'standalone/styles.css' },
    { name: 'app.js', path: 'standalone/app.js' }
  ];
  
  for (const file of files) {
    try {
      const url = chrome.runtime.getURL(file.path);
      const response = await fetch(url);
      const content = await response.text();
      
      const fileHandle = await folderHandle.getFileHandle(file.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      console.log('[POPUP] Copied', file.name);
    } catch (e) {
      console.log('[POPUP] Failed to copy', file.name, e.message);
    }
  }
}

function showMainScreen() {
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');
}

function countChatsInData(data) {
  if (!data || !data.folders) return 0;
  let count = 0;
  data.folders.forEach(f => { if (f.chats) count += f.chats.length; });
  return count;
}

async function loadData() {
  console.log('[POPUP] ===== loadData START =====');
  
  let fileData = null;
  let cacheData = null;
  
  try {
    fileData = await readDataFile();
    console.log('[POPUP] File:', fileData?.folders?.length || 0, 'folders');
  } catch (e) {
    console.log('[POPUP] File read failed:', e.message);
  }
  
  try {
    const result = await chrome.storage.local.get('cachedData');
    cacheData = result.cachedData;
    console.log('[POPUP] Cache:', cacheData?.folders?.length || 0, 'folders');
  } catch (e) {
    console.log('[POPUP] Cache read failed:', e.message);
  }
  
  const fileChats = countChatsInData(fileData);
  const cacheChats = countChatsInData(cacheData);
  const fileFolders = fileData?.folders?.length || 0;
  const cacheFolders = cacheData?.folders?.length || 0;
  console.log('[POPUP] File has', fileChats, 'chats in', fileFolders, 'folders, cache has', cacheChats, 'chats in', cacheFolders, 'folders');
  
  let data = null;
  // Use cache if it has more chats OR more folders (organized data)
  if (cacheChats > fileChats || cacheFolders > fileFolders) {
    console.log('[POPUP] Using cache (more data or more folders)');
    data = cacheData;
    // Sync cache to file
    if (cacheData) {
      writeDataFile(cacheData).catch(e => console.log('[POPUP] Sync failed:', e));
    }
  } else if (fileChats > 0) {
    data = fileData;
  } else if (cacheData) {
    data = cacheData;
  } else {
    data = fileData;
  }
  
  if (data) {
    folders = data.folders || [];
    categories = data.categories || ['Personal', 'Work', 'Projects'];
    metadata = data.metadata || {};
    
    // ALWAYS write to file when we have data from cache
    if (folders.length > 0 || countChatsInData(data) > 0) {
      console.log('[POPUP] Writing data to file...');
      const writeSuccess = await writeDataFile({ folders, categories, metadata });
      console.log('[POPUP] Write result:', writeSuccess);
    }
  } else {
    folders = [];
    categories = ['Personal', 'Work', 'Projects'];
    metadata = {};
  }
  
  allChats = [];
  folders.forEach(f => {
    if (f.chats) allChats.push(...f.chats);
  });
  
  console.log('[POPUP] folders:', folders.length);
  console.log('[POPUP] allChats:', allChats.length);
  
  await chrome.runtime.sendMessage({ 
    action: 'updateCache', 
    data: { folders, categories, metadata } 
  });
  
  console.log('[POPUP] ===== loadData END =====');
  
  renderCategoryFilters();
  renderFolders();
  updateStats();
}

async function saveData() {
  console.log('[POPUP] saveData');
  const data = { folders, categories, metadata };
  const success = await writeDataFile(data);
  if (success) {
    // Update cache
    await chrome.runtime.sendMessage({ action: 'updateCache', data });
  }
  return success;
}

function setupEventListeners() {
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase();
    renderFolders();
  });
  
  document.getElementById('importBtn')?.addEventListener('click', showImportModal);
  
  document.getElementById('exportAllBtn')?.addEventListener('click', showExportAllModal);
  
  document.getElementById('openOrganizerBtn')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'openOrganizer' });
  });
  
  document.getElementById('editCategoriesBtn')?.addEventListener('click', showEditCategoriesModal);
  
  // New organize buttons
  document.getElementById('askClaudeBtn')?.addEventListener('click', askClaudeToOrganize);
  document.getElementById('applyCategoriesBtn')?.addEventListener('click', showApplyCategoriesModal);
  document.getElementById('applyHeaderBtn')?.addEventListener('click', showApplyCategoriesModal);
  
  // Analytics toggle
  document.getElementById('analyticsBtn')?.addEventListener('click', toggleAnalytics);
  document.getElementById('backToFoldersBtn')?.addEventListener('click', hideAnalytics);
  
  // Coffee/support button
  document.getElementById('coffeeBtn')?.addEventListener('click', () => {
    document.getElementById('coffeeModal')?.classList.remove('hidden');
  });
  
  // Toggle setup instructions button
  document.getElementById('toggleSetupBtn')?.addEventListener('click', () => {
    const setupInstructions = document.getElementById('setupInstructions');
    if (setupInstructions) {
      setupInstructions.classList.toggle('hidden');
    }
  });
  
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      document.getElementById(modalId)?.classList.add('hidden');
    });
  });
}
