// organizer/chats.js
// Draws a folder's chats and their activity, and the sidebar's recent chats. Shared with the offline library.
// Globals: renderChatList, renderActivityTab, renderRecentChats
// Depends on: the page's state (currentFolder, currentView, viewFolders), lib/html-escape.js (esc, safeUrl),
//             organizer/chat-rows.js (loadExportedPrefixes, renderChatRows), organizer/chat-sort.js (sortChatItems),
//             lib/chat-markdown.js (formatStamp)
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
