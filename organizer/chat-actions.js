// organizer/chat-actions.js
// The organizer's download, move and remove actions on a chat of this login.
// Globals: checkExportFileExists, downloadSingleChat, showChatMenu, showMoveChatModal, ownFolderOfView,
//          reopenCurrentFolder, moveChat, deleteChat
// Depends on: organizer/app.js (folders, saveData, refreshView), organizer/accounts.js (viewFolders), organizer/folders.js (openFolder),
//             organizer/chats.js (renderChatList), lib/export-files.js (checkExportExists), lib/chat-markdown.js (generateExportFilename,
//             EXPORT_FORMAT), lib/export-state.js (recordExports), lib/page-dialog.js (cfPageConfirm), background.js (exportChatById)
// Notes: docs/notes/organizer/chat-actions.js.md

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
