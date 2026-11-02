// lib/activity-log.js
// Adds entries to the activity log the settings page's Log tab shows, one write at a time.
// Loaded by the service worker (CF_BACKGROUND_FILES in background.js).
// Globals: cfActivityLogQueue, cfReadActivityLogIndex, cfLogActivity
// Depends on: lib/storage-keys.js (ACTIVITY_LOG_KEY, ACTIVITY_LOG_CHUNK_PREFIX, ACTIVITY_LOG_CHUNK, ACTIVITY_LOG_MAX)
// Notes: docs/notes/lib/activity-log.js.md

// Each write waits for the one before it. Two writes at once would read the same chunk and drop an entry.
let cfActivityLogQueue = Promise.resolve();

// A log written before the chunks is the entry list itself under ACTIVITY_LOG_KEY, and is written out as chunks here
async function cfReadActivityLogIndex() {
  const stored = await chrome.storage.local.get(ACTIVITY_LOG_KEY);
  const index = stored[ACTIVITY_LOG_KEY];
  if (index && Array.isArray(index.chunks)) return index;
  const list = Array.isArray(index) ? index.slice(-ACTIVITY_LOG_MAX) : [];
  const writes = {};
  const chunks = [];
  for (let i = 0; i < list.length; i += ACTIVITY_LOG_CHUNK) {
    writes[ACTIVITY_LOG_CHUNK_PREFIX + chunks.length] = list.slice(i, i + ACTIVITY_LOG_CHUNK);
    chunks.push(chunks.length);
  }
  writes[ACTIVITY_LOG_KEY] = { chunks };
  await chrome.storage.local.set(writes);
  return { chunks };
}

// kind: a short label such as Sync, Settings, Folders or Extension. text: what happened.
function cfLogActivity(kind, text) {
  cfActivityLogQueue = cfActivityLogQueue.then(async () => {
    const entry = { at: Date.now(), kind: String(kind), text: String(text) };
    const index = await cfReadActivityLogIndex();
    const last = index.chunks[index.chunks.length - 1];
    if (last !== undefined) {
      const key = ACTIVITY_LOG_CHUNK_PREFIX + last;
      const stored = await chrome.storage.local.get(key);
      const chunk = Array.isArray(stored[key]) ? stored[key] : [];
      if (chunk.length < ACTIVITY_LOG_CHUNK) {
        chunk.push(entry);
        await chrome.storage.local.set({ [key]: chunk });
        return;
      }
    }
    // The newest chunk is full: the entry starts the next one, and the oldest chunks past ACTIVITY_LOG_MAX are removed
    const number = last === undefined ? 0 : last + 1;
    const chunks = [...index.chunks, number];
    const dropped = chunks.splice(0, Math.max(0, chunks.length - ACTIVITY_LOG_MAX / ACTIVITY_LOG_CHUNK));
    await chrome.storage.local.set({ [ACTIVITY_LOG_CHUNK_PREFIX + number]: [entry], [ACTIVITY_LOG_KEY]: { chunks } });
    if (dropped.length) await chrome.storage.local.remove(dropped.map(n => ACTIVITY_LOG_CHUNK_PREFIX + n));
  }).catch(e => console.log('[LOG] Entry not written:', e.message));
  return cfActivityLogQueue;
}
