// organizer/viewer.js
// Opens an exported chat in a new tab of organizer/export-view.html, which reads it again on every reload.
// Globals: exportViewUrl, openExportView, openMarkdownViewer
// Depends on: lib/export-state.js (loadExportRecord), lib/chat-markdown.js (generateExportFilename, exportIdPrefix),
//             lib/page-dialog.js (cfPageAlert), background.js (findExport), organizer/export-view.html
// Notes: docs/notes/organizer/viewer.js.md

function exportViewUrl(filename, title) {
  return chrome.runtime.getURL('organizer/export-view.html') + '?file=' + encodeURIComponent(filename) + '&title=' + encodeURIComponent(title || filename);
}

// The tab is opened after the file is found, outside the click that asked for it
function openExportView(filename, title) {
  chrome.tabs.create({ url: exportViewUrl(filename, title) })
    .catch(e => cfPageAlert('Export not opened', `The tab was not opened: ${e.message}`));
}

// A renamed chat or Cowork session keeps the file name it had at export, and the file is found by the chat's
// id prefix (lib/folder-ops.js findExportFile)
async function openMarkdownViewer(chatId, chatTitle) {
  const record = await loadExportRecord(chatId);
  let found = null;
  try {
    found = await chrome.runtime.sendMessage({ action: 'findExport', chatId, filename: (record && record.filename) || generateExportFilename(chatId, chatTitle) });
  } catch (e) {
    found = { success: false, error: e.message };
  }
  if (!found || !found.success) {
    cfPageAlert('Export not opened', `The chats folder was not searched for ${exportIdPrefix(chatId)}: ${(found && found.error) || 'the background answered nothing'}`);
    return;
  }
  if (!found.filename) {
    cfPageAlert('Export not opened', `No file in the chats folder starts with ${exportIdPrefix(chatId)}_`);
    return;
  }
  openExportView(found.filename, chatTitle);
}
