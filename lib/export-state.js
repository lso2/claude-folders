// lib/export-state.js
// Records which file each export was written to and what state the conversation was in then.
// Loaded by the content scripts, the organizer and the access window. The offscreen writer has no chrome.storage.
// Globals: recordExports, loadExportRecord, loadExportRecords, rememberExportFile
// Depends on: lib/storage-keys.js (EXPORTED_CHATS_KEY, EXPORT_STATE_KEY)
// Notes: docs/notes/lib/export-state.js.md

// entries: [{ chatId, filename, mark, format }]. The mark is a chat's current leaf message id or a
// Cowork session's newest turn event number. format is the EXPORT_FORMAT the file was written in
// (lib/chat-markdown.js). An entry without a filename stamps the time only.
async function recordExports(entries) {
  const list = (entries || []).filter(entry => entry && entry.chatId);
  if (!list.length) return;
  const stored = await chrome.storage.local.get([EXPORTED_CHATS_KEY, EXPORT_STATE_KEY]);
  const times = stored[EXPORTED_CHATS_KEY] || {};
  const state = stored[EXPORT_STATE_KEY] || {};
  const now = new Date().toISOString();
  for (const entry of list) {
    times[entry.chatId] = now;
    if (entry.filename) state[entry.chatId] = { filename: entry.filename, mark: entry.mark || null, format: entry.format || null, exportedAt: now };
  }
  await chrome.storage.local.set({ [EXPORTED_CHATS_KEY]: times, [EXPORT_STATE_KEY]: state });
}

// The record for one conversation, or null. An export stamped with its time only has no
// filename and no mark.
async function loadExportRecord(chatId) {
  const stored = await chrome.storage.local.get([EXPORTED_CHATS_KEY, EXPORT_STATE_KEY]);
  const record = (stored[EXPORT_STATE_KEY] || {})[chatId];
  if (record) return record;
  const time = (stored[EXPORTED_CHATS_KEY] || {})[chatId];
  return time ? { filename: null, mark: null, exportedAt: time } : null;
}

// Every conversation's record by chat id, read once for a whole export run
async function loadExportRecords() {
  const stored = await chrome.storage.local.get(EXPORT_STATE_KEY);
  return stored[EXPORT_STATE_KEY] || {};
}

// Adds the name of a file found on disk to a conversation whose record has no file name.
// The record's time stays, and it gets no mark.
async function rememberExportFile(chatId, filename) {
  const stored = await chrome.storage.local.get([EXPORTED_CHATS_KEY, EXPORT_STATE_KEY]);
  const state = stored[EXPORT_STATE_KEY] || {};
  if (state[chatId] && state[chatId].filename) return;
  state[chatId] = { filename, mark: null, format: null, exportedAt: (stored[EXPORTED_CHATS_KEY] || {})[chatId] || null };
  await chrome.storage.local.set({ [EXPORT_STATE_KEY]: state });
}
