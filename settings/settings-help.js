// settings/settings-help.js
// Reads the Help tab's content from settings/help.html, runs its buttons and fills its status lines.
// Globals: helpLoaded, loadHelpContent, helpScrollTo, runHelpAction, helpShowResult, renderHelpStatus
// Depends on: settings/settings-tabs.js (showSettingsTab), settings/settings-transfer.js (exportSettingsFile),
//             settings/settings-format.js (settingsTime, settingsShowResult), lib/storage-keys.js (RUN_STATE_KEY,
//             AUTO_SYNC_KEY, AUTO_SYNC_DEFAULT), background.js (checkWriteAccess, openFolderAccess, startAutoScrape,
//             openImportDialog, openOrganizer), settings/settings-auto-sync.js (autoSyncLabel),
//             settings/settings-chips.js (renderSettingsChips)
// Notes: docs/notes/settings/help.html.md

let helpLoaded = false;

// help.html is a file of this extension, read once into the Help tab
async function loadHelpContent() {
  if (helpLoaded) return;
  const panel = document.getElementById('helpContent');
  try {
    const res = await fetch('help.html');
    if (!res.ok) throw new Error(`help.html returned ${res.status}`);
    panel.innerHTML = await res.text();
    helpLoaded = true;
    // The chips of the Help tab are drawn again once its sections are in the page (settings/settings-chips.js)
    if (document.querySelector('.settings-tab.active')?.dataset.tab === 'help') renderSettingsChips('help');
    await renderHelpStatus();
  } catch (e) {
    panel.textContent = `The help was not read: ${e.message}`;
  }
}

function helpScrollTo(id) {
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function helpShowResult(id, text, isError) {
  const el = document.getElementById(id);
  if (el) settingsShowResult(el, text, isError);
}

async function runHelpAction(btn) {
  const action = btn.dataset.helpAction;
  try {
    if (action === 'jump') helpScrollTo(btn.dataset.target);
    if (action === 'tab') {
      showSettingsTab(btn.dataset.tab);
      helpScrollTo(btn.dataset.target);
    }
    if (action === 'access') await chrome.runtime.sendMessage({ action: 'openFolderAccess' });
    if (action === 'claude') await chrome.tabs.create({ url: 'https://claude.ai/new' });
    if (action === 'organizer') await chrome.runtime.sendMessage({ action: 'openOrganizer' });
    if (action === 'export-settings') await exportSettingsFile();
    if (action === 'sync') {
      const answer = await chrome.runtime.sendMessage({ action: 'startAutoScrape' });
      if (answer && answer.success) helpShowResult('helpSyncResult', 'The sync started in a claude.ai tab. The progress bar there and the popup show its progress.', false);
      else helpShowResult('helpSyncResult', 'The sync did not start: ' + ((answer && answer.error) || 'the background answered nothing'), true);
    }
    if (action === 'import-dialog') {
      const answer = await chrome.runtime.sendMessage({ action: 'openImportDialog', accountKey: null });
      if (!answer || !answer.success) helpShowResult('helpImportResult', 'The import dialog did not open: ' + ((answer && answer.error) || 'the background answered nothing'), true);
    }
  } catch (e) {
    console.log('[SETTINGS] Help button', action, 'failed:', e.message);
  }
}

// Each status line reads the state it names: the folder writer, the last run record and the automatic sync setting
async function renderHelpStatus() {
  if (!helpLoaded) return;
  const folder = document.getElementById('helpFolderStatus');
  const sync = document.getElementById('helpSyncStatus');
  const auto = document.getElementById('helpAutoStatus');
  const writer = await chrome.runtime.sendMessage({ action: 'checkWriteAccess' }).catch(e => ({ success: false, error: e.message }));
  if (!writer || !writer.success) folder.textContent = `The folder writer did not answer: ${(writer && writer.error) || 'no response'}.`;
  else if (!writer.hasHandle) folder.textContent = 'Not done yet: no data folder is chosen.';
  else if (writer.permission === 'granted') folder.textContent = `Done: "${writer.folderName}" is the data folder, and the extension can save into it.`;
  else folder.textContent = `"${writer.folderName}" is the data folder. Saving into it needs access allowed (state: ${writer.permission}).`;
  folder.classList.toggle('done', !!(writer && writer.success && writer.hasHandle && writer.permission === 'granted'));

  const stored = await chrome.storage.local.get([RUN_STATE_KEY, AUTO_SYNC_KEY]);
  const run = stored[RUN_STATE_KEY];
  if (run && run.run === 'sync' && !run.done) sync.textContent = `A sync is running: ${run.text}`;
  else if (run && run.run === 'sync' && !run.error) sync.textContent = `Done: the last sync finished ${settingsTime(run.at)}.`;
  else if (run && run.run === 'sync') sync.textContent = `The last sync did not finish: ${run.error}`;
  else sync.textContent = 'No sync is recorded in this browser yet.';
  sync.classList.toggle('done', !!(run && run.run === 'sync' && run.done && !run.error));

  const setting = { ...AUTO_SYNC_DEFAULT, ...(stored[AUTO_SYNC_KEY] || {}) };
  auto.textContent = setting.enabled ? `On: every ${autoSyncLabel(setting.minutes)}.` : 'Off.';
  auto.classList.toggle('done', !!setting.enabled);
}

document.getElementById('helpContent').addEventListener('click', (e) => {
  const btn = e.target.closest('[data-help-action]');
  if (btn) runHelpAction(btn);
});
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[RUN_STATE_KEY] || changes[AUTO_SYNC_KEY])) renderHelpStatus();
});
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'folderAccessChanged') renderHelpStatus();
});
loadHelpContent();
