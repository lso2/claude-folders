// organizer/run-pane.js
// Shows the claude.ai tab's sync, folder export or account import in the organizer.
// Globals: ORGANIZER_RUN_FRESH_MS, organizerRunWatching, organizerRunDone, renderOrganizerRun
// Depends on: lib/storage-keys.js (RUN_STATE_KEY), lib/run-failures.js (cfRenderRunLines), organizer/app.js (loadAllData)
// Notes: docs/notes/organizer/run-pane.js.md

// An unfinished run record younger than this is shown as running when the page opens
const ORGANIZER_RUN_FRESH_MS = 2 * 60 * 1000;
// True while the pane follows a run started here, or one running while the page is open
let organizerRunWatching = false;
// True while the pane shows a finished run, which a click outside the pane closes
let organizerRunDone = false;

// state: the run record content/cf-run-state.js stores, or null while the start is being sent
function renderOrganizerRun(state, startingText) {
  const pane = document.getElementById('runPane');
  const title = document.getElementById('runPaneTitle');
  const text = document.getElementById('runPaneText');
  const list = document.getElementById('runPaneLines');
  pane.hidden = false;
  list.innerHTML = '';
  organizerRunDone = !!(state && state.done);
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
  cfRenderRunLines(list, state.lines, state.failures);
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[RUN_STATE_KEY] || !changes[RUN_STATE_KEY].newValue) return;
  const state = changes[RUN_STATE_KEY].newValue;
  if (!organizerRunWatching && state.done) return;
  organizerRunWatching = !state.done;
  document.getElementById('syncBtn').disabled = !state.done;
  renderOrganizerRun(state);
  if (state.done && (state.run === 'sync' || state.run === 'import')) loadAllData();
});

document.addEventListener('DOMContentLoaded', async () => {
  document.getElementById('runPaneClose')?.addEventListener('click', () => { document.getElementById('runPane').hidden = true; });
  // A click that starts a run renders the pane as running first, so the same click leaves it open
  document.addEventListener('click', (e) => {
    const pane = document.getElementById('runPane');
    if (!pane || pane.hidden || !organizerRunDone || pane.contains(e.target)) return;
    pane.hidden = true;
  });
  const state = (await chrome.storage.local.get(RUN_STATE_KEY))[RUN_STATE_KEY] || null;
  if (state && !state.done && Date.now() - state.at < ORGANIZER_RUN_FRESH_MS) {
    organizerRunWatching = true;
    renderOrganizerRun(state);
  }
});
