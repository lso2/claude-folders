// content/cf-run-state.js
// Records the progress and the result of this tab's sync or export run for the popup and the organizer.
// Globals: CF_RUN_WRITE_MS, cfRunState, cfRunStateTimer, cfWriteRunState, cfRunStart, cfRunProgress, cfRunFinish
// Depends on: lib/storage-keys.js (RUN_STATE_KEY)
// Notes: docs/notes/content/cf-run-state.js.md

// Progress is stored at most this often. The start and the result are stored at once.
const CF_RUN_WRITE_MS = 300;
let cfRunState = null;
let cfRunStateTimer = null;

function cfWriteRunState() {
  clearTimeout(cfRunStateTimer);
  cfRunStateTimer = null;
  if (!cfRunState) return;
  chrome.storage.local.set({ [RUN_STATE_KEY]: { ...cfRunState, at: Date.now() } })
    .catch(e => console.log('[RUN] The run state was not stored:', e.message));
}

// run: 'sync', 'export' or 'import' (content/cf-import-controls.js)
function cfRunStart(run, text) {
  cfRunState = { run, text, done: false, lines: [], files: [], error: null, startedAt: Date.now() };
  cfWriteRunState();
}

function cfRunProgress(text) {
  if (!cfRunState || cfRunState.done) return;
  cfRunState.text = text;
  if (!cfRunStateTimer) cfRunStateTimer = setTimeout(cfWriteRunState, CF_RUN_WRITE_MS);
}

// lines: the result as sentences. files: the export files this run wrote. error: why the run stopped.
function cfRunFinish(lines, files, error) {
  if (!cfRunState) return;
  cfRunState = { ...cfRunState, done: true, text: error ? 'Stopped' : 'Finished', lines: lines || [], files: files || [], error: error || null };
  cfWriteRunState();
}
