// content/cf-import-controls.js
// The import run's Pause, Resume and Stop on the progress bar.
// Globals: CF_IMPORT_STOP_KEY, CF_IMPORT_PAUSE_KEY, cfImportStopRequested, cfImportPauseRequested, cfImportProgress,
//          cfPauseImport, cfImportPausedText, cfShowImportPaused, cfResumePausedImport, cfStopPausedImport
// Depends on: content/cf-notify.js (showSyncProgressBar, hideSyncProgressBar), content/cf-import-record.js
//             (cfImportRunNote), content/cf-monitor.js (syncInProgress), content/cf-import.js (cfLoadImportQueue,
//             cfSaveImportQueue, cfImportOwnerToken, cfRunImportStep, cfFinishImportRun)
// Notes: docs/notes/content/cf-import-controls.js.md

// Set in the run's tab by the Stop button. The run ends after the chat in progress.
const CF_IMPORT_STOP_KEY = 'cf-import-stop';
// Set in the run's tab by the Pause button. The run pauses after the chat in progress, before the next one is sent.
const CF_IMPORT_PAUSE_KEY = 'cf-import-pause';

function cfImportStopRequested() {
  return sessionStorage.getItem(CF_IMPORT_STOP_KEY) === '1';
}

function cfImportPauseRequested() {
  return sessionStorage.getItem(CF_IMPORT_PAUSE_KEY) === '1';
}

// While a chat is in progress the bar has Pause and Stop. Both take effect after that chat.
function cfImportProgress(text) {
  cfImportRunNote(text);
  if (cfImportStopRequested()) {
    showSyncProgressBar(`${text}. Stopping after this one.`);
    return;
  }
  const stop = { key: 'stop', label: 'Stop', onClick: () => {
    sessionStorage.setItem(CF_IMPORT_STOP_KEY, '1');
    console.log('[IMPORT] Stop requested');
    cfImportProgress(text);
  } };
  if (cfImportPauseRequested()) {
    showSyncProgressBar(`${text}. Pausing after this one.`, [stop]);
    return;
  }
  const pause = { key: 'pause', label: 'Pause', onClick: () => {
    sessionStorage.setItem(CF_IMPORT_PAUSE_KEY, '1');
    console.log('[IMPORT] Pause requested');
    cfImportProgress(text);
  } };
  showSyncProgressBar(text, [pause, stop]);
}

// reason: 'request' after the Pause button, 'batch' at the end of a batch of the size chosen in the import dialog
async function cfPauseImport(queue, reason) {
  sessionStorage.removeItem(CF_IMPORT_PAUSE_KEY);
  queue.paused = reason;
  await cfSaveImportQueue(queue);
  console.log('[IMPORT] Paused after', queue.index, 'of', queue.items.length, reason === 'batch' ? 'at the end of a batch' : 'after Pause was clicked');
  cfShowImportPaused(queue);
}

function cfImportPausedText(queue) {
  const done = `${queue.index} of ${queue.items.length}`;
  if (queue.paused !== 'batch') return `Paused after ${done}`;
  return `Paused after batch ${queue.index / queue.batchSize} of ${Math.ceil(queue.items.length / queue.batchSize)} (${done})`;
}

// The run is paused until Resume or Stop is clicked. After a reload of this tab, cfResumeImport shows this bar again.
function cfShowImportPaused(queue) {
  syncInProgress = true;
  const text = cfImportPausedText(queue);
  cfImportRunNote(`${text}. Resume or Stop is on the progress bar in the claude.ai tab.`);
  showSyncProgressBar(text, [
    { key: 'resume', label: 'Resume', onClick: () => cfResumePausedImport().catch(e => console.log('[IMPORT] Resume failed:', e.message)) },
    { key: 'stop', label: 'Stop', onClick: () => cfStopPausedImport().catch(e => console.log('[IMPORT] Stop failed:', e.message)) }
  ], true);
}

// The next chat is started on /new
async function cfResumePausedImport() {
  const queue = await cfLoadImportQueue();
  if (!queue || queue.owner !== cfImportOwnerToken(false) || !queue.paused) {
    console.log('[IMPORT] This tab has no paused import run to resume');
    hideSyncProgressBar();
    return;
  }
  queue.paused = null;
  await cfSaveImportQueue(queue);
  console.log('[IMPORT] Resumed at', queue.index + 1, 'of', queue.items.length);
  if (window.location.pathname === '/new') await cfRunImportStep(queue);
  else window.location.assign('/new');
}

async function cfStopPausedImport() {
  const queue = await cfLoadImportQueue();
  if (!queue || queue.owner !== cfImportOwnerToken(false)) {
    console.log('[IMPORT] This tab has no import run to stop');
    hideSyncProgressBar();
    return;
  }
  sessionStorage.setItem(CF_IMPORT_STOP_KEY, '1');
  console.log('[IMPORT] Stopped while paused');
  await cfFinishImportRun(queue);
}
