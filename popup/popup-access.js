// popup/popup-access.js
// Shows the popup banner while the background writer cannot save into the data folder.
// Globals: renderPopupAccessBanner, onPopupAccessClick
// Depends on: lib/folder-state.js (cfReadWriterState, cfDescribeWriter), background.js (openFolderAccess)
// Notes: docs/notes/popup/popup-access.js.md

// A grant asked for in the popup holds only for the popup page. The banner shows the background writer's state.
// Without a folder the popup shows its setup screen.
async function renderPopupAccessBanner() {
  const banner = document.getElementById('folderAccessBanner');
  const text = document.getElementById('folderAccessText');
  const btn = document.getElementById('folderAccessBtn');
  if (!banner || !text || !btn) return;
  const view = cfDescribeWriter(await cfReadWriterState());
  if (view.state === 'granted' || view.state === 'none') {
    banner.classList.add('hidden');
    return;
  }
  text.textContent = view.text;
  btn.textContent = view.state === 'unreadable' ? 'Choose data folder' : 'Allow folder access';
  banner.classList.remove('hidden');
}

// The settings page's Data folder section, where a click lets Chrome show its prompt
async function onPopupAccessClick() {
  try {
    await chrome.runtime.sendMessage({ action: 'openFolderAccess' });
    window.close();
  } catch (e) {
    document.getElementById('folderAccessText').textContent = 'The settings page did not open: ' + e.message;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('folderAccessBtn')?.addEventListener('click', onPopupAccessClick);
  renderPopupAccessBanner();
});

// Sent once access is allowed on the settings page (lib/folder-access.js announceFolderAccess)
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'folderAccessChanged') renderPopupAccessBanner();
});
