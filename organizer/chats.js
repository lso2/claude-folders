// organizer/chats.js
// Renders the chats inside an organizer folder, their activity, and the download, move and remove actions.
// Globals: renderChatList, checkExportFileExists, downloadSingleChat, renderActivityTab,
//          renderRecentChats, showChatMenu, showMoveChatModal, ownFolderOfView,
//          reopenCurrentFolder, moveChat, deleteChat
// Depends on: organizer/app.js, organizer/accounts.js (viewFolders), organizer/viewer.js, lib/export-files.js,
//             organizer/chat-rows.js (loadExportedPrefixes, renderChatRows), organizer/chat-sort.js (sortChatItems),
//             lib/chat-markdown.js (formatStamp, EXPORT_FORMAT), lib/export-state.js (recordExports), lib/page-dialog.js (cfPageConfirm)
// Notes: docs/notes/organizer/chats.js.md

// The open folder's chats in the Sort by order (organizer/chat-sort.js), as rows or cards (organizer/chat-rows.js)
async function renderChatList() {
  const container = document.getElementById('chatListContainer');
  if (!container || !currentFolder) return;
  const chats = currentFolder.chats || [];
  if (chats.length === 0) {
    container.className = `chat-list-container ${currentView}-view`;
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--body-text);">
        <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--title-color);">No chats in this folder</h3>
        <p>Add chats from claude.ai using the "Add to folder" button</p>
      </div>
    `;
    return;
  }
  await loadExportedPrefixes();
  const items = sortChatItems(chats.map(chat => ({ chat, folder: currentFolder })));
  await renderChatRows(container, items, currentView, { menu: true });
}

// Uses lib/export-files.js and the shared filename from lib/chat-markdown.js
async function checkExportFileExists(chatId, chatTitle) {
  const filename = generateExportFilename(chatId, chatTitle);
  return await checkExportExists(filename);
}

// The background asks the offscreen writer to fetch and save this one chat
// The folder worker writes the file. This page records it, since the offscreen writer has no chrome.storage.
async function downloadSingleChat(chatId, chatTitle) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'exportChatById',
      chatId: chatId,
      chatTitle: chatTitle
    });
    if (!response || !response.success) {
      console.log('[ORGANIZER] Not downloaded:', chatTitle, '-', (response && response.error) || 'the response was empty');
      return false;
    }
    await recordExports([{ chatId, filename: response.filename, mark: response.mark, format: EXPORT_FORMAT }]);
    return true;
  } catch (e) {
    console.log('[ORGANIZER] Not downloaded:', chatTitle, '-', e.message);
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
          Added ${esc(formatStamp(chat.updatedAt || chat.date))}
        </div>
      </div>
    </div>
  `).join('');
}

// The newest chats of the folders the account view shows
function renderRecentChats() {
  const recentList = document.getElementById('recentChats');
  if (!recentList) return;
  
  const shown = new Map();
  viewFolders.forEach(f => (f.chats || []).forEach(c => { if (!shown.has(c.id)) shown.set(c.id, c); }));
  const sorted = [...shown.values()].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  const recent = sorted.slice(0, 50);
  
  if (recent.length === 0) {
    recentList.innerHTML = '<div style="padding:8px 12px;color:var(--text-secondary);font-size:12px;">No chats yet</div>';
    return;
  }
  
  recentList.innerHTML = recent.map(chat => `
    <a href="${safeUrl(chat.url)}" target="_blank" class="recent-item" title="${esc(chat.title)}">${esc(chat.title)}</a>
  `).join('');
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
        const chat = (currentFolder && currentFolder.chats || []).find(c => c.id === chatId);
        const title = chat ? `"${chat.title}"` : 'This chat';
        if (await cfPageConfirm('Remove this chat from the folder?', `${title} is removed from this folder. The chat on claude.ai is unchanged.`, 'Remove', true)) {
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

// The open folder as this login stores it. The page draws a copy built for the account view.
function ownFolderOfView() {
  return currentFolder && currentFolder.own ? folders.find(f => f.id === currentFolder.id) : null;
}

// After a change to this login's folders, the view is built again and the open folder redrawn from it
function reopenCurrentFolder() {
  const id = currentFolder && currentFolder.id;
  refreshView();
  currentFolder = viewFolders.find(f => f.id === id) || null;
  if (currentFolder) renderChatList();
}

async function moveChat(chatId, toFolderId) {
  const from = ownFolderOfView();
  if (!from || !from.chats) return;
  
  const chat = from.chats.find(c => c.id === chatId);
  if (!chat) return;
  
  from.chats = from.chats.filter(c => c.id !== chatId);
  
  const toFolder = folders.find(f => f.id === toFolderId);
  if (toFolder) {
    if (!toFolder.chats) toFolder.chats = [];
    toFolder.chats.push(chat);
  }
  
  folders = folders.map(f => ({
    ...f,
    lastActivity: f.chats && f.chats.length > 0 ? Math.max(...f.chats.map(c => new Date(c.date || 0).getTime())) : 0
  }));
  await saveData();
  reopenCurrentFolder();
}

async function deleteChat(chatId) {
  const from = ownFolderOfView();
  if (!from || !from.chats) return;
  
  from.chats = from.chats.filter(c => c.id !== chatId);
  allChats = allChats.filter(c => c.id !== chatId);
  
  await saveData();
  reopenCurrentFolder();
}
