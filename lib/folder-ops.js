// lib/folder-ops.js
// Runs one data-folder operation for the service worker, in the extension page that performs it.
// Loaded by the offscreen document and the access window. Both answer folder requests.
// Globals: runFolderOp, getOrgId, handleExportChatById, writeChatExport, findExportFile, exportFileFound
// Depends on: lib/chat-markdown.js, lib/handle-storage.js, lib/data-file.js, lib/account-files.js,
//             lib/export-files.js, lib/cowork-api.js, lib/cowork-export.js, lib/search-build.js
// Notes: docs/notes/lib/folder-ops.js.md

// Returns null for an action this file does not perform
async function runFolderOp(request) {
  switch (request.action) {
    case 'folderWriteExport':
      return writeExportFileChecked(request.filename, request.content);
    case 'folderCheckAccess':
      return { success: true, ...(await checkFolderAccess()) };
    case 'folderListExports':
      return { success: true, files: await listExportedChats() };
    case 'folderReadExport':
      return readExportFileChecked(generateExportFilename(request.chatId, request.chatTitle));
    // A bare .md filename, the form folderListExports returns
    case 'folderReadExportFile': {
      const name = String(request.filename || '');
      if (!/^[^\\/]+\.md$/.test(name)) return { success: false, error: `not an export filename: ${name}` };
      return readExportFileChecked(name, request.maxBytes);
    }
    case 'folderCheckExportExists':
      return { success: true, exists: await checkExportExists(generateExportFilename(request.chatId, request.chatTitle)) };
    case 'folderFindExport':
      return findExportFile(request.chatId, request.filename);
    // The offscreen document has no chrome.storage. The request carries the data and its account.
    case 'folderSyncToDisk': {
      if (!request.data || !request.data.folders) return { success: false, error: 'The sync request carried no folder data' };
      return { success: await writeDataFile(request.data, request.accountKey) };
    }
    case 'folderExportChatById':
      return handleExportChatById(request.chatId, request.chatTitle, request.orgId);
    case 'folderReadAccountFiles':
      return readAccountFiles(request.known || null);
    case 'folderRetireAccountFile':
      return retireAccountFile(request.key, request.uuid);
    // One time slice of the content search index (lib/search-build.js)
    case 'folderIndexExports':
      return cfIndexExportsStep(typeof request.after === 'string' ? request.after : null);
    default:
      return null;
  }
}

// The page-side exporter stores the active org id; extension pages have no claude.ai cookies to read
async function getOrgId() {
  try {
    const result = await chrome.storage.local.get('activeOrgId');
    if (result.activeOrgId) return result.activeOrgId;
  } catch (e) {}
  return null;
}

async function handleExportChatById(chatId, chatTitle, ownerOrgId) {
  const orgId = ownerOrgId || await getOrgId();
  // Without an organization the Cowork endpoints answer for the active one
  if (isCoworkSessionId(chatId)) {
    const result = await exportCoworkSession(chatId, chatTitle, orgId);
    return result.success ? writeChatExport(chatId, result.filename, result.markdown, result.mark) : result;
  }
  if (!orgId) return { success: false, error: 'No active org id - open claude.ai and sync once first' };
  const response = await fetch(`https://claude.ai/api/organizations/${orgId}/chat_conversations/${chatId}?tree=True&rendering_mode=messages&render_all_tools=true`, {
    credentials: 'include'
  });
  if (!response.ok) {
    return { success: false, error: response.status === 404 ? `not found under organization ${String(orgId).slice(-6)}` : `HTTP ${response.status}` };
  }
  const data = await response.json();
  data.chat_messages = currentBranchMessages(data);
  return writeChatExport(chatId, generateExportFilename(chatId, chatTitle), convertToMarkdown(data, chatTitle, chatId),
    data.current_leaf_message_uuid || null);
}

// The offscreen writer has no chrome.storage. The page that asked records the export
// from the chatId, filename and mark in the result (lib/export-state.js).
async function writeChatExport(chatId, filename, markdown, mark) {
  const written = await writeExportFileChecked(filename, markdown);
  return written.success ? { ...written, chatId, mark: mark || null } : written;
}

// The export of one conversation in chats/. The file named in its record is opened directly.
// Without that file, the folder is listed for the first file with the conversation's id prefix.
async function findExportFile(chatId, filename) {
  const access = await checkFolderAccess();
  if (!access.hasHandle) return { success: false, code: 'no-folder', error: access.error || 'No data folder is selected' };
  if (access.permission !== 'granted') return { success: false, code: 'permission', error: `Access to the data folder is "${access.permission}"` };
  try {
    const handle = await loadFolderHandle();
    let chatsFolder;
    try {
      chatsFolder = await handle.getDirectoryHandle('chats', { create: false });
    } catch (e) {
      if (e.name === 'NotFoundError') return { success: true, filename: null };
      throw e;
    }
    const prefix = exportIdPrefix(chatId).toLowerCase();
    if (filename && exportPrefixOfFilename(filename) === prefix) {
      try {
        return await exportFileFound(await chatsFolder.getFileHandle(filename));
      } catch (e) {
        // getFileHandle throws TypeError for a name that is not a valid file name
        if (e.name !== 'NotFoundError' && e.name !== 'TypeError') throw e;
      }
    }
    for await (const entry of chatsFolder.values()) {
      if (entry.kind === 'file' && exportPrefixOfFilename(entry.name) === prefix) return exportFileFound(entry);
    }
    return { success: true, filename: null };
  } catch (err) {
    return { success: false, code: 'read', error: `${err.name}: ${err.message}` };
  }
}

async function exportFileFound(entry) {
  const file = await entry.getFile();
  return { success: true, filename: entry.name, lastModified: new Date(file.lastModified).toISOString() };
}
