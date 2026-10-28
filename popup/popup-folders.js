// popup/popup-folders.js
// Renders the popup's folder list, category filters and folder menu, and edits categories.
// Globals: showEditCategoriesModal, renderCategoriesList, renderCategoryFilters, renderFolders,
//          showFolderMenu, updateStats
// Depends on: popup/popup.js (state, saveData)
// Notes: docs/notes/popup/popup-folders.js.md

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
      <span>${cat}</span>
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
  
  let html = '<button class="filter-pill active" data-filter="all">All</button>';
  categories.forEach(cat => {
    html += `<button class="filter-pill" data-filter="${cat}">${cat}</button>`;
  });
  container.innerHTML = html;
  
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
  const setupInstructions = document.getElementById('setupInstructions');
  const toggleSetupBtn = document.getElementById('toggleSetupBtn');
  if (!container) return;
  
  // Check if we have any organized folders (exclude unsorted)
  const organizedFolders = folders.filter(f => f.id !== 'unsorted');
  const hasOrganizedData = organizedFolders.length > 0 && categories.length > 0;
  
  // Show/hide setup instructions and toggle button
  if (setupInstructions && toggleSetupBtn) {
    if (hasOrganizedData) {
      setupInstructions.classList.add('hidden');
      toggleSetupBtn.classList.remove('hidden');
    } else {
      setupInstructions.classList.remove('hidden');
      toggleSetupBtn.classList.add('hidden');
    }
  }
  
  let filtered = folders;
  if (currentFilter !== 'all') {
    filtered = filtered.filter(f => f.category === currentFilter);
  }
  if (searchTerm) {
    filtered = filtered.filter(f => 
      f.name.toLowerCase().includes(searchTerm) ||
      f.chats.some(c => c.title.toLowerCase().includes(searchTerm))
    );
  }
  
  if (folders.length === 0) {
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
        <div class="folder-category-header" data-category="${cat}">
          <span>${cat} (${totalChats})</span>
          <svg class="category-toggle-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4"/>
          </svg>
        </div>
        <div class="folder-category-content">
          ${catFolders.map(folder => `
            <div class="folder-item" data-folder-id="${folder.id}">
              <div class="folder-header">
                <div class="folder-info">
                  <span class="folder-name">${folder.name}</span>
                </div>
                <div class="folder-actions">
                  <span class="folder-count">${folder.chats?.length || 0}</span>
                  <button class="folder-menu-btn" data-folder-id="${folder.id}">⋮</button>
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
      if (action === 'rename') {
        const folder = folders.find(f => f.id === folderId);
        const newName = prompt('New name:', folder.name);
        if (newName) {
          folder.name = newName;
          await saveData();
          renderFolders();
        }
      } else if (action === 'delete') {
        if (confirm('Delete this folder?')) {
          folders = folders.filter(f => f.id !== folderId);
          await saveData();
          renderFolders();
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

function updateStats() {
  const el = document.getElementById('statsText');
  if (el) {
    el.textContent = `${folders.length} folders • ${allChats.length} chats`;
  }
}
