// organizer/chat-rows.js
// Draws chats as rows or cards with their View offline, Download and View chat buttons, for a folder and for the whole view.
// Globals: exportedPrefixRun, exportedAtById, loadExportedPrefixes, markExportedPrefixesStale, chatRowHtml, renderChatRows
// Depends on: organizer/app.js (esc, safeUrl), organizer/chats.js (downloadSingleChat, showChatMenu),
//             organizer/viewer.js (openMarkdownViewer), lib/chat-markdown.js (exportIdPrefix, exportPrefixOfFilename,
//             formatStamp), lib/export-state.js (loadExportRecords), lib/storage-keys.js (EXPORTED_CHATS_KEY),
//             background.js (listExports)
// Notes: docs/notes/organizer/chat-rows.js.md

// The lowercase id prefixes of the chats with an export, read once and kept until marked stale
let exportedPrefixRun = null;
// Chat id -> the time of its last export in ms, from the export records, for Sort by Export date (organizer/chat-sort.js)
let exportedAtById = new Map();

// The files in the data folder's chats folder hold every account's exports. A chat of another account
// has an export there and no record in this browser's storage.
function loadExportedPrefixes() {
  if (!exportedPrefixRun) exportedPrefixRun = readExportedPrefixes();
  return exportedPrefixRun;
}

async function readExportedPrefixes() {
  const prefixes = new Set();
  let listed = null;
  try {
    listed = await chrome.runtime.sendMessage({ action: 'listExports' });
  } catch (e) {
    listed = { success: false, error: e.message };
  }
  if (listed && listed.success) {
    (listed.files || []).forEach(name => {
      const prefix = exportPrefixOfFilename(name);
      if (prefix) prefixes.add(prefix);
    });
  } else {
    console.log('[ORGANIZER] The export files were not listed:', (listed && listed.error) || 'no answer');
  }
  try {
    const stored = await chrome.storage.local.get(EXPORTED_CHATS_KEY);
    Object.keys(stored[EXPORTED_CHATS_KEY] || {}).forEach(id => prefixes.add(exportIdPrefix(id).toLowerCase()));
    const records = await loadExportRecords();
    exportedAtById = new Map();
    Object.entries(records).forEach(([id, record]) => {
      if (record && record.filename) prefixes.add(exportIdPrefix(id).toLowerCase());
      const at = Date.parse((record && record.exportedAt) || '');
      if (Number.isFinite(at)) exportedAtById.set(id, at);
    });
  } catch (e) {
    console.log('[ORGANIZER] The export records were not read:', e.message);
  }
  return prefixes;
}

// A sync, an import or a download writes exports; the next drawing lists the folder again
function markExportedPrefixesStale() {
  exportedPrefixRun = null;
}

// item: { chat, folder }. opts.showFolder adds the folder name; opts.menu adds the move and remove menu
// for this login's chats in this login's folders.
function chatRowHtml(item, hasExport, opts) {
  const { chat, folder } = item;
  const other = !!chat.cfAccountLabel;
  // Another account's chat cannot be read from this login, so it has no Download button
  const offlineBtn = hasExport || !other ? `
        <button class="view-offline-btn ${hasExport ? '' : 'download-btn'}" data-chat-id="${esc(chat.id)}" data-title="${esc(chat.title)}" title="${hasExport ? 'View exported markdown' : 'Download chat as markdown'}">
          ${hasExport ? 'VIEW OFFLINE' : 'DOWNLOAD'}
        </button>` : '';
  const folderLabel = opts.showFolder && folder ? `<span class="chat-item-folder">${esc(folder.name)}</span>` : '';
  return `
    <div class="chat-item" data-chat-id="${esc(chat.id)}" data-url="${safeUrl(chat.url)}">
      <div class="chat-item-buttons">${offlineBtn}
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
        <div class="chat-item-title">${other ? `<span class="chat-account-tag" title="${esc(chat.cfAccountLabel)}">${esc(chat.cfAccountLabel)}</span>` : ''}${esc(chat.title)}</div>
        ${folderLabel}
        ${chat.snippet ? `<div class="chat-item-snippet">${esc(chat.snippet)}</div>` : ''}
        ${chat.tags && chat.tags.length ? `
          <div class="chat-item-tags">
            ${chat.tags.slice(0, 3).map(tag => `<span class="chat-tag">#${esc(tag)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
      <div class="chat-item-actions">
        <div class="chat-item-date">${esc(formatStamp(chat.updatedAt || chat.date))}</div>
        ${opts.menu && folder && folder.own && !other ? `<button class="chat-menu-btn" data-chat-id="${esc(chat.id)}">⋮</button>` : ''}
      </div>
    </div>`;
}

// view: 'list' or 'card', the container's class
async function renderChatRows(container, items, view, opts) {
  const prefixes = await loadExportedPrefixes();
  const has = chat => prefixes.has(exportIdPrefix(chat.id).toLowerCase());
  container.className = `chat-list-container ${view}-view`;
  container.innerHTML = items.map(item => chatRowHtml(item, has(item.chat), opts || {})).join('');

  container.querySelectorAll('.view-offline-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const { chatId, title } = btn.dataset;
      if (prefixes.has(exportIdPrefix(chatId).toLowerCase())) {
        openMarkdownViewer(chatId, title);
        return;
      }
      btn.disabled = true;
      btn.textContent = 'DOWNLOADING...';
      if (await downloadSingleChat(chatId, title)) {
        prefixes.add(exportIdPrefix(chatId).toLowerCase());
        btn.classList.remove('download-btn');
        btn.textContent = 'VIEW OFFLINE';
        btn.disabled = false;
      } else {
        btn.textContent = 'FAILED';
        setTimeout(() => { btn.textContent = 'DOWNLOAD'; btn.disabled = false; }, 2000);
      }
    });
  });

  container.querySelectorAll('.view-chat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.dataset.url && btn.dataset.url !== '#') window.open(btn.dataset.url, '_blank');
    });
  });

  container.querySelectorAll('.chat-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showChatMenu(btn, btn.dataset.chatId);
    });
  });
}
