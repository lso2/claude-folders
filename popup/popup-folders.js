// popup/popup-folders.js
// Renders the popup's folder list, category filters and folder menu, and edits categories.
// Globals: showEditCategoriesModal, renderCategoriesList, renderCategoryFilters, renderFolders,
//          showFolderMenu, showRenameFolderModal, showDeleteFolderModal, updateStats, popupEsc
// Depends on: popup/popup.js (state, saveData), popup/popup.html (renameFolderModal, confirmDeleteModal),
//             popup/popup-accounts.js (popupShownFolders)
// Notes: docs/notes/popup/popup-folders.js.md

// Names come from the folder data and Claude's answers, and are inserted as text
function popupEsc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function showEditCategoriesModal() {
  const modal = document.getElementById('editCategoriesModal');
  modal.classList.remove('hidden');
  renderCategoriesList();
  
  document.getElementById('addCategoryBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('newCategoryInput');
    const name = input.value.trim();
    if (name && !categories.includes(name)) {
      categories.push(name);
      await saveData();
      renderCategoriesList();
      renderCategoryFilters();
      input.value = '';
    }
  });
}

function renderCategoriesList() {
  const list = document.getElementById('categoriesList');
  if (!list) return;
  list.innerHTML = categories.map((cat, idx) => `
    <div class="edit-list-item">
      <span>${popupEsc(cat)}</span>
      <button class="btn-icon-delete" data-index="${idx}">×</button>
    </div>
  `).join('');
  
  list.querySelectorAll('.btn-icon-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      categories.splice(parseInt(btn.dataset.index), 1);
      await saveData();
      renderCategoriesList();
      renderCategoryFilters();
    });
  });
}

function renderCategoryFilters() {
  const container = document.getElementById('filterPills');
  if (!container) return;
  
  // Each pill counts the shown folders in it (popup/popup-accounts.js). This login's categories come first, then
  // other accounts' ones. A category with no folders gets no pill, and the category itself is kept.
  const shown = popupShownFolders();
  const counts = new Map();
  shown.forEach(f => counts.set(f.category, (counts.get(f.category) || 0) + 1));
  const withFolders = [...new Set([...categories, ...shown.map(f => f.category)].filter(Boolean))].filter(cat => counts.get(cat));
  if (currentFilter !== 'all' && !withFolders.includes(currentFilter)) currentFilter = 'all';
  const pill = (value, label, count) => `<button class="filter-pill${currentFilter === value ? ' active' : ''}" data-filter="${popupEsc(value)}">${popupEsc(label)} <span class="pill-count">(${count})</span></button>`;
  container.innerHTML = pill('all', 'All', shown.length) + withFolders.map(cat => pill(cat, cat, counts.get(cat))).join('');
  
  container.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderFolders();
    });
  });
}

function renderFolders() {
  const container = document.getElementById('folderList');
  if (!container) return;
  
  const shown = popupShownFolders();
  let filtered = shown;
  if (currentFilter !== 'all') {
    filtered = filtered.filter(f => f.category === currentFilter);
  }
  if (searchTerm) {
    filtered = filtered.filter(f => 
      f.name.toLowerCase().includes(searchTerm) ||
      f.chats.some(c => c.title.toLowerCase().includes(searchTerm))
    );
  }
  
  if (shown.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No folders yet</p><p>Import chats using the button above</p></div>`;
    return;
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No folders found</p></div>`;
    return;
  }
  
  // Group by category
  const byCategory = {};
  filtered.forEach(f => {
    const cat = f.category || 'Uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(f);
  });
  
  let html = '';
  Object.keys(byCategory).sort().forEach(cat => {
    const catFolders = byCategory[cat];
    const totalChats = catFolders.reduce((sum, f) => sum + (f.chats?.length || 0), 0);
    html += `
      <div class="folder-category-group collapsed">
        <div class="folder-category-header" data-category="${popupEsc(cat)}">
          <span>${popupEsc(cat)} (${totalChats})</span>
          <svg class="category-toggle-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4"/>
          </svg>
        </div>
        <div class="folder-category-content">
          ${catFolders.map(folder => `
            <div class="folder-item" data-folder-id="${popupEsc(folder.id)}">
              <div class="folder-header">
                <div class="folder-info">
                  <span class="folder-name">${popupEsc(folder.name)}</span>
                </div>
                <div class="folder-actions">
                  <span class="folder-count">${folder.chats?.length || 0}</span>
                  ${folder.own ? `<button class="folder-menu-btn" data-folder-id="${popupEsc(folder.id)}">⋮</button>` : ''}
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Category toggle
  container.querySelectorAll('.folder-category-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.folder-category-group').classList.toggle('collapsed');
    });
  });
  
  container.querySelectorAll('.folder-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.folder-menu-btn')) return;
      const folderId = header.closest('.folder-item').dataset.folderId;
      chrome.runtime.sendMessage({ action: 'openOrganizer', folderId });
    });
  });
  
  container.querySelectorAll('.folder-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showFolderMenu(btn, btn.dataset.folderId);
    });
  });
}

// The Rename Folder modal in popup.html, with the folder's name and category
function showRenameFolderModal(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  const modal = document.getElementById('renameFolderModal');
  const input = document.getElementById('renameFolderInput');
  const select = document.getElementById('renameFolderCategory');
  input.value = folder.name;
  select.innerHTML = categories.map(c => `<option value="${popupEsc(c)}"${c === folder.category ? ' selected' : ''}>${popupEsc(c)}</option>`).join('');
  modal.classList.remove('hidden');
  input.focus();
  input.select();
  document.getElementById('confirmRenameFolder').onclick = async () => {
    const name = input.value.trim();
    if (!name) return;
    folder.name = name;
    folder.category = select.value || folder.category;
    modal.classList.add('hidden');
    await saveData();
    renderCategoryFilters();
    renderFolders();
  };
}

// The Confirm Delete modal in popup.html
function showDeleteFolderModal(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder) return;
  const count = (folder.chats || []).length;
  document.getElementById('deleteMessage').textContent =
    `Delete the folder "${folder.name}"? Its ${count} chat${count === 1 ? '' : 's'} leave your folders and stay on claude.ai.`;
  const modal = document.getElementById('confirmDeleteModal');
  modal.classList.remove('hidden');
  document.getElementById('confirmDeleteBtn').onclick = async () => {
    modal.classList.add('hidden');
    folders = folders.filter(f => f.id !== folderId);
    await saveData();
    renderFolders();
    updateStats();
  };
}

function showFolderMenu(btn, folderId) {
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
  
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  
  menu.innerHTML = `
    <div class="context-menu-item" data-action="rename">Rename</div>
    <div class="context-menu-item" data-action="delete">Delete</div>
  `;
  
  document.body.appendChild(menu);
  
  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      const action = item.dataset.action;
      menu.remove();
      if (action === 'rename') showRenameFolderModal(folderId);
      else if (action === 'delete') showDeleteFolderModal(folderId);
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

function updateStats() {
  const el = document.getElementById('statsText');
  if (el) {
    const shown = popupShownFolders();
    const chats = shown.reduce((n, f) => n + (f.chats || []).length, 0);
    el.textContent = `${shown.length} folder${shown.length === 1 ? '' : 's'} • ${chats} chat${chats === 1 ? '' : 's'}`;
  }
}
