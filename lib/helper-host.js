// lib/helper-host.js
// Asks the Claude Folders Helper, a Windows program installed apart from the extension, to open File Explorer.
// Globals: CF_HELPER_NAME, CF_HELPER_STATUS_MS, cfHelperStatus, askHelper, helperStatus, revealWithHelper
// Depends on: background.js (askFolderWorker)
// Notes: docs/notes/lib/helper-host.js.md

// Chrome starts the helper for each message and reports a missing or refused helper in runtime.lastError
const CF_HELPER_NAME = 'com.plexpixel.claude_folders';
const CF_HELPER_STATUS_MS = 60000;
// The last ping's answer: { at, status }
let cfHelperStatus = null;

// A successful answer is passed on whole: { success, ok, path } for reveal, { success, ok, version, folderFound } for ping
function askHelper(message) {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendNativeMessage(CF_HELPER_NAME, message, (response) => {
        const error = chrome.runtime.lastError;
        if (error) return resolve({ success: false, code: 'helper', error: error.message });
        if (!response) return resolve({ success: false, code: 'helper', error: 'The helper sent an empty response' });
        if (response.ok) return resolve({ success: true, ...response });
        resolve({ success: false, code: response.code || 'helper', error: response.error || "The helper's failure had no message" });
      });
    } catch (e) {
      resolve({ success: false, code: 'helper', error: e.message });
    }
  });
}

// ready is true when the helper answers and finds the data folder. Pages show the file name link and
// Show in folder only then. A ready answer is reused for a minute, and fresh pings again.
async function helperStatus(fresh) {
  if (!fresh && cfHelperStatus && Date.now() - cfHelperStatus.at < CF_HELPER_STATUS_MS) return cfHelperStatus.status;
  const access = await askFolderWorker({ action: 'folderCheckAccess' }, { success: false });
  let status;
  if (!access.success || !access.hasHandle) {
    status = { ready: false, installed: null, error: access.error || 'No data folder is selected' };
  } else {
    const ping = await askHelper({ action: 'ping', folderName: access.folderName });
    status = ping.success
      ? { ready: ping.folderFound === true, installed: true, version: ping.version || null, folderName: access.folderName }
      : { ready: false, installed: false, error: ping.error };
  }
  // Any other answer is read again next time. A helper installed in the meantime is found then.
  cfHelperStatus = status.ready ? { at: Date.now(), status } : null;
  return status;
}

// The helper looks up the folder's path by its name in the browser profile's granted folders
async function revealWithHelper(filename, prefix) {
  const access = await askFolderWorker({ action: 'folderCheckAccess' }, { success: false });
  if (!access.success) return { success: false, code: 'unreachable', error: access.error || 'The folder worker returned no result' };
  if (!access.hasHandle) return { success: false, code: 'no-folder', error: access.error || 'No data folder is selected' };
  return askHelper({ action: 'reveal', folderName: access.folderName, filename: filename || null, prefix: prefix || null });
}
