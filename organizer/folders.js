// organizer/folders.js
// Renders the organizer's folder grid and folder detail header and creates new folders.
// Globals: categoryFilterTerm, showNewFolderModal, sortFolders, filterFolders, renderFolderList, openFolder,
//          applyCategoryPillFilter, filterCategoriesBySearch
// Depends on: organizer/app.js (state, esc, saveData, refreshView, showFolderListView),
//             organizer/accounts.js (viewFolders), organizer/chats.js (renderChatList),
//             organizer/content-search.js (contentMatchChatIds, setSearchScope)
// Notes: docs/notes/organizer/folders.js.md

// The Filter categories box's text, lowercased. It narrows the category pills and the folder cards by category name.
let categoryFilterTerm = '';

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
      refreshView();
      modal.remove();
    }
  });
  
  setTimeout(() => modal.querySelector('#newFolderNameInput').focus(), 100);
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

// The folders the account view shows (organizer/accounts.js)
function filterFolders() {
  let filtered = viewFolders;
  if (currentCategory !== 'all') {
    filtered = filtered.filter(f => f.category === currentCategory);
  }
  if (categoryFilterTerm) {
    filtered = filtered.filter(f => String(f.category || '').toLowerCase().includes(categoryFilterTerm));
  }
  // A folder holding a chat the content search listed is shown too (organizer/content-search.js)
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(f =>
      f.name.toLowerCase().includes(term) ||
      (f.chats && f.chats.some(c => c.title.toLowerCase().includes(term) || contentMatchChatIds.has(c.id)))
    );
  }
  return sortFolders(filtered);
}

function renderFolderList() {
  const folderGrid = document.getElementById('folderGrid');
  if (!folderGrid) return;
  
  const filtered = filterFolders();
  
  if (filtered.length === 0) {
    const hint = categoryFilterTerm
      ? 'No category name of the folders shown has the Filter categories text.'
      : 'Click "+ New folder" to create one, or use Import to add organized data';
    folderGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--body-text);">
        <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--title-color);">No folders found</h3>
        <p>${hint}</p>
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
  currentFolder = viewFolders.find(f => f.id === folderId);
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
        <span style="background: rgba(255, 255, 255, 0.08); color: var(--title-color); padding: 4px 12px; border-radius: 4px; font-size: 12px; font-weight: 500;">${esc(currentFolder.category)}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 4px;">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" stroke-width="1.5">
          <path d="M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/>
        </svg>
        <h1 id="folderDetailTitle" style="font-size: 28px; font-weight: 600; color: var(--title-color); margin: 0;">${esc(currentFolder.name)}</h1>
      </div>
      <div style="display: flex; align-items: center; gap: 16px; color: var(--text-secondary); font-size: 14px; margin-bottom: 16px;">
        <span>${chatCount} chat${chatCount !== 1 ? 's' : ''}</span>
        <span>${currentFolder.own ? 'Created by you' : 'From another account'}</span>
        <span style="display: flex; align-items: center; gap: 4px;">
          <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--text-secondary);"></span>
          Private
        </span>
        ${currentFolder.own && chatCount ? '<button class="btn-secondary" id="exportFolderBtn" style="margin-left: auto;" title="Save each chat of this folder as a markdown file in the data folder">Export folder</button>' : ''}
      </div>
    `;
    
    // Re-attach back button handler
    document.getElementById('backBtn')?.addEventListener('click', (e) => {
      e.preventDefault();
      showFolderListView();
    });
    
    // The Folders panel's folder export, run in the claude.ai tab (organizer/run-start.js)
    document.getElementById('exportFolderBtn')?.addEventListener('click', startOrganizerFolderExport);
  }
  
  currentTab = 'chats';
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('.tab[data-tab="chats"]')?.classList.add('active');
  
  // The search bar of the home searches this folder's chats while the folder is open (organizer/content-search.js)
  setSearchScope(true);
  renderChatList();
}
// ========== CATEGORY SEARCH ==========
// All Folders stays. Called again each time the pills are drawn (organizer/app.js renderCategoryFilters).
function applyCategoryPillFilter() {
  document.querySelectorAll('#filterPills .filter-pill').forEach(pill => {
    const category = pill.dataset.filter;
    pill.style.display = category === 'all' || !categoryFilterTerm || category.toLowerCase().includes(categoryFilterTerm) ? '' : 'none';
  });
}

function filterCategoriesBySearch(searchValue) {
  categoryFilterTerm = String(searchValue || '').toLowerCase().trim();
  applyCategoryPillFilter();
  renderFolderList();
}
