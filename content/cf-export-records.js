// content/cf-export-records.js
// Records each chat's export outcome in extension storage.
// Globals: markChatAsExported, cfMarkChatsExported, cfMarkChatUnavailable, cfLoadUnavailableChats
// Depends on: lib/storage-keys.js (EXPORTED_CHATS_KEY)
// Notes: docs/notes/content/cf-export-records.js.md

async function markChatAsExported(chatId) {
  try {
    const result = await chrome.storage.local.get(EXPORTED_CHATS_KEY);
    const exported = result[EXPORTED_CHATS_KEY] || {};
    exported[chatId] = new Date().toISOString();
    await chrome.storage.local.set({ [EXPORTED_CHATS_KEY]: exported });
  } catch (e) {
    console.log('[EXPORT] Failed to mark as exported:', e.message);
  }
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
