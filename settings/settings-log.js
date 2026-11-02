// settings/settings-log.js
// The Log tab: the activity log the service worker writes (lib/activity-log.js), newest first, with Clear log.
// Globals: settingsLogShown, renderSettingsLog, onSettingsLogOlder, onSettingsLogClear
// Depends on: lib/storage-keys.js (ACTIVITY_LOG_KEY, ACTIVITY_LOG_CHUNK_PREFIX, ACTIVITY_LOG_CHUNK, ACTIVITY_LOG_MAX),
//             settings/settings-format.js (settingsTime)
// Notes: docs/notes/settings/settings-log.js.md

// Entries shown, newest first. Show 500 older adds one chunk.
let settingsLogShown = ACTIVITY_LOG_CHUNK;

// Reads the newest chunks that cover settingsLogShown entries. Returns { entries (oldest first), total }.
async function readSettingsLog() {
  const stored = await chrome.storage.local.get(ACTIVITY_LOG_KEY);
  const index = stored[ACTIVITY_LOG_KEY];
  // A log from before the chunks, until the service worker writes its next entry
  if (Array.isArray(index)) return { entries: index, total: index.length };
  if (!index || !Array.isArray(index.chunks) || !index.chunks.length) return { entries: [], total: 0 };
  const read = index.chunks.slice(-(Math.ceil(settingsLogShown / ACTIVITY_LOG_CHUNK) + 1));
  const chunks = await chrome.storage.local.get(read.map(n => ACTIVITY_LOG_CHUNK_PREFIX + n));
  const entries = read.flatMap(n => chunks[ACTIVITY_LOG_CHUNK_PREFIX + n] || []);
  const newest = chunks[ACTIVITY_LOG_CHUNK_PREFIX + read[read.length - 1]] || [];
  // Every chunk but the newest is full
  return { entries, total: (index.chunks.length - 1) * ACTIVITY_LOG_CHUNK + newest.length };
}

async function renderSettingsLog() {
  const list = document.getElementById('logList');
  const count = document.getElementById('logCount');
  let log;
  try {
    log = await readSettingsLog();
  } catch (e) {
    count.textContent = `The log was not read: ${e.message}`;
    return;
  }
  const shown = log.entries.slice(-settingsLogShown).reverse();
  count.textContent = `${log.total.toLocaleString()} entr${log.total === 1 ? 'y' : 'ies'} of ${ACTIVITY_LOG_MAX.toLocaleString()}`;
  document.getElementById('logOlderWrap').hidden = log.total <= shown.length;
  if (!shown.length) {
    const empty = document.createElement('li');
    empty.className = 'settings-log-empty';
    empty.textContent = 'No entries yet.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...shown.map(entry => {
    const li = document.createElement('li');
    li.className = 'settings-log-entry';
    const time = document.createElement('span');
    time.className = 'settings-log-time';
    time.textContent = settingsTime(entry.at);
    const kind = document.createElement('span');
    kind.className = 'settings-log-kind';
    kind.textContent = entry.kind;
    const text = document.createElement('span');
    text.className = 'settings-log-text';
    text.textContent = entry.text;
    li.append(time, kind, text);
    return li;
  }));
}

function onSettingsLogOlder() {
  settingsLogShown += ACTIVITY_LOG_CHUNK;
  renderSettingsLog();
}

// Removes the index and every chunk key, chunks of an index another write replaced included
async function onSettingsLogClear() {
  try {
    const keys = await chrome.storage.local.getKeys();
    await chrome.storage.local.remove(keys.filter(key => key === ACTIVITY_LOG_KEY || key.startsWith(ACTIVITY_LOG_CHUNK_PREFIX)));
    settingsLogShown = ACTIVITY_LOG_CHUNK;
  } catch (e) {
    document.getElementById('logCount').textContent = `The log was not cleared: ${e.message}`;
  }
}

document.getElementById('logOlder').addEventListener('click', onSettingsLogOlder);
document.getElementById('logClear').addEventListener('click', onSettingsLogClear);
// New entries appear while the tab is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (Object.keys(changes).some(key => key === ACTIVITY_LOG_KEY || key.startsWith(ACTIVITY_LOG_CHUNK_PREFIX))) renderSettingsLog();
});
renderSettingsLog();
