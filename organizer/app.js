// organizer/app.js
// Starts the organizer page: loads folder data from the data folder or cache and wires the controls.
// Globals: folders, allChats, categories, metadata, currentCategory, currentFolder, currentView,
//          currentSort, searchTerm, currentTab, countChats, loadAllData, refreshView,
//          saveData, setupEventListeners
// Depends on: the lib/ files and organizer parts listed in organizer/index.html
// Notes: docs/notes/organizer/app.js.md

let folders = [];
let allChats = [];
let categories = [];
let metadata = {};
let currentCategory = 'all';
let currentFolder = null;
let currentView = 'list';
let currentSort = 'activity';
let searchTerm = '';
let currentTab = 'chats';

function countChats(data) {
  if (!data || !data.folders) return 0;
  let count = 0;
  data.folders.forEach(f => {
    if (f.chats) count += f.chats.length;
  });
  return count;
}

document.addEventListener('DOMContentLoaded', async () => {
  const footerName = document.querySelector('.footer-name');
  if (footerName) footerName.textContent = 'Claude Folders v' + chrome.runtime.getManifest().version;
  cfWireUpdateCheck(document.getElementById('organizerUpdateCheck'));
  cfAskForUpdate(false);
  await Promise.all([loadHomeView(), loadChatListSort()]);
  await loadSidebarLayout();
  applySidebarLayout();
  setupSidebar();
  await loadAllData();
  setupEventListeners();
  
  const urlParams = new URLSearchParams(window.location.search);
  const folderId = urlParams.get('folder');
  if (folderId) {
    const folder = folders.find(f => f.id === folderId);
    if (folder) openFolder(folderId);
  }
  // The settings page's Import/Export tab opens the organizer to run its Export or Import button (organizer/data-io.js)
  const action = urlParams.get('action');
  if (action === 'export') exportData();
  if (action === 'import') showImportModal();
});

async function loadAllData() {
  console.log('[ORGANIZER] ===== loadAllData START =====');
  
  let fileData = null;
  let cacheData = null;
  
  // Try to read from file
  try {
    fileData = await readDataFile();
    console.log('[ORGANIZER] File data:', fileData?.folders?.length || 0, 'folders,', countChats(fileData), 'chats');
  } catch (e) {
    console.log('[ORGANIZER] File read failed:', e.message);
  }
  
  // Also read from cache
  try {
    const result = await chrome.storage.local.get('cachedData');
    cacheData = result.cachedData;
    console.log('[ORGANIZER] Cache data:', cacheData?.folders?.length || 0, 'folders,', countChats(cacheData), 'chats');
  } catch (e) {
    console.log('[ORGANIZER] Cache read failed:', e.message);
  }
  
  // Count total chats in each source
  const fileChats = countChats(fileData);
  const cacheChats = countChats(cacheData);
  
  // The cache wins unless the file holds more chats. Data read from a fuller file goes to the
  // background below, which keeps it and writes the data file through the folder writer.
  const fileNewer = !!fileData && fileChats > cacheChats;
  const data = fileNewer ? fileData : (cacheData || fileData);
  console.log('[ORGANIZER] Using', fileNewer ? 'the data file' : (cacheData ? 'the cache' : 'no data'));
  
  if (!data || !data.folders) {
    folders = [];
    categories = ['Personal', 'Work', 'Projects'];
    metadata = {};
    allChats = [];
  } else {
    folders = data.folders || [];
    categories = data.categories || ['Personal', 'Work', 'Projects'];
    metadata = data.metadata || {};
    allChats = [];
    const seenChatIds = new Set();
    folders.forEach(f => {
      if (!f.chats) return;
      f.chats.forEach(c => {
        if (seenChatIds.has(c.id)) return; // a chat belongs in one folder
        seenChatIds.add(c.id);
        allChats.push(c);
      });
    });
  }

  console.log('[ORGANIZER] folders:', folders.length);
  console.log('[ORGANIZER] allChats:', allChats.length);
  
  folders = folders.map(f => ({
    ...f,
    lastActivity: f.chats && f.chats.length > 0 ? Math.max(...f.chats.map(c => new Date(c.date || 0).getTime())) : 0
  }));

  if (fileNewer) await saveData();
  await Promise.all([loadOrganizerShell(), loadOrganizerAccounts()]);
  renderSidebarShell();
  refreshView();
}

// Redraws everything that depends on the folders shown: the account dropdown, the category pills,
// the folder grid, the recent chats, the Chats list of the last search (organizer/content-search.js) and the
// List or Cards view (organizer/home-views.js). Exports may have been written, so their files are listed again.
function refreshView() {
  buildViewFolders();
  renderAccountSelect();
  renderCategoryFilters();
  renderFolderList();
  renderRecentChats();
  refreshContentSearchRows();
  markExportedPrefixesStale();
  renderHomeView();
}

// The background stores the change and writes the data file through the folder writer
async function saveData() {
  const data = { folders, categories, metadata };
  try {
    const answer = await chrome.runtime.sendMessage({ action: 'updateCache', data });
    if (answer && answer.success && !answer.written) console.log('[ORGANIZER] Saved in the extension; the data file was not written:', answer.error);
  } catch (e) {
    console.log('[ORGANIZER] The change was not saved:', e.message);
  }
}

function setupEventListeners() {
  setupViewControls();
  document.getElementById('newFolderBtn')?.addEventListener('click', showNewFolderModal);
  document.getElementById('organizeBtn')?.addEventListener('click', startOrganizerOneClick);
  document.getElementById('exportBtn')?.addEventListener('click', exportData);
  document.getElementById('importBtn')?.addEventListener('click', showImportModal);
  document.getElementById('settingsBtn')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  // The sync of the Folders panel, run in the claude.ai tab (organizer/run-start.js)
  document.getElementById('syncBtn')?.addEventListener('click', startOrganizerSync);
}
