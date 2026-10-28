// organizer/chats.js
// Renders the chats inside an organizer folder with their offline, download and move controls.
// Globals: renderChatList, checkExportFileExists, downloadSingleChat, renderActivityTab,
//          renderRecentChats, formatRelativeDate, showChatMenu, showMoveChatModal, moveChat, deleteChat
// Depends on: organizer/app.js, organizer/viewer.js, lib/export-files.js, lib/chat-markdown.js
// Notes: docs/notes/organizer/chats.js.md

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

// Uses lib/export-files.js and the shared filename from lib/chat-markdown.js
async function checkExportFileExists(chatId, chatTitle) {
  const filename = generateExportFilename(chatId, chatTitle);
  return await checkExportExists(filename);
}

// The background asks the offscreen writer to fetch and save this one chat
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
