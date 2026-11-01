// content/cf-reveal.js
// Opens File Explorer at an exported file through the Claude Folders Helper, when the helper is installed.
// Globals: cfHelperReadyRead, cfHelperReady, cfRevealExport, cfNotifySaved
// Depends on: lib/chat-markdown.js (exportIdPrefix), content/cf-notify.js,
//             content/cf-export-state.js (cfRefreshPageExportButton)
// Notes: docs/notes/content/cf-reveal.js.md

// This page's read of the helper status. A tab shown again reads it again, after an install elsewhere.
let cfHelperReadyRead = null;

// True when the helper answers and finds the data folder. Without it, no file name link and no Show in folder.
function cfHelperReady() {
  if (!cfHelperReadyRead) {
    cfHelperReadyRead = chrome.runtime.sendMessage({ action: 'helperStatus' })
      .then(status => !!(status && status.ready === true))
      .catch(() => false);
  }
  return cfHelperReadyRead;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') cfHelperReadyRead = null;
});

// True once File Explorer was started. The helper finds the file by its name, or by the
// conversation's id prefix when the name is unknown or the file was renamed.
async function cfRevealExport(chatId, filename) {
  let res = null;
  try {
    res = await chrome.runtime.sendMessage({ action: 'revealExport', filename: filename || null, prefix: chatId ? exportIdPrefix(chatId) : null });
  } catch (e) {
    res = { success: false, error: e.message };
  }
  if (res && res.success) {
    cfClearNotice('reveal');
    return true;
  }
  cfNotifyAction('reveal', `Could not open the folder: ${(res && res.error) || 'the response from the background was empty'}`, [], true);
  // The helper's not-found answer means the export is missing from the data folder
  if (res && res.code === 'not-found') cfRefreshPageExportButton(true);
  return false;
}

// The Saved notice stays until its × is clicked. With the helper ready, the file name opens its folder.
async function cfNotifySaved(filename, chatId) {
  if (await cfHelperReady()) {
    cfNotifyLink('saved', 'Saved: ', filename, 'Show this file in its folder', () => cfRevealExport(chatId, filename));
  } else {
    cfNotifyAction('saved', 'Saved: ' + filename, []);
  }
}
