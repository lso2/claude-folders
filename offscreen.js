// offscreen.js
// Offscreen document that answers the service worker's data-folder requests when no access window is open.
// Globals: none beyond its message listener
// Depends on: lib/chat-markdown.js, lib/storage-keys.js, lib/handle-storage.js, lib/data-file.js,
//             lib/export-files.js, lib/folder-ops.js (loaded first by offscreen.html)
// Notes: docs/notes/offscreen.js.md

// Content scripts broadcast to every extension page, so other actions are left unanswered here
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (sender.id !== chrome.runtime.id || !String(message.action || '').startsWith('folder') || message.target !== 'offscreen') return false;
  runFolderOp(message)
    .then(result => sendResponse(result))
    .catch(e => sendResponse({ success: false, code: 'write', error: `${e.name}: ${e.message}` }));
  return true;
});

console.log('[OFFSCREEN] Ready');
