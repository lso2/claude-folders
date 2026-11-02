// organizer/organizer-host.js
// Connects the organizer modules the offline library shares to the extension's background and storage.
// standalone/library-host.js has the same names for the library page.
// Globals: CF_HOST_MISSING_EXPORT, cfHostChatMenu, cfHostExportFolder, cfHostListAccounts, cfHostReadAccountView,
//          cfHostStoreAccountView, cfHostImportAccount, cfHostExportedChats, cfHostOpenChat, cfHostMissingExport,
//          cfHostIndexStep, cfHostReadExport, cfHostOpenExport, cfHostOpenFolderAccess
// Depends on: background.js (listAccounts, listExports, indexExports, readExportFile, openFolderAccess), organizer/viewer.js,
//             organizer/chat-actions.js, organizer/run-start.js, organizer/accounts.js, organizer/content-index.js,
//             lib/account-view-store.js, lib/chat-markdown.js, lib/export-state.js, lib/storage-keys.js
// Notes: docs/notes/organizer/organizer-host.js.md

// A chat of this login with no export file offers Download (cfHostMissingExport)
const CF_HOST_MISSING_EXPORT = { label: 'DOWNLOAD', title: 'Download chat as markdown' };

// The move and remove menu of this login's chats
function cfHostChatMenu(btn, chatId) {
  showChatMenu(btn, chatId);
}

// Export folder on a folder page of this login: the folder export, run in the claude.ai tab
function cfHostExportFolder() {
  startOrganizerFolderExport();
}

// This login's key, every account the background lists with its folders, and the data folder's error, if any.
// A restarted service worker answers without the login, which the last claude.ai page stored.
async function cfHostListAccounts() {
  let answer = null;
  try {
    answer = await chrome.runtime.sendMessage({ action: 'listAccounts', withFolders: true });
  } catch (e) {
    answer = { success: false, error: e.message };
  }
  if (!answer || !answer.success) console.log('[ORGANIZER] Accounts were not listed:', (answer && answer.error) || 'the background answered nothing');
  const listed = answer && answer.success;
  const current = (listed && answer.current) || (await chrome.storage.local.get('activeAccountKey')).activeAccountKey || null;
  return { current, accounts: listed ? answer.accounts || [] : [], folderError: listed ? answer.folderError : null };
}

// The account view each login keeps, shared with the Folders panel and the popup (lib/account-view-store.js)
function cfHostReadAccountView(accountKey) {
  return cfReadAccountView(accountKey);
}

function cfHostStoreAccountView(accountKey, view) {
  return cfStoreAccountView(accountKey, view);
}

// Import from another account opens the import dialog in a claude.ai tab
function cfHostImportAccount() {
  startOrganizerAccountImport();
}

// A choice made in the Folders panel or the popup is shown here too
cfWatchAccountView(() => organizerCurrentKey, (view) => {
  if (view === organizerAccountView) return;
  organizerAccountView = view;
  renderAccountSelect();
  applyOrganizerAccountView();
});

// The files in the data folder's chats folder hold every account's exports. A chat of another account
// has an export there and no record in this browser's storage.
// Returns { prefixes: Set of lowercase id prefixes, exportedAt: Map of chat id to its last export time in ms }.
async function cfHostExportedChats() {
  const prefixes = new Set();
  const exportedAt = new Map();
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
    Object.entries(records).forEach(([id, record]) => {
      if (record && record.filename) prefixes.add(exportIdPrefix(id).toLowerCase());
      const at = Date.parse((record && record.exportedAt) || '');
      if (Number.isFinite(at)) exportedAt.set(id, at);
    });
  } catch (e) {
    console.log('[ORGANIZER] The export records were not read:', e.message);
  }
  return { prefixes, exportedAt };
}

// View offline on a chat with an export
function cfHostOpenChat(chatId, title) {
  openMarkdownViewer(chatId, title);
}

// Download on a chat with no export: the background exports it. Resolves true once the file is written.
async function cfHostMissingExport(btn, chatId, title) {
  btn.disabled = true;
  btn.textContent = 'DOWNLOADING...';
  if (await downloadSingleChat(chatId, title)) {
    btn.classList.remove('download-btn');
    btn.textContent = 'VIEW OFFLINE';
    btn.disabled = false;
    return true;
  }
  btn.textContent = 'FAILED';
  setTimeout(() => { btn.textContent = CF_HOST_MISSING_EXPORT.label; btn.disabled = false; }, 2000);
  return false;
}

// One time slice of the content search index, run by the folder writer that holds the folder grant (lib/search-build.js)
async function cfHostIndexStep(after) {
  try {
    return await chrome.runtime.sendMessage({ action: 'indexExports', after });
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// The data folder is read through the background's folder writer, which holds the folder grant
async function cfHostReadExport(filename) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'readExportFile', filename });
    if (res && res.success) return res;
    return { success: false, error: (res && res.error) || 'the background answered nothing' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// The export view page reads the file itself, and a reload of that tab reads it again
function cfHostOpenExport(filename, title) {
  openExportView(filename, title);
}

function cfHostOpenFolderAccess() {
  chrome.runtime.sendMessage({ action: 'openFolderAccess' }).catch(e => console.log('[SEARCH] Folder access window not opened:', e.message));
}

// A finished sync or import may have written exports
chrome.storage.onChanged.addListener((changes, area) => {
  const state = area === 'local' && changes[RUN_STATE_KEY] && changes[RUN_STATE_KEY].newValue;
  if (state && state.done) markContentIndexStale();
});
