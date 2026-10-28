// content/cf-disk.js
// Sends export files to the background writer and asks for folder access when it is missing.
// Globals: cfWriteExport, cfSaveExport, cfQueueExport, cfCheckWriteAccess, cfPromptFolderAccess,
//          cfReportSave
// Depends on: lib/storage-keys.js, content/cf-notify.js, content/cf-export.js (markChatAsExported)
// Notes: docs/notes/content/cf-disk.js.md

// One write through the offscreen writer, returning its { success, code, error } as given
async function cfWriteExport(filename, content) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'saveExport', filename, content });
    return res || { success: false, code: 'write', error: 'The writer returned no result' };
  } catch (e) {
    return { success: false, code: 'unreachable', error: e.message };
  }
}

// A single export is kept in the queue when folder access is missing, and the
// access window writes it once access is granted
async function cfSaveExport(filename, content, chatId) {
  const res = await cfWriteExport(filename, content);
  if (res.success) {
    if (chatId) await markChatAsExported(chatId);
    return { saved: true, filename };
  }
  if (res.code === 'no-folder' || res.code === 'permission') {
    const queued = await cfQueueExport(filename, content, chatId);
    cfPromptFolderAccess(res.code, res.folderName, res.permission);
    return { saved: false, queued, code: res.code, error: res.error, filename };
  }
  return { saved: false, queued: false, code: res.code, error: res.error, filename };
}

async function cfQueueExport(filename, content, chatId) {
  try {
    const stored = await chrome.storage.local.get(QUEUED_EXPORTS_KEY);
    const queue = (Array.isArray(stored[QUEUED_EXPORTS_KEY]) ? stored[QUEUED_EXPORTS_KEY] : [])
      .filter(item => item.filename !== filename);
    queue.push({ filename, content, chatId: chatId || null, queuedAt: new Date().toISOString() });
    await chrome.storage.local.set({ [QUEUED_EXPORTS_KEY]: queue });
    return true;
  } catch (e) {
    console.log('[EXPORT] Could not queue', filename, '-', e.message);
    return false;
  }
}

async function cfCheckWriteAccess() {
  let res = null;
  try {
    res = await chrome.runtime.sendMessage({ action: 'checkWriteAccess' });
  } catch (e) {
    return { ok: false, code: 'unreachable', error: e.message };
  }
  if (!res || !res.success) {
    return { ok: false, code: 'unreachable', error: (res && res.error) || 'The writer returned no result' };
  }
  if (!res.hasHandle) return { ok: false, code: 'no-folder', error: res.error || 'No data folder is selected' };
  if (res.permission !== 'granted') {
    return {
      ok: false,
      code: 'permission',
      folderName: res.folderName,
      permission: res.permission,
      error: `Access to the data folder "${res.folderName}" is "${res.permission}"`
    };
  }
  return { ok: true, folderName: res.folderName };
}

// Chrome only re-grants folder access from a click inside an extension page
function cfPromptFolderAccess(code, folderName, permission) {
  const noFolder = code === 'no-folder';
  const message = noFolder
    ? 'No data folder is selected for exports.'
    : `Saving exports needs access to the "${folderName || 'data'}" folder (permission: ${permission || 'unknown'}).`;
  cfNotifyAction('access', message, [{
    label: noFolder ? 'Choose folder' : 'Grant access',
    primary: true,
    onClick: () => chrome.runtime.sendMessage({ action: 'openFolderAccess' }).catch(() => {})
  }]);
}

function cfReportSave(outcome) {
  if (outcome.saved) {
    showNotification(`Saved: ${outcome.filename}`);
  } else if (!outcome.queued) {
    showNotification('Could not save: ' + (outcome.error || 'the writer returned no reason'), true);
  }
}
