// content/cf-sync-control.js
// Pause, Resume, Stop and Start of this tab's sync on its progress bar, and the × that hides the bar.
// Globals: cfSyncControl, cfSyncControlReset, cfSyncWaitIfPaused, cfSyncStopRequested, cfSyncPause, cfSyncResume,
//          cfSyncStop, cfSyncHideBar, cfSyncCloseButton, cfShowSyncBar, cfShowSyncStopped
// Depends on: content/cf-notify.js (showSyncProgressBar, hideSyncProgressBar), content/cf-run-state.js (cfRunProgress),
//             content/cf-sync.js (scrapeRecentsPage)
// Notes: docs/notes/content/cf-sync-control.js.md

// paused and stopped take effect before the next chat is exported. waiting is true while the export loop
// waits on Resume. hidden is set by the bar's ×, and the bar stays hidden until the next sync.
let cfSyncControl = { paused: false, stopped: false, waiting: false, hidden: false, text: '', release: null };

function cfSyncControlReset() {
  cfSyncControl = { paused: false, stopped: false, waiting: false, hidden: false, text: '', release: null };
}

// Called before each chat of the sync's export: resolves at once, or on Resume or Stop while paused
function cfSyncWaitIfPaused() {
  if (!cfSyncControl.paused || cfSyncControl.stopped) return Promise.resolve();
  cfSyncControl.waiting = true;
  cfShowSyncBar();
  cfRunProgress(`Paused: ${cfSyncControl.text}`);
  return new Promise(resolve => {
    cfSyncControl.release = () => {
      cfSyncControl.waiting = false;
      cfSyncControl.release = null;
      resolve();
    };
  });
}

function cfSyncStopRequested() {
  return cfSyncControl.stopped;
}

function cfSyncPause() {
  cfSyncControl.paused = true;
  console.log('[SCRAPER] Pause requested');
  cfShowSyncBar();
}

function cfSyncResume() {
  cfSyncControl.paused = false;
  console.log('[SCRAPER] Resumed');
  if (cfSyncControl.release) cfSyncControl.release();
  cfShowSyncBar();
}

function cfSyncStop() {
  cfSyncControl.stopped = true;
  cfSyncControl.paused = false;
  console.log('[SCRAPER] Stop requested');
  if (cfSyncControl.release) cfSyncControl.release();
  cfShowSyncBar();
}

// The sync keeps running with the bar hidden, and the popup and the organizer show its progress
function cfSyncHideBar() {
  cfSyncControl.hidden = true;
  hideSyncProgressBar();
}

function cfSyncCloseButton() {
  return { key: 'close', label: '×', title: 'Hide this bar. The sync keeps running, and the popup and the organizer show its progress.', onClick: cfSyncHideBar };
}

// text: the sync's latest progress, kept for redrawing the bar after a click
function cfShowSyncBar(text) {
  const c = cfSyncControl;
  if (text !== undefined) c.text = text;
  if (c.hidden) return;
  const pause = { key: 'pause', label: 'Pause', onClick: cfSyncPause };
  const resume = { key: 'resume', label: 'Resume', onClick: cfSyncResume };
  const stop = { key: 'stop', label: 'Stop', onClick: cfSyncStop };
  if (c.stopped) showSyncProgressBar(`${c.text}. Stopping before the next chat.`, [cfSyncCloseButton()]);
  else if (c.waiting) showSyncProgressBar(`Paused: ${c.text}`, [resume, stop, cfSyncCloseButton()], true);
  else if (c.paused) showSyncProgressBar(`${c.text}. Pausing before the next chat.`, [resume, stop, cfSyncCloseButton()]);
  else showSyncProgressBar(c.text, [pause, stop, cfSyncCloseButton()]);
}

// After Stop the bar stays with the counts so far, Start for a new sync and ×. A bar hidden with × stays hidden.
function cfShowSyncStopped(text) {
  if (cfSyncControl.hidden) return;
  const start = { key: 'start', label: 'Start', onClick: () => scrapeRecentsPage() };
  showSyncProgressBar(text, [start, cfSyncCloseButton()], 'stopped');
}
