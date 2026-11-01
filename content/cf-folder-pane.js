// content/cf-folder-pane.js
// Shows one folder's chats in a pane to the right of the Folders panel, with titles wrapped in full.
// Globals: CF_FOLDER_PANE_STEP, CF_FOLDER_PANE_WIDTH, CF_FOLDER_PANE_MIN_WIDTH, cfCoworkTag, cfFolderPaneRow,
//          cfFolderPaneHtml, cfToggleFolderPane, cfOpenFolderPane, cfCloseFolderPane, cfFolderPaneState,
//          cfPlaceFolderPane, cfFolderPaneKeydown
// Depends on: content/cf-text.js, content/cf-account-view.js (cfViewFolders, cfOrgTag),
//             lib/account-view.js (cfAccountLabel), lib/cowork-api.js (isCoworkSessionId)
// Notes: docs/notes/content/cf-folder-pane.js.md

// Chats shown when a folder is opened, and added by each Load more
const CF_FOLDER_PANE_STEP = 30;
// The pane's width, and its narrowest width when the window has less room to the panel's right
const CF_FOLDER_PANE_WIDTH = 360;
const CF_FOLDER_PANE_MIN_WIDTH = 260;

// Rows for Cowork sessions have a Cowork label
function cfCoworkTag(chat) {
  return chat && isCoworkSessionId(chat.id) ? '<span class="folder-chat-org">Cowork</span>' : '';
}

// row: { chat, account } from cfViewFolders. The second line has the account's label when the folder holds chats of
// more than one account, or when the chat is another account's. Another account's chat can be opened only in a
// browser signed in to that account.
function cfFolderPaneRow(row, mixed) {
  const chat = row.chat;
  const account = mixed || !row.account.current ? `<span class="cf-pane-chat-account">${cfEscapeHtml(cfAccountLabel(row.account))}</span>` : '';
  const tags = account + cfCoworkTag(chat) + cfOrgTag(chat);
  const body = `<span class="cf-pane-chat-title">${cfEscapeHtml(chat.title || 'Untitled')}</span>${tags ? `<span class="cf-pane-chat-meta">${tags}</span>` : ''}`;
  if (row.account.current) return `<a class="cf-pane-chat" href="${cfSafeUrl(chat.url)}" target="_blank">${body}</a>`;
  const where = `Account: ${cfAccountLabel(row.account)}. This chat can be opened in a browser signed in to that account.`;
  return `<div class="cf-pane-chat cf-pane-chat-elsewhere" title="${cfEscapeHtml(where)}">${body}</div>`;
}

// The header and the folder's first `shown` chats
function cfFolderPaneHtml(folder, shown) {
  const count = folder.rows.length;
  const mixed = new Set(folder.rows.map(r => r.account.key)).size > 1;
  const rows = folder.rows.slice(0, shown).map(r => cfFolderPaneRow(r, mixed)).join('');
  const remaining = Math.max(0, count - shown);
  const next = Math.min(CF_FOLDER_PANE_STEP, remaining);
  const more = remaining ? `<button class="cf-folder-pane-more">Load ${next} more${next < remaining ? ` (${remaining} left)` : ''}</button>` : '';
  const empty = count ? '' : '<div class="cf-folder-pane-empty">No chats in this folder</div>';
  const category = folder.category ? `<span class="folder-chat-org">${cfEscapeHtml(folder.category)}</span>` : '';
  return `
    <div class="cf-folder-pane-header">
      <div class="cf-folder-pane-heading">
        <h3 class="cf-folder-pane-title">${cfEscapeHtml(folder.name)}</h3>
        <div class="cf-folder-pane-sub">${category}<span>${count} ${count === 1 ? 'chat' : 'chats'}</span></div>
      </div>
      <button class="panel-btn cf-folder-pane-close" title="Close" aria-label="Close">×</button>
    </div>
    <div class="cf-folder-pane-list">${rows}${empty}${more}</div>`;
}

// Opens the folder in the pane, or closes the pane when that folder is the one open
function cfToggleFolderPane(panel, folderId) {
  const pane = panel.querySelector('.cf-folder-pane');
  if (pane && pane.dataset.folderId === folderId) cfCloseFolderPane(panel);
  else cfOpenFolderPane(panel, folderId, CF_FOLDER_PANE_STEP, 0);
}

// Draws the folder of the current view in the pane and highlights its row. When the view lacks the folder, the pane is closed.
function cfOpenFolderPane(panel, folderId, shown, scrollTop) {
  const folder = cfViewFolders().find(f => f.id === folderId);
  if (!folder) {
    cfCloseFolderPane(panel);
    return;
  }
  let pane = panel.querySelector('.cf-folder-pane');
  if (!pane) {
    pane = document.createElement('div');
    pane.className = 'cf-folder-pane';
    pane.setAttribute('role', 'region');
    panel.appendChild(pane);
  }
  pane.dataset.folderId = folderId;
  pane.dataset.shown = String(shown);
  pane.setAttribute('aria-label', folder.name);
  pane.innerHTML = cfFolderPaneHtml(folder, shown);
  pane.querySelector('.cf-folder-pane-close').addEventListener('click', () => cfCloseFolderPane(panel));
  pane.querySelector('.cf-folder-pane-more')?.addEventListener('click', () => {
    cfOpenFolderPane(panel, folderId, shown + CF_FOLDER_PANE_STEP, pane.querySelector('.cf-folder-pane-list').scrollTop);
  });
  panel.querySelectorAll('.folder-panel-item').forEach(item => item.classList.toggle('active', item.dataset.folderId === folderId));
  document.addEventListener('keydown', cfFolderPaneKeydown);
  window.addEventListener('resize', cfPlaceFolderPane);
  cfPlaceFolderPane();
  // The width decides the height of the wrapped rows. The scroll position is set after it.
  pane.querySelector('.cf-folder-pane-list').scrollTop = scrollTop;
}

// Removes the pane, the row highlight and the pane's listeners
function cfCloseFolderPane(panel) {
  panel.querySelector('.cf-folder-pane')?.remove();
  panel.querySelectorAll('.folder-panel-item.active').forEach(item => item.classList.remove('active'));
  document.removeEventListener('keydown', cfFolderPaneKeydown);
  window.removeEventListener('resize', cfPlaceFolderPane);
}

// The open folder, the chats shown and the list's scroll position, read before the panel is drawn again
function cfFolderPaneState(panel) {
  const pane = panel.querySelector('.cf-folder-pane');
  if (!pane) return null;
  const list = pane.querySelector('.cf-folder-pane-list');
  return { folderId: pane.dataset.folderId, shown: Number(pane.dataset.shown) || CF_FOLDER_PANE_STEP, scrollTop: list ? list.scrollTop : 0 };
}

// The pane is as tall as the panel and up to 360px wide, at the panel's right edge. In a narrower window the pane
// ends at the window's right edge, over the right side of the panel.
function cfPlaceFolderPane() {
  const panel = document.querySelector('.claude-folders-panel');
  const pane = panel && panel.querySelector('.cf-folder-pane');
  if (!pane) return;
  const box = panel.getBoundingClientRect();
  const width = Math.min(CF_FOLDER_PANE_WIDTH, Math.max(CF_FOLDER_PANE_MIN_WIDTH, Math.floor(window.innerWidth - box.right)));
  pane.style.width = width + 'px';
  pane.style.left = Math.min(box.width, window.innerWidth - box.left - width) + 'px';
}

function cfFolderPaneKeydown(e) {
  if (e.key !== 'Escape') return;
  const panel = document.querySelector('.claude-folders-panel');
  if (panel) cfCloseFolderPane(panel);
}
