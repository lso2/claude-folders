// settings/settings-folder-lists.js
// Opens the organizer to copy the chat list for Claude or to import Claude's organized folders.
// Globals: openOrganizerAction
// Depends on: organizer/app.js (its action parameter: export or import), settings/settings-format.js (settingsShowResult)
// Notes: docs/notes/settings/settings-folder-lists.js.md

// The organizer runs its Export or Import button once its folder data is loaded
async function openOrganizerAction(action) {
  const result = document.getElementById('folderListResult');
  try {
    await chrome.tabs.create({ url: chrome.runtime.getURL(`organizer/index.html?action=${action}`) });
    settingsShowResult(result, '', false);
  } catch (e) {
    settingsShowResult(result, `The organizer did not open: ${e.message}`, true);
  }
}

document.getElementById('folderListExport').addEventListener('click', () => openOrganizerAction('export'));
document.getElementById('folderListImport').addEventListener('click', () => openOrganizerAction('import'));
