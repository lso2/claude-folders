// settings/settings-helper.js
// The settings page's Claude Folders Helper section: whether the helper answers and finds the data folder.
// Globals: CF_HOST_FORBIDDEN, renderHelperSection
// Depends on: lib/helper-host.js (the helperStatus answer)
// Notes: docs/notes/settings/settings-helper.js.md

// Chrome's runtime.lastError text for a helper whose host manifest does not list this extension
const CF_HOST_FORBIDDEN = 'Access to the specified native messaging host is forbidden.';

// fresh asks the helper again and skips the background's one-minute reuse of a ready answer
async function renderHelperSection(fresh) {
  const status = document.getElementById('helperStatus');
  const hint = document.getElementById('helperHint');
  hint.hidden = true;
  status.textContent = 'Checking the helper...';
  let answer;
  try {
    answer = await chrome.runtime.sendMessage({ action: 'helperStatus', fresh: !!fresh });
  } catch (e) {
    status.textContent = `The background did not answer: ${e.message}`;
    return;
  }
  if (!answer) {
    status.textContent = 'The background answered nothing.';
    return;
  }
  if (answer.ready) {
    status.textContent = `Installed, version ${answer.version}. It finds the data folder "${answer.folderName}". Saved file names and Show in folder open File Explorer.`;
    return;
  }
  if (answer.installed) {
    status.textContent = `Installed, version ${answer.version}. It found no folder named "${answer.folderName}" among the folders this browser granted to Claude Folders.`;
    return;
  }
  if (answer.installed === null) {
    status.textContent = `Not asked: ${answer.error}`;
    return;
  }
  status.textContent = `Not available. The browser reported: ${answer.error}`;
  hint.hidden = false;
  hint.textContent = answer.error === CF_HOST_FORBIDDEN
    ? `The helper is installed without this extension's ID (${chrome.runtime.id}). Running the helper setup again registers it.`
    : 'ClaudeFoldersHelperSetup installs the helper on Windows (INSTALL.md, Claude Folders Helper). Without it, saved file names are plain text and an exported chat shows Export.';
}
