// organizer/app.js
// Starts the organizer page: loads folder data from the data folder or cache and wires the controls.
// Globals: folders, allChats, categories, metadata, currentCategory, currentFolder, currentView,
//          currentSort, searchTerm, currentTab, esc, safeUrl, countChats, loadAllData, refreshView,
//          saveData, renderCategoryFilters, showFolderListView, setupEventListeners
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

// Escape user content before it goes into innerHTML
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
// Only allow safe links into href attributes
function safeUrl(url) {
  const s = String(url || '');
  return (/^https?:\/\//i.test(s) || s.startsWith('/')) ? esc(s) : '#';
}

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
// the folder grid and the recent chats
function refreshView() {
  buildViewFolders();
  renderAccountSelect();
  renderCategoryFilters();
  renderFolderList();
  renderRecentChats();
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

// This login's categories, then the categories of other accounts' folders the view shows. Each pill counts
// the view's folders in it; categories with folders keep their order, and empty ones follow them, dimmed.
function renderCategoryFilters() {
  const filterPills = document.getElementById('filterPills');
  if (!filterPills) return;
  const shown = [...new Set([...categories, ...viewFolders.map(f => f.category)].filter(Boolean))];
  if (currentCategory !== 'all' && !shown.includes(currentCategory)) currentCategory = 'all';
  const counts = new Map();
  viewFolders.forEach(f => counts.set(f.category, (counts.get(f.category) || 0) + 1));
  const ordered = shown.filter(cat => counts.get(cat)).concat(shown.filter(cat => !counts.get(cat)));

  const pill = (value, label, count) => `<button class="filter-pill${currentCategory === value ? ' active' : ''}${count ? '' : ' empty'}" data-filter="${esc(value)}">${esc(label)} <span class="pill-count">(${count})</span></button>`;
  filterPills.innerHTML = pill('all', 'All Folders', viewFolders.length) + ordered.map(cat => pill(cat, cat, counts.get(cat) || 0)).join('');
  
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.filter;
      renderFolderList();
    });
  });
}

function setupEventListeners() {
  document.getElementById('sortSelect')?.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderFolderList();
  });
  
  // Folders filter as each key is typed. Chats are listed after a pause (organizer/content-search.js).
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderFolderList();
    scheduleContentSearch(searchTerm);
  });
  
  document.getElementById('backBtn')?.addEventListener('click', () => {
    document.getElementById('folderDetailView')?.classList.add('hidden');
    document.getElementById('folderListView')?.classList.remove('hidden');
    currentFolder = null;
  });
  
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      if (currentTab === 'chats') {
        renderChatList();
      }
    });
  });
  
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      if (currentTab === 'chats') {
        renderChatList();
      } else if (currentTab === 'activity') {
        renderActivityTab();
      }
    });
  });
  
  document.getElementById('newFolderBtn')?.addEventListener('click', showNewFolderModal);
  document.getElementById('organizeBtn')?.addEventListener('click', startOrganizerOneClick);
  document.getElementById('exportBtn')?.addEventListener('click', exportData);
  document.getElementById('importBtn')?.addEventListener('click', showImportModal);
  document.getElementById('settingsBtn')?.addEventListener('click', () => chrome.runtime.openOptionsPage());
  
  // Analytics
  document.getElementById('analyticsBtn')?.addEventListener('click', showAnalyticsView);
  document.getElementById('analyticsBackBtn')?.addEventListener('click', hideAnalyticsView);
  
  // The sync of the Folders panel, run in the claude.ai tab (organizer/run-start.js)
  document.getElementById('syncBtn')?.addEventListener('click', startOrganizerSync);
  
  // Category search
  document.getElementById('categorySearchInput')?.addEventListener('input', (e) => {
    filterCategoriesBySearch(e.target.value);
  });
}

// The Folders row in the sidebar returns to the folder grid from a folder or the analytics
function showFolderListView() {
  document.getElementById('folderDetailView')?.classList.add('hidden');
  document.getElementById('analyticsView')?.classList.add('hidden');
  document.getElementById('folderListView')?.classList.remove('hidden');
  currentFolder = null;
}
