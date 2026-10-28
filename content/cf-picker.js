// content/cf-picker.js
// Shows the folder picker for the open chat and files the chat into the chosen or new folder.
// Globals: showFolderPicker, createFolderAndAssign, assignCurrentChatToFolder
// Depends on: lib/cowork-api.js (isCoworkSessionId), content/cf-routes.js, content/cf-data.js,
//             content/cf-notify.js
// Notes: docs/notes/content/cf-picker.js.md

function showFolderPicker(anchorElement) {
  const existing = document.querySelector('.claude-folders-picker');
  if (existing) { existing.remove(); return; }
  
  const picker = document.createElement('div');
  picker.className = 'claude-folders-picker';
  
  const rect = anchorElement.getBoundingClientRect();
  picker.style.top = `${rect.bottom + 8}px`;
  picker.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  picker.style.left = 'auto';

  let html = '<div class="folders-picker-header">Select folder</div><div class="folders-picker-list">';

  if (folders.length > 0) {
    folders.forEach(folder => {
      html += `
        <div class="folder-picker-item" data-folder-id="${cfEscapeHtml(folder.id)}">
          <span class="folder-category">${cfEscapeHtml(folder.category)}</span>
          <span class="folder-name">${cfEscapeHtml(folder.name)}</span>
        </div>
      `;
    });
  } else {
    html += `<div style="padding:12px 16px;color:#888;font-size:13px;">No folders yet. Create one below:</div>`;
  }

  html += `</div>`;

  html += `
    <div class="folder-picker-divider"></div>
    <div class="folder-picker-new">
      <input type="text" id="newFolderName" placeholder="New folder name..." class="new-folder-input">
      <select id="newFolderCategory" class="new-folder-select">
        ${(categories.length > 0 ? categories : ['Personal', 'Work', 'Projects']).map(cat => `<option value="${cfEscapeHtml(cat)}">${cfEscapeHtml(cat)}</option>`).join('')}
      </select>
      <button class="create-folder-btn">Create & Add</button>
    </div>
  `;

  picker.innerHTML = html;
  document.body.appendChild(picker);

  // Clamp inside the viewport: if it would spill past the bottom, flip above
  const pickerRect = picker.getBoundingClientRect();
  if (pickerRect.bottom > window.innerHeight - 8) {
    const flippedTop = rect.top - pickerRect.height - 8;
    picker.style.top = `${Math.max(8, flippedTop)}px`;
  }
  
  picker.querySelectorAll('.folder-picker-item').forEach(item => {
    item.addEventListener('click', async () => {
      await assignCurrentChatToFolder(item.dataset.folderId);
      picker.remove();
    });
  });
  
  const createBtn = picker.querySelector('.create-folder-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const name = picker.querySelector('#newFolderName').value.trim();
      const category = picker.querySelector('#newFolderCategory').value;
      if (name) {
        await createFolderAndAssign(name, category);
        picker.remove();
      }
    });
  }
  
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!picker.contains(e.target) && e.target !== anchorElement) {
        picker.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 0);
}

async function createFolderAndAssign(folderName, category) {
  const folderId = 'folder-' + Date.now();
  try {
    await chrome.runtime.sendMessage({
      action: 'createFolder',
      folder: { id: folderId, category, name: folderName, chats: [] }
    });
    await loadData();
    await assignCurrentChatToFolder(folderId);
    showNotification('Folder created and chat added');
  } catch (error) {
    showNotification('Error: ' + error.message, true);
  }
}

async function assignCurrentChatToFolder(folderId) {
  const chatTitle = cfCurrentChatTitle();
  const chatUrl = window.location.href;
  
  try {
    await chrome.runtime.sendMessage({
      action: 'assignChatToFolder',
      chat: {
        id: currentChatId,
        title: chatTitle,
        url: chatUrl,
        tags: isCoworkSessionId(currentChatId) ? ['cowork'] : [],
        date: new Date().toISOString().split('T')[0],
        relativeDate: 'Today'
      },
      folderId
    });
    await loadData();
    showNotification('Added to folder');
  } catch (error) {
    showNotification('Error: ' + error.message, true);
  }
}
