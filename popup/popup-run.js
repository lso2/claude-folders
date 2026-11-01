// popup/popup-run.js
// Starts the sync from the popup's Sync button and shows the run's progress and result in the popup.
// Globals: POPUP_RUN_FRESH_MS, popupRunWatching, renderPopupRun, renderLastSync, startPopupSync
// Depends on: lib/storage-keys.js (RUN_STATE_KEY), popup/popup.js (loadData), background.js (startAutoScrape)
// Notes: docs/notes/popup/popup-run.js.md

// An unfinished run record younger than this is shown as running when the popup opens
const POPUP_RUN_FRESH_MS = 2 * 60 * 1000;
// True while the pane follows a run: one started here, or one running in a claude.ai tab while the popup is open
let popupRunWatching = false;

// state: the run record content/cf-run-state.js stores, or null while the start is being sent
function renderPopupRun(state, startingText) {
  const pane = document.getElementById('runPane');
  const title = document.getElementById('runPaneTitle');
  const text = document.getElementById('runPaneText');
  const list = document.getElementById('runPaneLines');
  pane.classList.remove('hidden');
  list.innerHTML = '';
  if (!state) {
    pane.classList.remove('error');
    title.textContent = 'Sync';
    text.textContent = startingText;
    return;
  }
  const kind = { export: 'Export', import: 'Import' }[state.run] || 'Sync';
  pane.classList.toggle('error', !!state.error);
  if (!state.done) {
    title.textContent = `${kind} running in the claude.ai tab`;
    text.textContent = state.text;
    return;
  }
  title.textContent = state.error ? `${kind} did not finish` : `${kind} finished`;
  text.textContent = state.error || '';
  (state.lines || []).forEach(line => {
    const li = document.createElement('li');
    li.textContent = line;
    list.appendChild(li);
  });
}

function renderLastSync(state) {
  const el = document.getElementById('lastSyncText');
  if (!el) return;
  el.textContent = state && state.run === 'sync' && state.done && !state.error ? `Last sync ${new Date(state.at).toLocaleString()}` : '';
}

// The sync runs in a claude.ai tab (lib/claude-tab.js). Its record arrives through storage.onChanged below.
async function startPopupSync() {
  const btn = document.getElementById('syncBtn');
  btn.disabled = true;
  popupRunWatching = true;
  renderPopupRun(null, 'Starting the sync in the claude.ai tab...');
  let answer = null;
  try {
    answer = await chrome.runtime.sendMessage({ action: 'startAutoScrape' });
  } catch (e) {
    answer = { success: false, error: e.message };
  }
  if (!answer || !answer.success) {
    popupRunWatching = false;
    btn.disabled = false;
    renderPopupRun({ run: 'sync', done: true, lines: [], error: 'The sync did not start: ' + ((answer && answer.error) || 'the background answered nothing') });
  }
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[RUN_STATE_KEY] || !changes[RUN_STATE_KEY].newValue) return;
  const state = changes[RUN_STATE_KEY].newValue;
  if (!popupRunWatching && state.done) {
    renderLastSync(state);
    return;
  }
  popupRunWatching = !state.done;
  document.getElementById('syncBtn').disabled = !state.done;
  renderPopupRun(state);
  if (state.done) {
    renderLastSync(state);
    loadData();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('syncBtn')?.addEventListener('click', startPopupSync);
  document.getElementById('runPaneClose')?.addEventListener('click', () => document.getElementById('runPane').classList.add('hidden'));
  const state = (await chrome.storage.local.get(RUN_STATE_KEY))[RUN_STATE_KEY] || null;
  renderLastSync(state);
  if (state && !state.done && Date.now() - state.at < POPUP_RUN_FRESH_MS) {
    popupRunWatching = true;
    document.getElementById('syncBtn').disabled = true;
    renderPopupRun(state);
  }
});
