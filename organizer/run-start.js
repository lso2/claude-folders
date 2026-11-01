// organizer/run-start.js
// Starts a claude.ai tab's run from the organizer's buttons: a sync, a folder export, an import or a one-click organize.
// Globals: startOrganizerRun, startOrganizerSync, startOrganizerFolderExport, startOrganizerAccountImport,
//          startOrganizerOneClick
// Depends on: organizer/run-pane.js (renderOrganizerRun, organizerRunWatching), organizer/app.js (currentFolder,
//             allChats), organizer/accounts.js (organizerAccountView, organizerCurrentKey), lib/page-dialog.js,
//             lib/organize-prompt.js, lib/storage-keys.js (ORGANIZE_INDEX_KEY_PREFIX), lib/claude-tab.js (background:
//             startAutoScrape, startFolderExport), background.js (openImportDialog, startOrganizePrompt)
// Notes: docs/notes/organizer/run-start.js.md

// The run's progress and result arrive through the run record (organizer/run-pane.js)
async function startOrganizerRun(message, startingText) {
  organizerRunWatching = true;
  renderOrganizerRun(null, startingText);
  let answer = null;
  try {
    answer = await chrome.runtime.sendMessage(message);
  } catch (e) {
    answer = { success: false, error: e.message };
  }
  if (!answer || !answer.success) {
    organizerRunWatching = false;
    renderOrganizerRun({ run: message.action === 'startFolderExport' ? 'export' : 'sync', done: true, lines: [], files: [],
      error: 'The run did not start: ' + ((answer && answer.error) || 'the background answered nothing') });
  }
}

function startOrganizerSync() {
  return startOrganizerRun({ action: 'startAutoScrape' }, 'Starting the sync in the claude.ai tab...');
}

// Only this login's folders have chats this login can read
function startOrganizerFolderExport() {
  const folder = currentFolder;
  if (!folder || !folder.own || !(folder.chats || []).length) return;
  const chats = folder.chats.map(c => ({ id: c.id, title: c.title, url: c.url, orgId: c.orgId || null, folderName: folder.name }));
  return startOrganizerRun({ action: 'startFolderExport', chats, title: `Exporting "${folder.name}"` }, 'Starting the export in the claude.ai tab...');
}

// The background opens the import dialog in a new claude.ai tab, on the account the dropdown shows. The run is in that tab too.
async function startOrganizerAccountImport() {
  const parsed = cfParseAccountView(organizerAccountView);
  const shown = parsed && parsed.kind !== 'all' && parsed.key !== organizerCurrentKey ? parsed.key : null;
  let answer = null;
  try {
    answer = await chrome.runtime.sendMessage({ action: 'openImportDialog', accountKey: shown });
  } catch (e) {
    answer = { success: false, error: e.message };
  }
  if (!answer || !answer.success) cfPageNotice('The import dialog did not open: ' + ((answer && answer.error) || 'the background answered nothing'), true);
}

// The one-click organize of the Folders panel (content/cf-organize-auto.js) for this login's chats. The title index
// is stored under the login's key before the tab opens, as the panel and the popup store it.
async function startOrganizerOneClick() {
  if (!allChats.length) {
    cfPageAlert('Nothing to organize', 'There are no chats in the folders to organize. Run a sync first.');
    return;
  }
  const request = cfBuildOrganizePrompt(allChats);
  await chrome.storage.local.set({ [ORGANIZE_INDEX_KEY_PREFIX + organizerCurrentKey]: request.index });
  let opened = null;
  try {
    opened = await chrome.runtime.sendMessage({ action: 'startOrganizePrompt', prompt: request.prompt, auto: true });
  } catch (e) {
    opened = { success: false, error: e.message };
  }
  if (!opened || !opened.success) cfPageAlert('Organize request not opened', 'The tab for the organize request was not opened: ' + ((opened && opened.error) || 'the background answered nothing'));
}
