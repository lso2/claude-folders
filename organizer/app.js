// organizer/app.js
// Starts the organizer page: loads folder data from the data folder or cache and wires the controls.
// Globals: folders, allChats, categories, metadata, currentCategory, currentFolder, currentView,
//          currentSort, searchTerm, currentTab, sidebarState, esc, safeUrl, countChats,
//          loadAllData, runBuildLibrary, saveData, renderUserProfile, renderCategoryFilters,
//          setupEventListeners, toggleSidebar
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
let sidebarState = 'normal';

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
  
  // Use whichever has more data
  let data = null;
  if (cacheChats > fileChats && cacheData) {
    console.log('[ORGANIZER] Cache has more data - using cache and writing to file');
    data = cacheData;
    // Write cache to file so they're in sync
    const writeSuccess = await writeDataFile(cacheData);
    console.log('[ORGANIZER] Write to file result:', writeSuccess);
  } else if (fileData && fileChats > 0) {
    console.log('[ORGANIZER] Using file data');
    data = fileData;
  } else if (cacheData) {
    console.log('[ORGANIZER] File empty, using cache');
    data = cacheData;
    await writeDataFile(cacheData);
  } else {
    console.log('[ORGANIZER] No data anywhere');
    data = fileData;
  }
  
  if (!data || !data.folders) {
    folders = [];
    categories = ['Personal', 'Work', 'Projects'];
    metadata = { userName: 'James', userInitial: 'J', userTeam: '' };
    allChats = [];
  } else {
    folders = data.folders || [];
    categories = data.categories || ['Personal', 'Work', 'Projects'];
    metadata = data.metadata || { userName: 'James', userInitial: 'J', userTeam: '' };
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
  
  renderUserProfile();
  renderCategoryFilters();
  renderFolderList();
  renderRecentChats();
}

// Writes the data, refreshes the viewer files and embeds every exported chat into data.js
async function runBuildLibrary() {
  const btn = document.getElementById('buildLibraryBtn');
  const original = btn ? btn.innerHTML : '';
  if (btn) { btn.disabled = true; btn.textContent = 'Building...'; }
  try {
    if (typeof buildLibrary !== 'function') {
      alert('Library builder unavailable - reload the page and try again.');
      return;
    }
    const data = { folders, categories, metadata };
    const result = await buildLibrary(data, (done, total) => {
      if (btn) btn.textContent = `Embedding ${done}/${total}...`;
    });
    if (result.success) {
      alert(`Library built in your data folder.\n\nEmbedded ${result.embedded} of ${result.total} chats for offline reading.\n\nOpen index.html from that folder to browse everything offline.`);
    } else {
      alert('Could not build library: ' + (result.error || 'unknown error'));
    }
  } catch (e) {
    alert('Build library failed: ' + e.message);
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = original; }
  }
}

async function saveData() {
  const data = { folders, categories, metadata };
  let success = false;
  
  try {
    success = await writeDataFile(data);
  } catch (e) {
    console.log('[ORGANIZER] File write failed:', e.message);
  }
  
  try {
    await chrome.storage.local.set({ cachedData: data });
    console.log('[ORGANIZER] Cache updated');
  } catch (e) {
    console.log('[ORGANIZER] Cache update failed:', e.message);
  }
  
  if (success) {
    try {
      await chrome.runtime.sendMessage({ action: 'updateCache', data });
    } catch (e) {
      console.log('[ORGANIZER] Could not notify background:', e.message);
    }
  }
}

function renderUserProfile() {
  const avatar = document.getElementById('userAvatar');
  const name = document.getElementById('userName');
  const team = document.getElementById('userTeam');
  if (avatar) avatar.textContent = metadata.userInitial || 'J';
  if (name) name.textContent = metadata.userName || 'James';
  if (team) {
    if (metadata.userTeam) {
      team.textContent = metadata.userTeam;
      team.style.display = 'block';
    } else {
      team.style.display = 'none';
    }
  }
}

function renderCategoryFilters() {
  const filterPills = document.getElementById('filterPills');
  if (!filterPills) return;
  
  let html = '<button class="filter-pill active" data-filter="all">All Folders</button>';
  categories.forEach(cat => {
    html += `<button class="filter-pill" data-filter="${cat}">${cat}</button>`;
  });
  filterPills.innerHTML = html;
  
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
  
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderFolderList();
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
  document.getElementById('sidebarToggle')?.addEventListener('click', toggleSidebar);
  document.getElementById('exportBtn')?.addEventListener('click', exportData);
  document.getElementById('importBtn')?.addEventListener('click', showImportModal);
  document.getElementById('clearBtn')?.addEventListener('click', clearData);
  
  // Analytics
  document.getElementById('analyticsBtn')?.addEventListener('click', showAnalyticsView);
  document.getElementById('analyticsBackBtn')?.addEventListener('click', hideAnalyticsView);
  
  // Export MD
  document.getElementById('exportMdBtn')?.addEventListener('click', showExportMdModal);
  document.getElementById('buildLibraryBtn')?.addEventListener('click', runBuildLibrary);
  
  // Category search
  document.getElementById('categorySearchInput')?.addEventListener('input', (e) => {
    filterCategoriesBySearch(e.target.value);
  });
}

function toggleSidebar() {
  const sidebar = document.getElementById('sidebar');
  const main = document.getElementById('mainContent');
  
  if (sidebarState === 'normal') {
    sidebarState = 'collapsed';
    sidebar.classList.add('collapsed');
    sidebar.classList.remove('expanded');
    main.classList.add('sidebar-collapsed');
    main.classList.remove('sidebar-expanded');
  } else if (sidebarState === 'collapsed') {
    sidebarState = 'expanded';
    sidebar.classList.remove('collapsed');
    sidebar.classList.add('expanded');
    main.classList.remove('sidebar-collapsed');
    main.classList.add('sidebar-expanded');
  } else {
    sidebarState = 'normal';
    sidebar.classList.remove('collapsed', 'expanded');
    main.classList.remove('sidebar-collapsed', 'sidebar-expanded');
  }
}