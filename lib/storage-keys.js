// lib/storage-keys.js
// Names the chrome.storage.local keys shared by the content scripts and the extension pages.
// Globals: QUEUED_EXPORTS_KEY, EXPORTED_CHATS_KEY
// Notes: docs/notes/lib/storage-keys.js.md

// Exports waiting for folder access, as [{ filename, content, chatId, queuedAt, lastError }]
const QUEUED_EXPORTS_KEY = 'cfQueuedExports';

// Export time per chat id, as { [chatId]: isoString }
const EXPORTED_CHATS_KEY = 'exportedChats';
