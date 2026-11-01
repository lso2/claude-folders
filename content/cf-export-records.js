// content/cf-export-records.js
// Records each chat's export outcome in extension storage.
// Globals: markChatAsExported, cfMarkChatsExported, cfMarkChatUnavailable, cfLoadUnavailableChats
// Depends on: lib/storage-keys.js (EXPORTED_CHATS_KEY), lib/export-state.js (recordExports),
//             lib/chat-markdown.js (EXPORT_FORMAT),
//             content/cf-export-state.js (cfOnExportRecorded)
// Notes: docs/notes/content/cf-export-records.js.md

// details: { filename, mark } of the file just written by this build, in EXPORT_FORMAT. The file is on
// disk whether or not its record was written, and the state of the page's export button is read again.
async function markChatAsExported(chatId, details) {
  try {
    await recordExports([{ chatId, filename: details && details.filename, mark: details && details.mark, format: EXPORT_FORMAT }]);
  } catch (e) {
    console.log('[EXPORT] Failed to mark as exported:', e.message);
  }
  cfOnExportRecorded(chatId);
}

// One storage write for every chat found already on disk. An earlier export time is kept.
async function cfMarkChatsExported(chatIds) {
  if (!chatIds.length) return;
  try {
    const result = await chrome.storage.local.get(EXPORTED_CHATS_KEY);
    const exported = result[EXPORTED_CHATS_KEY] || {};
    const now = new Date().toISOString();
    chatIds.forEach(id => { exported[id] = exported[id] || now; });
    await chrome.storage.local.set({ [EXPORTED_CHATS_KEY]: exported });
  } catch (e) {
    console.log('[EXPORT] Failed to mark', chatIds.length, 'chats as exported:', e.message);
  }
}

// Chats missing from the account are recorded once and reported as their own outcome
async function cfMarkChatUnavailable(chatId, reason) {
  if (!chatId) return;
  try {
    const result = await chrome.storage.local.get('unavailableChats');
    const unavailable = result.unavailableChats || {};
    if (!unavailable[chatId]) {
      unavailable[chatId] = { reason: String(reason || 'unavailable'), since: new Date().toISOString() };
      await chrome.storage.local.set({ unavailableChats: unavailable });
    }
  } catch (e) {
    console.log('[EXPORT] Could not record an unavailable chat:', e.message);
  }
}

async function cfLoadUnavailableChats() {
  try {
    const result = await chrome.storage.local.get('unavailableChats');
    return result.unavailableChats || {};
  } catch (e) {
    return {};
  }
}
