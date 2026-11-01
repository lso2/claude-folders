// content/cf-export-messages.js
// Answers export requests that the organizer sends to the Claude tab.
// Globals: cfOnExportMessage, handleExportChatByIdMessage
// Depends on: lib/chat-exporter.js, content/cf-export-run.js
// Notes: docs/notes/content/cf-export-messages.js.md

// Registered by init; returns true only for the actions answered here
function cfOnExportMessage(message, sender, sendResponse) {
  // A folder export started from the organizer (lib/claude-tab.js)
  if (message.action === 'startBulkExport') {
    const chats = message.chats || [];
    if (chats.length) cfRunExportWithModal(chats, message.title || 'Exporting chats');
    sendResponse({ success: true });
    return true;
  }
  if (message.action === 'exportChatById') {
    handleExportChatByIdMessage(message.chatId, message.title)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  return false;
}

// The organizer gets the markdown back and writes it from its own page
async function handleExportChatByIdMessage(chatId, title) {
  if (!window.chatExporter) {
    return { success: false, error: 'Chat exporter not available' };
  }
  return window.chatExporter.exportChatById(chatId, title, cfOrgIdFor({ id: chatId }));
}
