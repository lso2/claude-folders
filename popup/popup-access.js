// popup/popup-access.js
// Shows the popup banner that re-grants data folder access and writes the exports queued without it.
// Globals: renderPopupAccessBanner, onPopupAccessClick
// Depends on: lib/storage-keys.js, lib/handle-storage.js, lib/export-files.js, lib/folder-access.js
// Notes: docs/notes/popup/popup-access.js.md

async function renderPopupAccessBanner() {
  const banner = document.getElementById('folderAccessBanner');
  const text = document.getElementById('folderAccessText');
  if (!banner || !text) return;
  const access = await checkFolderAccess();
  const queued = (await readQueuedExports()).length;

  // Without a folder the popup shows its setup screen
  if (!access.hasHandle) {
    banner.classList.add('hidden');
    return;
  }
  if (access.permission === 'granted') {
    banner.classList.add('hidden');
    if (queued) {
      const flushed = await flushQueuedExports();
      chrome.runtime.sendMessage({ action: 'folderAccessChanged', written: flushed.written, failed: flushed.failed }).catch(() => {});
    }
    return;
  }
  const waiting = queued ? ` ${queued} export${queued === 1 ? '' : 's'} waiting.` : '';
  text.textContent = `Saving into "${access.folderName}" needs your permission.${waiting}`;
  banner.classList.remove('hidden');
}

// The click is the user gesture Chrome requires before it shows the permission prompt
async function onPopupAccessClick() {
  const text = document.getElementById('folderAccessText');
  try {
    const result = await grantFolderAccess();
    if (!result.granted) {
      text.textContent = `Access was not granted (state: ${result.permission}).`;
      return;
    }
    const flushed = await flushQueuedExports();
    await chrome.runtime.sendMessage({ action: 'folderAccessChanged', written: flushed.written, failed: flushed.failed }).catch(() => {});
    // popup.js reads the data file on load, which now succeeds
    window.location.reload();
  } catch (e) {
    text.textContent = `${e.name}: ${e.message}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('folderAccessBtn')?.addEventListener('click', onPopupAccessClick);
  renderPopupAccessBanner();
});
