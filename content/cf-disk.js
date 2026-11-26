// content/cf-disk.js
// Sends export files to the background writer. Without folder access, a save stops with a notice and a button for the
// settings page's Data folder section.
// Globals: CF_FOLDER_REFUSALS, cfIsFolderRefusal, cfWriteExport, cfSaveExport, cfCheckWriteAccess, cfFolderAccessAction,
//          cfPromptFolderAccess, cfReportSave
// Depends on: content/cf-notify.js, content/cf-export-records.js (markChatAsExported), content/cf-reveal.js (cfNotifySaved),
//             background.js (saveExport, checkWriteAccess, openFolderAccess)
// Notes: docs/notes/content/cf-disk.js.md

// The refusal codes of a folder check (lib/handle-storage.js cfAccessRefusal). Each is answered on the settings page.
const CF_FOLDER_REFUSALS = ['no-folder', 'permission', 'unreadable'];

function cfIsFolderRefusal(result) {
  return !!result && CF_FOLDER_REFUSALS.includes(result.code);
}

// One write through the background writer, returning its { success, code, error } as given
async function cfWriteExport(filename, content) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'saveExport', filename, content });
    return res || { success: false, code: 'write', error: 'The writer returned no result' };
  } catch (e) {
    return { success: false, code: 'unreachable', error: e.message };
  }
}

// A missing folder or access is reported with the button that opens the settings page. The mark is the
// conversation's state at export (lib/export-state.js).
async function cfSaveExport(filename, content, chatId, mark) {
  const res = await cfWriteExport(filename, content);
  if (res.success) {
    if (chatId) await markChatAsExported(chatId, { filename, mark });
    return { saved: true, filename, chatId: chatId || null };
  }
  console.log('[EXPORT]', filename, 'not saved:', res.code, res.error);
  if (cfIsFolderRefusal(res)) {
    cfPromptFolderAccess(res);
    return { saved: false, prompted: true, code: res.code, error: res.error, filename };
  }
  return { saved: false, prompted: false, code: res.code, error: res.error, filename };
}

// ok, or the refusal the writer reported: { code, folderName, permission, error }
async function cfCheckWriteAccess() {
  let res = null;
  try {
    res = await chrome.runtime.sendMessage({ action: 'checkWriteAccess' });
  } catch (e) {
    console.log('[EXPORT] Folder access not read:', e.message);
    return { ok: false, code: 'unreachable', error: e.message };
  }
  if (!res || !res.success) {
    const error = (res && res.error) || 'The writer returned no result';
    console.log('[EXPORT] Folder access not read:', error);
    return { ok: false, code: 'unreachable', error };
  }
  if (res.refusal) {
    const { code, folderName, permission, error } = res.refusal;
    if (code === 'unreadable') console.log('[EXPORT] Folder access not read:', error);
    return { ok: false, code, folderName, permission, error };
  }
  return { ok: true, folderName: res.folderName };
}

// The message and button for a folder refusal, shared by the notice, the sync bar and the sync result.
// The button opens the settings page's Data folder section, where Chrome shows its folder prompt.
function cfFolderAccessAction(refusal) {
  let message = `Data folder: ${refusal.folderName || '(no name)'}. Access: not allowed.`;
  let label = 'Allow folder access';
  if (refusal.code === 'no-folder') {
    message = 'No data folder.';
    label = 'Choose data folder';
  } else if (refusal.code === 'unreadable') {
    message = `Data folder not read: ${String(refusal.error || '').replace(/\.$/, '')}.`;
    label = 'Choose data folder';
  }
  return {
    message,
    label,
    run: () => chrome.runtime.sendMessage({ action: 'openFolderAccess' })
      .catch(e => showNotification('The settings page did not open: ' + e.message, true))
  };
}

function cfPromptFolderAccess(refusal) {
  const action = cfFolderAccessAction(refusal);
  cfNotifyAction('access', action.message, [{ label: action.label, primary: true, onClick: action.run }]);
}

// A saved file gets a notice that stays until closed, with the file name opening its folder
function cfReportSave(outcome) {
  if (outcome.saved) {
    cfNotifySaved(outcome.filename, outcome.chatId);
  } else if (!outcome.prompted) {
    showNotification('Could not save: ' + (outcome.error || 'the writer returned no reason'), true);
  }
}
