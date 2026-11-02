// organizer/chat-rows.js
// Draws chats as rows or cards with their View offline, Download and View chat buttons, for a folder and for the whole view.
// Shared with the offline library. The page's host file answers what differs: export files, opening and missing exports.
// Globals: exportedPrefixRun, exportedAtById, loadExportedPrefixes, markExportedPrefixesStale, chatRowHtml, renderChatRows
// Depends on: lib/html-escape.js (esc, safeUrl), lib/chat-markdown.js (exportIdPrefix, formatStamp), the page's host file
//             (cfHostExportedChats, cfHostOpenChat, cfHostMissingExport, cfHostChatMenu, CF_HOST_MISSING_EXPORT):
//             organizer/organizer-host.js, or standalone/library-host.js in the library
// Notes: docs/notes/organizer/chat-rows.js.md

// The lowercase id prefixes of the chats with an export, read once and kept until marked stale
let exportedPrefixRun = null;
// Chat id -> the time of its last export in ms, from the export records, for Sort by Export date (organizer/chat-sort.js)
let exportedAtById = new Map();

// The lowercase id prefixes of the chats with an export file, and each chat's last export time (cfHostExportedChats)
function loadExportedPrefixes() {
  if (!exportedPrefixRun) {
    exportedPrefixRun = cfHostExportedChats().then(found => {
      exportedAtById = found.exportedAt;
      return found.prefixes;
    });
  }
  return exportedPrefixRun;
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
        <button class="view-offline-btn ${hasExport ? '' : 'download-btn'}" data-chat-id="${esc(chat.id)}" data-title="${esc(chat.title)}" title="${hasExport ? 'View exported markdown' : CF_HOST_MISSING_EXPORT.title}">
          ${hasExport ? 'VIEW OFFLINE' : CF_HOST_MISSING_EXPORT.label}
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
        ${opts.menu && cfHostChatMenu && folder && folder.own && !other ? `<button class="chat-menu-btn" data-chat-id="${esc(chat.id)}">⋮</button>` : ''}
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
        cfHostOpenChat(chatId, title);
        return;
      }
      if (await cfHostMissingExport(btn, chatId, title)) prefixes.add(exportIdPrefix(chatId).toLowerCase());
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
      cfHostChatMenu(btn, btn.dataset.chatId);
    });
  });
}
