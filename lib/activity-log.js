// lib/activity-log.js
// Adds entries to the activity log the settings page's Log tab shows, one write at a time.
// Loaded by the service worker (CF_BACKGROUND_FILES in background.js).
// Globals: cfActivityLogQueue, cfCountActivityKinds, cfReadActivityLogIndex, cfLogActivity
// Depends on: lib/storage-keys.js (ACTIVITY_LOG_KEY, ACTIVITY_LOG_CHUNK_PREFIX, ACTIVITY_LOG_CHUNK, ACTIVITY_LOG_MAX),
//             lib/activity-kinds.js (cfActivityKindOf)
// Notes: docs/notes/lib/activity-log.js.md

// Each write waits for the one before it. Two writes at once would read the same chunk and drop an entry.
let cfActivityLogQueue = Promise.resolve();

// { kind: number of entries } of one chunk
function cfCountActivityKinds(entries) {
  const counts = {};
  entries.forEach(entry => { counts[entry.kind] = (counts[entry.kind] || 0) + 1; });
  return counts;
}

// The index is { chunks, kinds: { chunk number: { kind: count } } }. A log from before the kind counts is read once,
// its entries get today's kinds (cfActivityKindOf) and are written back with the counts. A log from before the chunks
// is the entry list itself under ACTIVITY_LOG_KEY, and is written out as chunks here.
async function cfReadActivityLogIndex() {
  const stored = await chrome.storage.local.get(ACTIVITY_LOG_KEY);
  const index = stored[ACTIVITY_LOG_KEY];
  if (index && Array.isArray(index.chunks) && index.kinds) return index;
  let parts = [];
  if (Array.isArray(index)) {
    const list = index.slice(-ACTIVITY_LOG_MAX);
    for (let i = 0; i < list.length; i += ACTIVITY_LOG_CHUNK) parts.push(list.slice(i, i + ACTIVITY_LOG_CHUNK));
  } else if (index && Array.isArray(index.chunks) && index.chunks.length) {
    const keys = index.chunks.map(n => ACTIVITY_LOG_CHUNK_PREFIX + n);
    const read = await chrome.storage.local.get(keys);
    parts = keys.map(key => read[key] || []);
  }
  const fresh = { chunks: [], kinds: {} };
  const writes = {};
  parts.forEach((part, n) => {
    const entries = part.map(entry => ({ ...entry, kind: cfActivityKindOf(entry) }));
    writes[ACTIVITY_LOG_CHUNK_PREFIX + n] = entries;
    fresh.chunks.push(n);
    fresh.kinds[n] = cfCountActivityKinds(entries);
  });
  writes[ACTIVITY_LOG_KEY] = fresh;
  // Chunk numbers start again at 0, and keys past the new count are removed
  const old = index && Array.isArray(index.chunks) ? index.chunks.filter(n => n >= parts.length) : [];
  await chrome.storage.local.set(writes);
  if (old.length) await chrome.storage.local.remove(old.map(n => ACTIVITY_LOG_CHUNK_PREFIX + n));
  return fresh;
}

// kind: a category such as Sync, Exports, Colors or Extension (lib/activity-watch.js). text: what happened.
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
        const counts = index.kinds[last] || {};
        counts[entry.kind] = (counts[entry.kind] || 0) + 1;
        index.kinds[last] = counts;
        await chrome.storage.local.set({ [key]: chunk, [ACTIVITY_LOG_KEY]: index });
        return;
      }
    }
    // The newest chunk is full: the entry starts the next one, and the oldest chunks past ACTIVITY_LOG_MAX are removed
    const number = last === undefined ? 0 : last + 1;
    const chunks = [...index.chunks, number];
    const dropped = chunks.splice(0, Math.max(0, chunks.length - ACTIVITY_LOG_MAX / ACTIVITY_LOG_CHUNK));
    const kinds = { ...index.kinds, [number]: { [entry.kind]: 1 } };
    dropped.forEach(n => delete kinds[n]);
    await chrome.storage.local.set({ [ACTIVITY_LOG_CHUNK_PREFIX + number]: [entry], [ACTIVITY_LOG_KEY]: { chunks, kinds } });
    if (dropped.length) await chrome.storage.local.remove(dropped.map(n => ACTIVITY_LOG_CHUNK_PREFIX + n));
  }).catch(e => console.log('[LOG] Entry not written:', e.message));
  return cfActivityLogQueue;
}

// A log from before the kind counts gets them when the service worker starts, ahead of the Log tab reading it
cfActivityLogQueue = cfActivityLogQueue.then(cfReadActivityLogIndex).catch(e => console.log('[LOG] Log not read:', e.message));
