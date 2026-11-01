// popup/popup-access.js
// Shows the popup banner while the background's folder writer cannot save into the data folder.
// Globals: renderPopupAccessBanner, onPopupAccessClick
// Depends on: lib/folder-access.js (readQueuedExports), background.js (checkWriteAccess, openFolderAccess)
// Notes: docs/notes/popup/popup-access.js.md

// The writer is the access window while it is open, else the offscreen document (background.js askFolderWorker).
// A grant asked for in the popup holds only for the popup page, so the popup asks the writer.
async function renderPopupAccessBanner() {
  const banner = document.getElementById('folderAccessBanner');
  const text = document.getElementById('folderAccessText');
  if (!banner || !text) return;
  let writer = null;
  try {
    writer = await chrome.runtime.sendMessage({ action: 'checkWriteAccess' });
  } catch (e) {
    writer = { success: false, error: e.message };
  }
  // Without a folder the popup shows its setup screen
  if (writer && writer.success && (!writer.hasHandle || writer.permission === 'granted')) {
    banner.classList.add('hidden');
    return;
  }
  const queued = (await readQueuedExports()).length;
  const waiting = queued ? ` ${queued} export${queued === 1 ? '' : 's'} waiting.` : '';
  text.textContent = writer && writer.success
    ? `Saving into "${writer.folderName}" needs the access window open with access allowed (state: ${writer.permission}).${waiting}`
    : `The folder writer did not answer: ${(writer && writer.error) || 'no response'}.${waiting}`;
  banner.classList.remove('hidden');
}

// The access window holds the grant the writer uses, and it writes the waiting exports once allowed
async function onPopupAccessClick() {
  try {
    await chrome.runtime.sendMessage({ action: 'openFolderAccess' });
  } catch (e) {
    document.getElementById('folderAccessText').textContent = 'The access window did not open: ' + e.message;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('folderAccessBtn')?.addEventListener('click', onPopupAccessClick);
  renderPopupAccessBanner();
});

// Sent once the access window is allowed (lib/folder-access.js announceFolderAccess)
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'folderAccessChanged') renderPopupAccessBanner();
});
