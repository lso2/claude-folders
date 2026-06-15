// Organizer - reads data.json from selected folder, falls back to cache

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

// One click: write data + refresh viewer files + embed every exported chat's
// markdown into data.js, so the folder is a complete, directly-openable library.
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

function showNewFolderModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box">
      <h2 style="margin:0 0 20px 0;color:var(--title-color);">New Folder</h2>
      <label style="display:block;margin-bottom:8px;color:var(--text-secondary);font-size:13px;">Folder Name</label>
      <input type="text" id="newFolderNameInput" placeholder="Enter folder name..." style="width:100%;padding:10px;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);color:var(--title-color);margin-bottom:16px;box-sizing:border-box;">
      <label style="display:block;margin-bottom:8px;color:var(--text-secondary);font-size:13px;">Category</label>
      <select id="newFolderCategorySelect" style="width:100%;padding:10px;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);color:var(--title-color);margin-bottom:20px;">
        ${categories.map(c => `<option value="${c}">${c}</option>`).join('')}
      </select>
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button class="modal-cancel-btn">Cancel</button>
        <button class="modal-create-btn">Create</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector('.modal-cancel-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelector('.modal-create-btn').addEventListener('click', async () => {
    const name = modal.querySelector('#newFolderNameInput').value.trim();
    const category = modal.querySelector('#newFolderCategorySelect').value;
    if (name) {
      const id = 'folder-' + Date.now();
      folders.push({ id, name, category, chats: [] });
      await saveData();
      renderFolderList();
      modal.remove();
    }
  });
  
  setTimeout(() => modal.querySelector('#newFolderNameInput').focus(), 100);
}

function exportData() {
  const exportObj = {
    unsortedChats: allChats.map(c => ({
      id: c.id,
      title: c.title,
      url: c.url,
      date: c.date,
      relativeDate: c.relativeDate || '',
      snippet: c.snippet || ''
    })),
    existingFolders: folders.map(f => ({
      id: f.id,
      name: f.name,
      category: f.category,
      chatCount: f.chats ? f.chats.length : 0
    })),
    categories: categories,
    instructions: "Please organize these chats into folders by topic. Return JSON with same structure: {folders:[{id,name,category,chats:[{id,title,url,date,relativeDate}]}],categories:[...]}"
  };
  
  const json = JSON.stringify(exportObj, null, 2);
  
  navigator.clipboard.writeText(json).then(() => {
    alert('Data copied to clipboard! Paste it to Claude for organization.\n\nA backup file is also being downloaded.');
  }).catch(() => {
    alert('Downloading export file...');
  });
  
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `claude-folders-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function showImportModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="width:700px;max-width:95vw;">
      <h2 style="margin:0 0 16px 0;color:var(--title-color);">Import Organized Data</h2>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;">Paste the JSON that Claude organized for you:</p>
      <textarea id="importDataTextarea" placeholder='{"folders":[...],"categories":[...]}' style="width:100%;height:350px;padding:12px;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);color:var(--title-color);font-family:monospace;font-size:12px;resize:vertical;box-sizing:border-box;"></textarea>
      <div style="margin-top:12px;padding:12px;background:var(--input-bg);border-radius:6px;font-size:12px;color:var(--text-secondary);">
        <strong>Options:</strong><br>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer;">
          <input type="radio" name="importMode" value="merge" checked> Merge with existing (add new folders/chats)
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-top:4px;cursor:pointer;">
          <input type="radio" name="importMode" value="replace"> Replace all (clear existing data first)
        </label>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button class="modal-cancel-btn">Cancel</button>
        <button class="modal-create-btn">Import</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector('.modal-cancel-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelector('.modal-create-btn').addEventListener('click', async () => {
    try {
      const text = modal.querySelector('#importDataTextarea').value.trim();
      const data = JSON.parse(text);
      const mode = modal.querySelector('input[name="importMode"]:checked').value;
      
      if (mode === 'replace') {
        folders = [];
        allChats = [];
        categories = ['Personal', 'Work', 'Projects'];
      }
      
      if (data.folders && Array.isArray(data.folders)) {
        for (const f of data.folders) {
          const existingFolder = folders.find(ef => ef.id === f.id || ef.name === f.name);
          if (existingFolder) {
            if (f.chats) {
              for (const c of f.chats) {
                if (!existingFolder.chats.some(ec => ec.id === c.id)) {
                  existingFolder.chats.push(c);
                }
              }
            }
          } else {
            folders.push({
              id: f.id || 'folder-' + Date.now() + '-' + Math.random().toString(36).substr(2,5),
              name: f.name,
              category: f.category || 'Personal',
              chats: f.chats || []
            });
          }
        }
      }
      
      if (data.categories && Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          if (!categories.includes(cat)) {
            categories.push(cat);
          }
        }
      }
      
      allChats = [];
      folders.forEach(f => {
        if (f.chats) allChats.push(...f.chats);
      });
      
      folders = folders.map(f => ({
        ...f,
        lastActivity: f.chats && f.chats.length > 0 ? Math.max(...f.chats.map(c => new Date(c.date || 0).getTime())) : 0
      }));
      
      await saveData();
      renderCategoryFilters();
      renderFolderList();
      renderRecentChats();
      modal.remove();
      alert('Import successful! ' + folders.length + ' folders, ' + allChats.length + ' chats.');
    } catch (e) {
      alert('Invalid JSON: ' + e.message);
    }
  });
}

function clearData() {
  if (confirm('Clear ALL folders, categories, and chats? This cannot be undone.')) {
    if (confirm('Are you sure? All organized data will be lost.')) {
      folders = [];
      allChats = [];
      categories = [];
      metadata = {};
      saveData().then(() => {
        renderFolderList();
        renderRecentChats();
        alert('All data cleared.');
      });
    }
  }
}

function sortFolders(foldersToSort) {
  const sorted = [...foldersToSort];
  switch(currentSort) {
    case 'activity':
      sorted.sort((a, b) => (b.lastActivity || 0) - (a.lastActivity || 0));
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'created':
      sorted.sort((a, b) => {
        const aFirst = a.chats && a.chats.length ? Math.min(...a.chats.map(c => new Date(c.date || 0).getTime())) : 0;
        const bFirst = b.chats && b.chats.length ? Math.min(...b.chats.map(c => new Date(c.date || 0).getTime())) : 0;
        return bFirst - aFirst;
      });
      break;
  }
  return sorted;
}

function filterFolders() {
  let filtered = folders;
  if (currentCategory !== 'all') {
    filtered = filtered.filter(f => f.category === currentCategory);
  }
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(f => 
      f.name.toLowerCase().includes(term) ||
      (f.chats && f.chats.some(c => c.title.toLowerCase().includes(term)))
    );
  }
  return sortFolders(filtered);
}

function renderFolderList() {
  const folderGrid = document.getElementById('folderGrid');
  if (!folderGrid) return;
  
  const filtered = filterFolders();
  
  if (filtered.length === 0) {
    folderGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--body-text);">
        <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--title-color);">No folders found</h3>
        <p>Click "+ New folder" to create one, or use Import to add organized data</p>
      </div>
    `;
    return;
  }
  
  folderGrid.innerHTML = filtered.map(folder => `
    <div class="folder-card" data-folder-id="${esc(folder.id)}">
      <div class="folder-category">${esc(folder.category)}</div>
      <div class="folder-name">${esc(folder.name)}</div>
      <div class="folder-count">${folder.chats ? folder.chats.length : 0} chat${(folder.chats ? folder.chats.length : 0) !== 1 ? 's' : ''}</div>
    </div>
  `).join('');
  
  document.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => openFolder(card.dataset.folderId));
  });
}

function openFolder(folderId) {
  currentFolder = folders.find(f => f.id === folderId);
  if (!currentFolder) return;
  
  document.getElementById('folderListView')?.classList.add('hidden');
  document.getElementById('folderDetailView')?.classList.remove('hidden');
  
  // Update header with folder icon, name, category badge, and chat count
  const headerArea = document.getElementById('folderDetailHeader');
  if (headerArea) {
    const chatCount = currentFolder.chats ? currentFolder.chats.length : 0;
    headerArea.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
        <a href="#" id="backBtn" style="color: var(--text-secondary); text-decoration: none; display: flex; align-items: center; gap: 6px; font-size: 14px;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
          All folders
        </a>
        <span style="background: var(--accent-bg); color: var(--accent-color); padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 500;">${esc(currentFolder.category)}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 4px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5">
          <path d="M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/>
        </svg>
        <h1 id="folderDetailTitle" style="font-size: 28px; font-weight: 600; color: var(--title-color); margin: 0;">${esc(currentFolder.name)}</h1>
      </div>
      <div style="display: flex; align-items: center; gap: 16px; color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
        <span>${chatCount} chat${chatCount !== 1 ? 's' : ''}</span>
        <span>Created by you</span>
        <span style="display: flex; align-items: center; gap: 4px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--text-secondary);"></span>
          Private
        </span>
      </div>
      <div style="margin-bottom: 16px;">
        <div style="position: relative; max-width: 500px;">
          <svg style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--text-secondary);" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>
          </svg>
          <input type="text" id="folderChatSearch" placeholder="Search chat titles" style="width: 100%; padding: 10px 12px 10px 40px; border: 1px solid var(--input-border); border-radius: 8px; background: var(--input-bg); color: var(--title-color); font-size: 14px; box-sizing: border-box;">
        </div>
      </div>
    `;
    
    // Re-attach back button handler
    document.getElementById('backBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      document.getElementById('folderDetailView')?.classList.add('hidden');
      document.getElementById('folderListView')?.classList.remove('hidden');
      currentFolder = null;
    });
    
    // Attach search handler
    document.getElementById('folderChatSearch')?.addEventListener('input', (e) => {
      renderChatList(e.target.value);
    });
  }
  
  currentTab = 'chats';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab[data-tab="chats"]')?.classList.add('active');
  
  renderChatList();
}

async function renderChatList(searchFilter = '') {
  const container = document.getElementById('chatListContainer');
  if (!container || !currentFolder) return;
  
  // Get exported chats to know which have offline versions
  let exportedChats = {};
  try {
    const result = await chrome.storage.local.get('exportedChats');
    exportedChats = result.exportedChats || {};
  } catch (e) {}
  
  let chats = currentFolder.chats ? [...currentFolder.chats].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0)) : [];
  
  // Filter by search
  if (searchFilter) {
    const term = searchFilter.toLowerCase();
    chats = chats.filter(c => c.title.toLowerCase().includes(term));
  }
  
  container.className = `chat-list-container ${currentView}-view`;
  
  if (chats.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--body-text);">
        <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--title-color);">${searchFilter ? 'No matching chats' : 'No chats in this folder'}</h3>
        <p>${searchFilter ? 'Try a different search term' : 'Add chats from claude.ai using the "Add to folder" button'}</p>
      </div>
    `;
    return;
  }
  
  container.innerHTML = chats.map(chat => {
    const hasExport = exportedChats[chat.id];
    return `
    <div class="chat-item" data-chat-id="${esc(chat.id)}" data-url="${safeUrl(chat.url)}">
      <div class="chat-item-buttons">
        <button class="view-offline-btn ${hasExport ? '' : 'download-btn'}" data-chat-id="${esc(chat.id)}" data-title="${esc(chat.title)}" title="${hasExport ? 'View exported markdown' : 'Download chat as markdown'}">
          ${hasExport ? 'VIEW OFFLINE' : 'DOWNLOAD'}
        </button>
        <button class="view-chat-btn" data-url="${safeUrl(chat.url)}" title="Open chat on Claude">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          VIEW CHAT
        </button>
      </div>
      <div class="chat-item-content">
        <div class="chat-item-title">${esc(chat.title)}</div>
        ${chat.snippet ? `<div class="chat-item-snippet">${esc(chat.snippet)}</div>` : ''}
        ${chat.tags && chat.tags.length ? `
          <div class="chat-item-tags">
            ${chat.tags.slice(0, 3).map(tag => `<span class="chat-tag">#${esc(tag)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
      <div class="chat-item-actions">
        <div class="chat-item-date">${esc(chat.relativeDate || formatRelativeDate(chat.date))}</div>
        <button class="chat-menu-btn" data-chat-id="${esc(chat.id)}">⋮</button>
      </div>
    </div>
  `}).join('');
  
  // VIEW OFFLINE / DOWNLOAD button handlers
  container.querySelectorAll('.view-offline-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const chatId = btn.dataset.chatId;
      const chatTitle = btn.dataset.title;
      const hasExport = exportedChats[chatId];
      
      if (hasExport) {
        // Open the markdown viewer
        openMarkdownViewer(chatId, chatTitle);
      } else {
        // Download this chat
        btn.disabled = true;
        btn.textContent = 'DOWNLOADING...';
        const success = await downloadSingleChat(chatId, chatTitle);
        if (success) {
          btn.classList.remove('download-btn');
          btn.textContent = 'VIEW OFFLINE';
          exportedChats[chatId] = new Date().toISOString();
        } else {
          btn.textContent = 'FAILED';
          setTimeout(() => { btn.textContent = 'DOWNLOAD'; btn.disabled = false; }, 2000);
        }
      }
    });
  });
  
  // VIEW CHAT button handlers
  container.querySelectorAll('.view-chat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      if (url) window.open(url, '_blank');
    });
  });
  
  container.querySelectorAll('.chat-item').forEach(item => {
    const menuBtn = item.querySelector('.chat-menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showChatMenu(menuBtn, item.dataset.chatId);
      });
    }
  });
}

// Check if export file exists - read directly using handle-storage.js
async function checkExportFileExists(chatId, chatTitle) {
  const filename = generateExportFilename(chatId, chatTitle);
  return await checkExportExists(filename);
}

// Download a single chat to markdown - uses background to fetch from Claude API
async function downloadSingleChat(chatId, chatTitle) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'exportChatById',
      chatId: chatId,
      chatTitle: chatTitle
    });
    return response?.success || false;
  } catch (e) {
    return false;
  }
}

// Sanitize filename - must match chat-exporter.js format
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    .substring(0, 80)
    .trim();
}

function generateExportFilename(chatId, title) {
  const prefix = (chatId || 'unknown').substring(0, 8);
  const safeName = sanitizeFilename(title || 'Untitled');
  return `${prefix}_${safeName}.md`;
}

// Open the markdown file in a viewer - read directly using handle-storage.js
async function openMarkdownViewer(chatId, chatTitle) {
  const filename = generateExportFilename(chatId, chatTitle);
  const content = await readExportFile(filename);
  
  if (content) {
    const viewerWindow = window.open('', '_blank');
    viewerWindow.document.write(renderMarkdownAsHtml(chatTitle, content));
    viewerWindow.document.close();
  } else {
    alert('File not found: ' + filename);
  }
}

// Render markdown content as styled HTML
function renderMarkdownAsHtml(title, markdown) {
  const safeTitle = esc(title);
  // Escape first so raw HTML inside the chat can't execute, then format markdown
  let html = esc(markdown)
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${safeTitle} - Offline View</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #1a1a18;
      color: #e8e6e3;
      line-height: 1.6;
    }
    h1, h2, h3 { color: #fff; margin-top: 24px; }
    h1 { font-size: 28px; border-bottom: 1px solid #3d3d3a; padding-bottom: 12px; }
    h2 { font-size: 22px; }
    h3 { font-size: 18px; }
    pre {
      background: #2a2a28;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
    }
    code {
      background: #2a2a28;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
    }
    pre code {
      background: none;
      padding: 0;
    }
    p { margin: 16px 0; }
    strong { color: #d97706; }
    .header-bar {
      background: linear-gradient(135deg, #d97706, #b45309);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-bar a { color: white; }
  </style>
</head>
<body>
  <div class="header-bar">
    <span>📄 Offline View</span>
    <span>${safeTitle}</span>
  </div>
  <div class="content">
    <p>${html}</p>
  </div>
</body>
</html>`;
}

function renderActivityTab() {
  const container = document.getElementById('chatListContainer');
  if (!container || !currentFolder) return;
  
  const chats = currentFolder.chats || [];
  
  if (chats.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--body-text);">
        <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--title-color);">No activity yet</h3>
      </div>
    `;
    return;
  }
  
  const sorted = [...chats].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  
  container.innerHTML = sorted.map(chat => `
    <div class="activity-item" style="padding:14px 16px;border-bottom:1px solid var(--divider-color);display:flex;align-items:flex-start;gap:12px;">
      <div style="width:24px;height:24px;border-radius:50%;background:var(--accent-color);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="white"><path d="M8 3v5l3 3"/></svg>
      </div>
      <div style="flex:1;min-width:0;">
        <div style="color:var(--title-color);font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(chat.title)}</div>
        <div style="font-size:12px;color:var(--text-secondary);margin-top:4px;">
          Added ${esc(chat.relativeDate || formatRelativeDate(chat.date))}
        </div>
      </div>
    </div>
  `).join('');
}

function renderRecentChats() {
  const recentList = document.getElementById('recentChats');
  if (!recentList) return;
  
  const sorted = [...allChats].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const recent = sorted.slice(0, 50);
  
  if (recent.length === 0) {
    recentList.innerHTML = '<div style="padding:8px 12px;color:var(--text-secondary);font-size:12px;">No chats yet</div>';
    return;
  }
  
  recentList.innerHTML = recent.map(chat => `
    <a href="${safeUrl(chat.url)}" target="_blank" class="recent-item" title="${esc(chat.title)}">${esc(chat.title)}</a>
  `).join('');
}

function formatRelativeDate(dateString) {
  if (!dateString) return '';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 14) return '1 week ago';
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 60) return '1 month ago';
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} year${Math.floor(diffDays / 365) > 1 ? 's' : ''} ago`;
}

function showChatMenu(btn, chatId) {
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
  
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  
  menu.innerHTML = `
    <div class="context-menu-item" data-action="move">Move to Folder</div>
    <div class="context-menu-item" data-action="delete">Remove from Folder</div>
  `;
  
  document.body.appendChild(menu);
  
  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      const action = item.dataset.action;
      menu.remove();
      if (action === 'move') {
        showMoveChatModal(chatId);
      } else if (action === 'delete') {
        if (confirm('Remove this chat from folder?')) {
          await deleteChat(chatId);
        }
      }
    });
  });
  
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 0);
}

function showMoveChatModal(chatId) {
  const otherFolders = folders.filter(f => f.id !== currentFolder?.id);
  
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  
  let folderListHtml = '';
  if (otherFolders.length === 0) {
    folderListHtml = '<div style="padding:20px;text-align:center;color:var(--text-secondary);">No other folders available. Create a new folder first.</div>';
  } else {
    folderListHtml = otherFolders.map(f => `
      <div class="move-folder-item" data-folder-id="${esc(f.id)}">
        <svg width="16" height="16" viewBox="0 0 18 18" fill="currentColor" style="opacity:0.6;flex-shrink:0;">
          <path d="M2 3h6l2 2h6v10H2V3z"/>
        </svg>
        <div style="flex:1;min-width:0;">
          <span style="font-size:10px;color:var(--text-secondary);text-transform:uppercase;">${esc(f.category)}</span>
          <div style="font-size:14px;color:var(--title-color);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(f.name)}</div>
        </div>
        <span style="font-size:12px;color:var(--text-secondary);">${f.chats ? f.chats.length : 0}</span>
      </div>
    `).join('');
  }
  
  modal.innerHTML = `
    <div class="modal-box">
      <h2 style="margin:0 0 20px 0;color:var(--title-color);">Move to Folder</h2>
      <div style="max-height:300px;overflow-y:auto;">
        ${folderListHtml}
      </div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px;">
        <button class="modal-cancel-btn">Cancel</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelectorAll('.move-folder-item').forEach(item => {
    item.addEventListener('click', async () => {
      const toFolderId = item.dataset.folderId;
      await moveChat(chatId, toFolderId);
      modal.remove();
    });
  });
  
  modal.querySelector('.modal-cancel-btn')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
}

async function moveChat(chatId, toFolderId) {
  if (!currentFolder || !currentFolder.chats) return;
  
  const chat = currentFolder.chats.find(c => c.id === chatId);
  if (!chat) return;
  
  currentFolder.chats = currentFolder.chats.filter(c => c.id !== chatId);
  
  const toFolder = folders.find(f => f.id === toFolderId);
  if (toFolder) {
    if (!toFolder.chats) toFolder.chats = [];
    toFolder.chats.push(chat);
  }
  
  await saveData();
  
  folders = folders.map(f => ({
    ...f,
    lastActivity: f.chats && f.chats.length > 0 ? Math.max(...f.chats.map(c => new Date(c.date || 0).getTime())) : 0
  }));
  
  currentFolder = folders.find(f => f.id === currentFolder.id);
  renderChatList();
}

async function deleteChat(chatId) {
  if (!currentFolder || !currentFolder.chats) return;
  
  currentFolder.chats = currentFolder.chats.filter(c => c.id !== chatId);
  allChats = allChats.filter(c => c.id !== chatId);
  
  await saveData();
  
  currentFolder = folders.find(f => f.id === currentFolder.id);
  
  renderChatList();
  renderRecentChats();
}


// ========== ANALYTICS VIEW ==========
const CHART_COLORS = ['#d97706', '#0891b2', '#7c3aed', '#059669', '#dc2626', '#2563eb', '#c026d3', '#ea580c'];

function showAnalyticsView() {
  document.getElementById('folderListView')?.classList.add('hidden');
  document.getElementById('folderDetailView')?.classList.add('hidden');
  document.getElementById('analyticsView')?.classList.remove('hidden');
  renderAnalytics();
}

function hideAnalyticsView() {
  document.getElementById('analyticsView')?.classList.add('hidden');
  document.getElementById('folderListView')?.classList.remove('hidden');
}

function getCategoryData() {
  const catCounts = {};
  folders.forEach(f => {
    const cat = f.category || 'Uncategorized';
    if (!catCounts[cat]) catCounts[cat] = { folders: 0, chats: 0 };
    catCounts[cat].folders++;
    catCounts[cat].chats += (f.chats?.length || 0);
  });
  
  const totalChats = Object.values(catCounts).reduce((sum, c) => sum + c.chats, 0);
  
  return Object.entries(catCounts).map(([name, data]) => ({
    name,
    folders: data.folders,
    chats: data.chats,
    percent: totalChats > 0 ? Math.round(data.chats / totalChats * 100) : 0
  })).sort((a, b) => b.chats - a.chats);
}

function renderAnalytics() {
  renderDonutChart();
  renderAnalyticsLegend();
  renderAnalyticsStats();
  renderAnalyticsBreakdown();
}

function renderDonutChart() {
  const canvas = document.getElementById('analyticsDonutChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const data = getCategoryData();
  const total = data.reduce((sum, d) => sum + d.chats, 0);
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 20;
  const innerRadius = radius * 0.6;
  
  let startAngle = -Math.PI / 2;
  
  data.forEach((item, i) => {
    const sliceAngle = (item.chats / total) * 2 * Math.PI;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fill();
    
    startAngle += sliceAngle;
  });
  
  // Draw center hole
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary') || '#30302e';
  ctx.fill();
  
  // Center label
  const centerLabel = document.getElementById('analyticsChartCenter');
  if (centerLabel) {
    centerLabel.innerHTML = `<span class="total-count">${total}</span><span class="total-label">Total Chats</span>`;
  }
}

function renderAnalyticsLegend() {
  const container = document.getElementById('analyticsLegend');
  if (!container) return;
  
  const data = getCategoryData();
  container.innerHTML = data.map((item, i) => `
    <div class="legend-item">
      <div class="legend-color" style="background: ${CHART_COLORS[i % CHART_COLORS.length]}"></div>
      <span>${item.name} (${item.percent}%)</span>
    </div>
  `).join('');
}

function renderAnalyticsStats() {
  const container = document.getElementById('analyticsStats');
  if (!container) return;
  
  const data = getCategoryData();
  const totalChats = data.reduce((sum, d) => sum + d.chats, 0);
  const totalFolders = folders.length;
  const totalCategories = data.length;
  const avgChatsPerFolder = totalFolders > 0 ? Math.round(totalChats / totalFolders) : 0;
  
  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${totalChats.toLocaleString()}</div>
      <div class="stat-label">Total Chats</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${totalFolders}</div>
      <div class="stat-label">Total Folders</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${totalCategories}</div>
      <div class="stat-label">Categories</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${avgChatsPerFolder}</div>
      <div class="stat-label">Avg Chats/Folder</div>
    </div>
  `;
}

function renderAnalyticsBreakdown() {
  const container = document.getElementById('analyticsFolderBreakdown');
  if (!container) return;
  
  const data = getCategoryData();
  container.innerHTML = data.map((item, i) => `
    <div class="breakdown-row">
      <div class="breakdown-category">
        <div class="breakdown-color" style="background: ${CHART_COLORS[i % CHART_COLORS.length]}"></div>
        <span class="breakdown-name">${item.name}</span>
      </div>
      <div class="breakdown-stats">
        <div class="breakdown-stat">
          <div class="breakdown-stat-value">${item.folders}</div>
          <div class="breakdown-stat-label">Folders</div>
        </div>
        <div class="breakdown-stat">
          <div class="breakdown-stat-value">${item.chats}</div>
          <div class="breakdown-stat-label">Chats</div>
        </div>
        <div class="breakdown-stat">
          <div class="breakdown-stat-value">${item.percent}%</div>
          <div class="breakdown-stat-label">Share</div>
        </div>
      </div>
    </div>
  `).join('');
}

// ========== CATEGORY SEARCH ==========
function filterCategoriesBySearch(searchValue) {
  const search = searchValue.toLowerCase().trim();
  const pills = document.querySelectorAll('.filter-pill');
  
  pills.forEach(pill => {
    const category = pill.dataset.filter;
    if (category === 'all' || search === '' || category.toLowerCase().includes(search)) {
      pill.style.display = '';
    } else {
      pill.style.display = 'none';
    }
  });
}

// ========== EXPORT CHATS TO MARKDOWN ==========
function showExportMdModal() {
  const totalChats = allChats.length;
  
  if (totalChats === 0) {
    alert('No chats to export. Import some chats first.');
    return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'export-modal';
  modal.id = 'exportMdModal';
  modal.innerHTML = `
    <div class="export-modal-content">
      <div class="export-modal-title">Export Chats to Markdown</div>
      <p style="color: var(--text-secondary); margin-bottom: 16px;">
        This will download ${totalChats} chats as individual .md files in a ZIP archive.
      </p>
      <div class="export-options" style="margin-bottom: 16px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="radio" name="exportScope" value="all" checked>
          <span>All chats (${totalChats})</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
          <input type="radio" name="exportScope" value="folder">
          <span>Current folder only</span>
        </label>
      </div>
      <div class="export-modal-actions">
        <button class="export-cancel-btn" id="cancelExportMd">Cancel</button>
        <button class="btn-primary" id="startExportMd">Export</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  document.getElementById('cancelExportMd').addEventListener('click', () => modal.remove());
  document.getElementById('startExportMd').addEventListener('click', () => {
    const scope = document.querySelector('input[name="exportScope"]:checked').value;
    modal.remove();
    exportChatsToMarkdown(scope);
  });
}

async function exportChatsToMarkdown(scope) {
  let chatsToExport = [];
  
  if (scope === 'folder' && currentFolder) {
    chatsToExport = currentFolder.chats || [];
  } else {
    chatsToExport = allChats;
  }
  
  if (chatsToExport.length === 0) {
    alert('No chats to export.');
    return;
  }
  
  // Check if we have a claude.ai tab open for fetching content
  let claudeTab = null;
  try {
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    if (tabs.length > 0) {
      claudeTab = tabs[0];
    }
  } catch (e) {
    console.log('[ORGANIZER] Could not query tabs:', e.message);
  }
  
  // Show progress modal
  const progressModal = document.createElement('div');
  progressModal.className = 'export-modal';
  progressModal.id = 'exportProgressModal';
  
  let cancelled = false;
  
  progressModal.innerHTML = `
    <div class="export-modal-content">
      <div class="export-modal-title">Exporting Chats to Markdown</div>
      <div class="export-progress-bar">
        <div class="export-progress-fill" id="exportProgressFill" style="width: 0%"></div>
      </div>
      <div class="export-progress-text" id="exportProgressText">Preparing... 0 / ${chatsToExport.length}</div>
      <div class="export-progress-current" id="exportProgressCurrent">Starting...</div>
      <div class="export-modal-actions">
        <button class="export-cancel-btn" id="cancelExportProgress">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(progressModal);
  
  document.getElementById('cancelExportProgress').addEventListener('click', () => {
    cancelled = true;
    progressModal.remove();
  });
  
  const progressFill = document.getElementById('exportProgressFill');
  const progressText = document.getElementById('exportProgressText');
  const progressCurrent = document.getElementById('exportProgressCurrent');
  
  const files = [];
  let successCount = 0;
  let skippedCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < chatsToExport.length; i++) {
    if (cancelled) break;
    
    const chat = chatsToExport[i];
    const percent = ((i + 1) / chatsToExport.length * 100).toFixed(0);
    
    progressFill.style.width = `${percent}%`;
    progressText.textContent = `Exporting... ${i + 1} / ${chatsToExport.length}`;
    progressCurrent.textContent = chat.title || 'Untitled';
    
    let markdown = null;
    let filename = generateExportFilename(chat.id, chat.title);
    
    // Check if already exported
    const alreadyExists = await checkExportFileExists(chat.id, chat.title);
    if (alreadyExists) {
      skippedCount++;
      await new Promise(r => setTimeout(r, 10));
      continue;
    }
    
    // Try to fetch full content via content script
    if (claudeTab) {
      try {
        const response = await chrome.tabs.sendMessage(claudeTab.id, {
          action: 'exportChatById',
          chatId: chat.id,
          title: chat.title
        });
        
        if (response?.success && response?.markdown) {
          markdown = response.markdown;
          filename = response.filename || filename;
          successCount++;
        } else {
          console.log('[ORGANIZER] Export failed for', chat.title, response?.error);
          // Fallback to basic metadata export
          markdown = generateBasicChatMarkdown(chat);
          failCount++;
        }
      } catch (e) {
        console.log('[ORGANIZER] Message failed:', e.message);
        markdown = generateBasicChatMarkdown(chat);
        failCount++;
      }
    } else {
      // No claude.ai tab, use basic export
      markdown = generateBasicChatMarkdown(chat);
      failCount++;
    }
    
    if (markdown) {
      files.push({ name: filename, content: markdown });
    }
    
    // Rate limit to avoid overwhelming the API
    if (claudeTab) {
      await new Promise(r => setTimeout(r, 600));
    } else {
      await new Promise(r => setTimeout(r, 10));
    }
  }
  
  if (cancelled) {
    return;
  }
  
  progressText.textContent = 'Creating download...';
  progressCurrent.textContent = `${successCount} exported, ${skippedCount} skipped, ${failCount} metadata only`;
  
  // Save files to filesystem
  for (const file of files) {
    await writeExportFile(file.name, file.content);
  }
  
  // Download files
  await downloadMarkdownFiles(files);
  
  progressModal.remove();
  
  const parts = [];
  if (successCount > 0) parts.push(`${successCount} exported`);
  if (skippedCount > 0) parts.push(`${skippedCount} already existed (skipped)`);
  if (failCount > 0) parts.push(`${failCount} metadata only`);
  
  alert(`Export complete!\n\n${parts.join('\n')}`);
}

function generateBasicChatMarkdown(chat) {
  const lines = [];
  lines.push(`# ${chat.title || 'Untitled Chat'}`);
  lines.push('');
  lines.push(`**Date:** ${chat.date || 'Unknown'}`);
  lines.push(`**URL:** ${chat.url || ''}`);
  lines.push(`**Chat ID:** ${chat.id || ''}`);
  lines.push('');
  lines.push('---');
  lines.push('');
  lines.push('*Note: Full conversation content requires visiting the chat page to extract.*');
  lines.push('');
  lines.push(`[Open in Claude](${chat.url || 'https://claude.ai'})`);
  
  return lines.join('\n');
}

// Download multiple markdown files
async function downloadMarkdownFiles(files) {
  if (files.length === 0) return;
  
  if (files.length === 1) {
    // Single file - download directly
    const blob = new Blob([files[0].content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, files[0].name);
    return;
  }
  
  // Multiple files - combine into single markdown with separators
  const combined = files.map(f => {
    return `\n\n${'='.repeat(80)}\n# FILE: ${f.name}\n${'='.repeat(80)}\n\n${f.content}`;
  }).join('\n');
  
  const blob = new Blob([combined], { type: 'text/markdown;charset=utf-8' });
  const timestamp = new Date().toISOString().split('T')[0];
  downloadBlob(blob, `claude-chats-export-${timestamp}.md`);
}

// Simple ZIP creation (no external library needed)
async function downloadAsZip(files, zipName) {
  // Use JSZip if available, otherwise download individually
  if (typeof JSZip !== 'undefined') {
    const zip = new JSZip();
    files.forEach(f => zip.file(f.name, f.content));
    const blob = await zip.generateAsync({ type: 'blob' });
    downloadBlob(blob, zipName);
  } else {
    // Fallback: download as single combined markdown
    const combined = files.map(f => `\n\n---\n# FILE: ${f.name}\n---\n\n${f.content}`).join('\n');
    const blob = new Blob([combined], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, 'claude-chats-export.md');
  }
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
