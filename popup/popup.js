// popup/popup.js
// Starts the toolbar popup: checks the data folder, loads folder data and wires the header controls.
// Globals: folders, categories, allChats, metadata, currentFilter, searchTerm, init, checkDataFolder,
//          showSetupScreen, showMainScreen, countChatsInData, loadData, saveData, setupEventListeners,
//          setStepsOpen, showStepsWhenUnorganized
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
  
  checkDataFolder().then(hasFolder => {
    if (hasFolder) {
      showMainScreen();
      loadData().then(() => {
        setupEventListeners();
        showStepsWhenUnorganized();
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
  if (!cfFolderPickerAvailable()) {
    showPickerMissing();
    return;
  }

  document.getElementById('selectFolderBtn').addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      await saveFolderHandle(handle);
      
      // The library page and its scripts go into the new data folder (lib/data-file.js)
      await refreshLibraryFiles(handle);
      
      showMainScreen();
      await loadData();
      setupEventListeners();
      showStepsWhenUnorganized();
    } catch (error) {
      if (error.name !== 'AbortError') {
        cfPageAlert('Data folder not set up', `${error.name}: ${error.message}`);
      }
    }
  });
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
  
  // The cache wins unless the file holds more chats or more folders
  const fileNewer = fileChats > cacheChats || fileFolders > cacheFolders;
  const data = fileNewer ? fileData : (cacheData || fileData);
  
  if (data) {
    folders = data.folders || [];
    categories = data.categories || ['Personal', 'Work', 'Projects'];
    metadata = data.metadata || {};
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
  
  // Data read from a file holding more than the cache goes to the background, which keeps it
  if (fileNewer) await saveData();
  
  console.log('[POPUP] ===== loadData END =====');
  
  renderCategoryFilters();
  renderFolders();
  updateStats();
}

// The background stores the change and writes the data file through the folder writer
async function saveData() {
  const data = { folders, categories, metadata };
  try {
    const answer = await chrome.runtime.sendMessage({ action: 'updateCache', data });
    if (answer && answer.success && !answer.written) console.log('[POPUP] Saved in the extension; the data file was not written:', answer.error);
    return !!(answer && answer.success);
  } catch (e) {
    console.log('[POPUP] The change was not saved:', e.message);
    return false;
  }
}

function setupEventListeners() {
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase();
    renderFolders();
  });
  
  document.getElementById('openOrganizerBtn')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'openOrganizer' });
  });
  
  document.getElementById('editCategoriesBtn')?.addEventListener('click', showEditCategoriesModal);
  
  // The steps pane: Ask Claude to Organize, then Apply Claude's Response
  document.getElementById('organizeAutoBtn')?.addEventListener('click', () => askClaudeToOrganize(true));
  document.getElementById('askClaudeBtn')?.addEventListener('click', () => askClaudeToOrganize(false));
  document.getElementById('applyCategoriesBtn')?.addEventListener('click', showApplyCategoriesModal);
  document.getElementById('toggleSetupBtn')?.addEventListener('click', () => setStepsOpen(document.getElementById('setupInstructions').classList.contains('hidden')));
  
  document.getElementById('analyticsBtn')?.addEventListener('click', toggleAnalytics);
  document.getElementById('settingsBtn')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  document.getElementById('backToFoldersBtn')?.addEventListener('click', hideAnalytics);
  
  document.getElementById('coffeeBtn')?.addEventListener('click', () => {
    document.getElementById('coffeeModal')?.classList.remove('hidden');
  });
  
  // The × of each modal and the Cancel buttons of the Rename and Delete modals close them
  document.querySelectorAll('.close-modal, .modal-actions [data-modal]').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      document.getElementById(modalId)?.classList.add('hidden');
    });
  });
}

// The square-check button shows and hides the steps pane
function setStepsOpen(open) {
  document.getElementById('setupInstructions')?.classList.toggle('hidden', !open);
  document.getElementById('toggleSetupBtn')?.setAttribute('aria-expanded', String(open));
}

// Without organized folders the popup opens with the steps showing
function showStepsWhenUnorganized() {
  const organized = folders.some(f => f.id !== 'unsorted') && categories.length > 0;
  setStepsOpen(!organized);
}
