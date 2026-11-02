// settings/settings-log.js
// The Log tab: the activity log the service worker writes (lib/activity-log.js), newest first, a page at a time, by kind.
// Globals: settingsLogPage, settingsLogPageSize, settingsLogKinds, readSettingsLogPage, renderSettingsLogChips,
//          renderSettingsLog, renderSettingsLogSizes, onSettingsLogPageSize, showSettingsLogPage, onSettingsLogClear
// Depends on: lib/storage-keys.js (ACTIVITY_LOG_KEY, ACTIVITY_LOG_CHUNK_PREFIX, ACTIVITY_LOG_CHUNK, ACTIVITY_LOG_MAX,
//             LOG_PAGE_SIZE_KEY, LOG_PAGE_SIZES, LOG_PAGE_SIZE_DEFAULT), settings/settings-format.js (settingsTime),
//             settings/settings-chips.js (#settingsChips, updateSettingsChipArrows)
// Notes: docs/notes/settings/settings-log.js.md

// Page 0 holds the newest entries
let settingsLogPage = 0;
let settingsLogPageSize = LOG_PAGE_SIZE_DEFAULT;
// The kinds the chips selected. Empty shows every kind (All).
const settingsLogKinds = new Set();

// Reads one page of size entries (a number or 'all') of the kinds selected.
// Returns { entries (newest first), total (of the kinds selected), all (every entry), kinds: { kind: count } }.
async function readSettingsLogPage(size, page) {
  const stored = await chrome.storage.local.get(ACTIVITY_LOG_KEY);
  const index = stored[ACTIVITY_LOG_KEY];
  const shown = entry => !settingsLogKinds.size || settingsLogKinds.has(entry.kind);
  const kinds = {};
  // A log from before the chunks, until the service worker writes it out as chunks
  if (Array.isArray(index)) {
    index.forEach(entry => { kinds[entry.kind] = (kinds[entry.kind] || 0) + 1; });
    const list = index.filter(shown).reverse();
    const count = size === 'all' ? list.length : size;
    return { entries: list.slice(page * count, page * count + count), total: list.length, all: index.length, kinds };
  }
  const chunks = index && Array.isArray(index.chunks) ? index.chunks : [];
  let counts = index && index.kinds;
  // A log from before the kind counts, until the service worker adds them
  if (!counts) {
    const read = await chrome.storage.local.get(chunks.map(n => ACTIVITY_LOG_CHUNK_PREFIX + n));
    counts = {};
    chunks.forEach(n => {
      counts[n] = {};
      (read[ACTIVITY_LOG_CHUNK_PREFIX + n] || []).forEach(entry => { counts[n][entry.kind] = (counts[n][entry.kind] || 0) + 1; });
    });
  }
  let all = 0;
  const shownIn = {};
  chunks.forEach(n => {
    shownIn[n] = 0;
    Object.entries(counts[n] || {}).forEach(([kind, count]) => {
      kinds[kind] = (kinds[kind] || 0) + count;
      all += count;
      if (!settingsLogKinds.size || settingsLogKinds.has(kind)) shownIn[n] += count;
    });
  });
  const total = chunks.reduce((sum, n) => sum + shownIn[n], 0);
  const count = size === 'all' ? total : size;
  const from = page * count;
  const to = from + count;
  // Walks the chunks from the newest and reads only those holding entries of this page
  const parts = [];
  let before = 0;
  for (const n of chunks.slice().reverse()) {
    if (before >= to) break;
    if (shownIn[n] && before + shownIn[n] > from) parts.push({ n, start: Math.max(0, from - before), end: Math.min(shownIn[n], to - before) });
    before += shownIn[n];
  }
  const read = parts.length ? await chrome.storage.local.get(parts.map(part => ACTIVITY_LOG_CHUNK_PREFIX + part.n)) : {};
  const entries = parts.flatMap(part => (read[ACTIVITY_LOG_CHUNK_PREFIX + part.n] || []).filter(shown).reverse().slice(part.start, part.end));
  return { entries, total, all, kinds };
}

// All, then one chip per kind in the log with its count. A kind chip adds or removes its kind; All clears them.
// Drawn into the chips row of settings/settings-chips.js while the Log tab is open.
function renderSettingsLogChips(kinds, all) {
  if (document.querySelector('.settings-tab.active')?.dataset.tab !== 'log') return;
  const row = document.getElementById('settingsChips');
  const scroll = row.scrollLeft;
  const names = Object.keys(kinds).filter(kind => kinds[kind] > 0).sort((a, b) => a.localeCompare(b));
  [...settingsLogKinds].forEach(kind => { if (!names.includes(kind)) settingsLogKinds.delete(kind); });
  const chip = (label, count, kind) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-chip';
    const on = kind === null ? !settingsLogKinds.size : settingsLogKinds.has(kind);
    button.classList.toggle('active', on);
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
    const number = document.createElement('span');
    number.className = 'settings-chip-count';
    number.textContent = `(${count.toLocaleString()})`;
    button.append(`${label} `, number);
    button.addEventListener('click', () => {
      if (kind === null) settingsLogKinds.clear();
      else if (settingsLogKinds.has(kind)) settingsLogKinds.delete(kind);
      else settingsLogKinds.add(kind);
      settingsLogPage = 0;
      renderSettingsLog();
    });
    return button;
  };
  row.replaceChildren(chip('All', all, null), ...names.map(kind => chip(kind, kinds[kind], kind)));
  // A log of one kind has no row: All and its one chip would show the same entries
  document.getElementById('settingsChipsWrap').hidden = names.length < 2;
  row.scrollLeft = scroll;
  updateSettingsChipArrows();
}

async function renderSettingsLog() {
  const list = document.getElementById('logList');
  const count = document.getElementById('logCount');
  let log;
  try {
    log = await readSettingsLogPage(settingsLogPageSize, settingsLogPage);
    const perPage = settingsLogPageSize === 'all' ? Math.max(log.total, 1) : settingsLogPageSize;
    const pages = Math.max(1, Math.ceil(log.total / perPage));
    // A cleared or shorter log leaves the page past the end
    if (settingsLogPage > pages - 1) {
      settingsLogPage = pages - 1;
      log = await readSettingsLogPage(settingsLogPageSize, settingsLogPage);
    }
    renderSettingsLogChips(log.kinds, log.all);
    count.textContent = settingsLogKinds.size
      ? `${log.total.toLocaleString()} of ${log.all.toLocaleString()} entries`
      : `${log.all.toLocaleString()} entr${log.all === 1 ? 'y' : 'ies'} of ${ACTIVITY_LOG_MAX.toLocaleString()}`;
    document.getElementById('logPager').hidden = pages < 2;
    document.getElementById('logPage').textContent = `Page ${(settingsLogPage + 1).toLocaleString()} of ${pages.toLocaleString()}`;
    document.getElementById('logNewest').disabled = settingsLogPage === 0;
    document.getElementById('logNewer').disabled = settingsLogPage === 0;
    document.getElementById('logOlder').disabled = settingsLogPage === pages - 1;
    document.getElementById('logOldest').disabled = settingsLogPage === pages - 1;
  } catch (e) {
    count.textContent = `The log was not read: ${e.message}`;
    return;
  }
  if (!log.entries.length) {
    const empty = document.createElement('li');
    empty.className = 'settings-log-empty';
    empty.textContent = 'No entries yet.';
    list.replaceChildren(empty);
    return;
  }
  list.replaceChildren(...log.entries.map(entry => {
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

// Fills Per page and selects the stored size
async function renderSettingsLogSizes() {
  const select = document.getElementById('logPageSize');
  try {
    const stored = (await chrome.storage.local.get(LOG_PAGE_SIZE_KEY))[LOG_PAGE_SIZE_KEY];
    if (LOG_PAGE_SIZES.includes(stored)) settingsLogPageSize = stored;
  } catch (e) {
    console.log('[LOG] Page size not read:', e.message);
  }
  select.replaceChildren(...LOG_PAGE_SIZES.map(size => {
    const option = document.createElement('option');
    option.value = String(size);
    option.textContent = size === 'all' ? 'All' : size.toLocaleString();
    return option;
  }));
  select.value = String(settingsLogPageSize);
}

async function onSettingsLogPageSize() {
  const value = document.getElementById('logPageSize').value;
  settingsLogPageSize = value === 'all' ? 'all' : Number(value);
  settingsLogPage = 0;
  renderSettingsLog();
  try {
    await chrome.storage.local.set({ [LOG_PAGE_SIZE_KEY]: settingsLogPageSize });
  } catch (e) {
    console.log('[LOG] Page size not saved:', e.message);
  }
}

function showSettingsLogPage(page) {
  settingsLogPage = Math.max(0, page);
  renderSettingsLog();
}

// Removes the index and every chunk key, chunks of an index another write replaced included
async function onSettingsLogClear() {
  try {
    const keys = await chrome.storage.local.getKeys();
    await chrome.storage.local.remove(keys.filter(key => key === ACTIVITY_LOG_KEY || key.startsWith(ACTIVITY_LOG_CHUNK_PREFIX)));
    settingsLogPage = 0;
    settingsLogKinds.clear();
  } catch (e) {
    document.getElementById('logCount').textContent = `The log was not cleared: ${e.message}`;
  }
}

document.getElementById('logPageSize').addEventListener('change', onSettingsLogPageSize);
document.getElementById('logNewest').addEventListener('click', () => showSettingsLogPage(0));
document.getElementById('logNewer').addEventListener('click', () => showSettingsLogPage(settingsLogPage - 1));
document.getElementById('logOlder').addEventListener('click', () => showSettingsLogPage(settingsLogPage + 1));
// renderSettingsLog moves a page past the end back to the last page
document.getElementById('logOldest').addEventListener('click', () => showSettingsLogPage(Number.MAX_SAFE_INTEGER));
document.getElementById('logClear').addEventListener('click', onSettingsLogClear);
// New entries appear while the tab is open
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (Object.keys(changes).some(key => key === ACTIVITY_LOG_KEY || key.startsWith(ACTIVITY_LOG_CHUNK_PREFIX))) renderSettingsLog();
});
renderSettingsLogSizes().then(renderSettingsLog);
