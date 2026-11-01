// settings/settings-folder.js
// The settings page's data folder section: the folder, its access state, and choosing or allowing it.
// Globals: settingsFolderEls, renderFolderSection, finishFolderChange, onFolderGrantClick, onFolderChooseClick
// Depends on: lib/handle-storage.js, lib/folder-access.js, lib/folder-picker.js, settings/settings-format.js,
//             settings/settings-accounts.js, settings/settings-helper.js, background.js (checkWriteAccess, openFolderAccess)
// Notes: docs/notes/settings/settings-folder.js.md

const settingsFolderEls = {
  status: document.getElementById('folderStatus'),
  queue: document.getElementById('folderQueue'),
  grant: document.getElementById('folderGrant'),
  choose: document.getElementById('folderChoose'),
  flag: document.getElementById('folderFlag'),
  result: document.getElementById('folderResult')
};

// The folder is the stored handle every extension page shares. Its access state comes from the background's
// folder writer: a grant asked for on this page would hold only while this page is open.
async function renderFolderSection() {
  const els = settingsFolderEls;
  const access = await checkFolderAccess();
  let writer = null;
  try {
    writer = await chrome.runtime.sendMessage({ action: 'checkWriteAccess' });
  } catch (e) {
    writer = { success: false, error: e.message };
  }
  const queued = (await readQueuedExports()).length;
  els.queue.hidden = queued === 0;
  els.queue.textContent = `${queued} export${queued === 1 ? '' : 's'} waiting to be written.`;
  els.flag.hidden = true;
  if (!access.hasHandle && !cfFolderPickerAvailable()) {
    els.status.textContent = CF_PICKER_MISSING + (cfPickerFlagAvailable() ? ' ' + CF_PICKER_FLAG_HINT : '');
    els.grant.hidden = true;
    els.choose.hidden = true;
    els.flag.hidden = !cfPickerFlagAvailable();
    return access;
  }
  if (!access.hasHandle) {
    els.status.textContent = 'No data folder is selected.';
    els.grant.hidden = true;
    els.choose.hidden = false;
    els.choose.className = 'btn';
    els.choose.textContent = 'Choose folder';
    return access;
  }
  // A folder handle can have an empty name, as the root of the browser's private storage does
  const folder = access.folderName ? `"${access.folderName}" is the data folder` : 'The data folder is selected';
  const granted = !!(writer && writer.success && writer.permission === 'granted');
  if (granted) els.status.textContent = `${folder}. The folder writer can save into it.`;
  else if (writer && writer.success) els.status.textContent = `${folder}. Saving into it needs the access window open with access allowed (state: ${writer.permission}).`;
  else els.status.textContent = `${folder}. The folder writer did not answer: ${(writer && writer.error) || 'no response'}.`;
  if (access.error) els.status.textContent += ` ${access.error}`;
  els.grant.hidden = granted;
  els.choose.hidden = false;
  els.choose.className = 'btn btn-light';
  els.choose.textContent = 'Choose another folder';
  return access;
}

// A grant or a new folder writes the queued exports and is announced to the claude.ai tabs
async function finishFolderChange() {
  const flushed = await announceFolderAccess();
  await renderFolderSection();
  await renderAccountsSection();
  await renderHelperSection(true);
  if (flushed.failed) {
    settingsShowResult(settingsFolderEls.result, `${flushed.written} written, ${flushed.failed} still waiting: ${flushed.lastError}`, true);
    return;
  }
  settingsShowResult(settingsFolderEls.result, `Access granted. ${flushed.written} queued export${flushed.written === 1 ? '' : 's'} written.`, false);
}

// The access window holds the grant the folder writer uses
async function onFolderGrantClick() {
  try {
    await chrome.runtime.sendMessage({ action: 'openFolderAccess' });
  } catch (e) {
    settingsShowResult(settingsFolderEls.result, `The access window did not open: ${e.message}`, true);
  }
}

// Sent once the access window is allowed (lib/folder-access.js announceFolderAccess)
chrome.runtime.onMessage.addListener((message) => {
  if (message.action === 'folderAccessChanged') renderFolderSection();
});

async function onFolderChooseClick() {
  try {
    const result = await chooseDataFolder();
    if (!result.granted) {
      settingsShowResult(settingsFolderEls.result, `Access to "${result.folderName}" was not granted (state: ${result.permission}).`, true);
      await renderFolderSection();
      return;
    }
    await finishFolderChange();
  } catch (e) {
    if (e.name === 'AbortError') return;
    settingsShowResult(settingsFolderEls.result, `${e.name}: ${e.message}`, true);
  }
}
