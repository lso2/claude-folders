// lib/folder-ops.js
// Runs one data-folder operation for the service worker, in the extension page that performs it.
// Loaded by the offscreen document and the access window, which both answer folder requests.
// Globals: runFolderOp, getOrgId, handleExportChatById, writeChatExport
// Depends on: lib/chat-markdown.js, lib/storage-keys.js, lib/handle-storage.js, lib/data-file.js,
//             lib/export-files.js, lib/cowork-api.js, lib/cowork-export.js
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
    // The offscreen document has no chrome.storage, so the service worker sends the data and its account
    case 'folderSyncToDisk': {
      if (!request.data || !request.data.folders) return { success: false, error: 'The sync request carried no folder data' };
      return { success: await writeDataFile(request.data, request.accountKey) };
    }
    case 'folderExportChatById':
      return handleExportChatById(request.chatId, request.chatTitle, request.orgId);
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
    return result.success ? writeChatExport(chatId, result.filename, result.markdown) : result;
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
  return writeChatExport(chatId, generateExportFilename(chatId, chatTitle), convertToMarkdown(data, chatTitle, chatId));
}

async function writeChatExport(chatId, filename, markdown) {
  const written = await writeExportFileChecked(filename, markdown);
  if (written.success) {
    const stored = await chrome.storage.local.get(EXPORTED_CHATS_KEY);
    const exported = stored[EXPORTED_CHATS_KEY] || {};
    exported[chatId] = new Date().toISOString();
    await chrome.storage.local.set({ [EXPORTED_CHATS_KEY]: exported });
  }
  return written;
}
