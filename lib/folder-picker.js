// lib/folder-picker.js
// Reports whether this browser has the folder picker, and opens the Brave flag page that turns it on.
// Loaded by the content scripts, the popup and the access window.
// Globals: CF_PICKER_FLAG_URL, CF_PICKER_MISSING, CF_PICKER_FLAG_HINT, cfFolderPickerAvailable,
//          cfPickerFlagAvailable, cfOpenPickerFlag
// Notes: docs/notes/lib/folder-picker.js.md

// Brave ships with the File System Access API turned off, and this flag turns it on after a restart
const CF_PICKER_FLAG_URL = 'chrome://flags/#file-system-access-api';
const CF_PICKER_MISSING = 'This browser has no window.showDirectoryPicker for choosing a data folder.';
const CF_PICKER_FLAG_HINT = 'In Brave it is turned on by the file-system-access-api flag and a restart.';

function cfFolderPickerAvailable() {
  return typeof window.showDirectoryPicker === 'function';
}

function cfPickerFlagAvailable() {
  return !!navigator.brave;
}

// Content scripts have no chrome.tabs, so the service worker opens the flag page for every caller
async function cfOpenPickerFlag() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'openFlagsPage', url: CF_PICKER_FLAG_URL });
    console.log('[ACCESS] Flag page:', res && res.success ? `opened in tab ${res.tabId}` : `not opened: ${(res && res.error) || 'no response'}`);
    return res || { success: false, error: 'no response' };
  } catch (e) {
    console.log('[ACCESS] Flag page not opened:', e.message);
    return { success: false, error: e.message };
  }
}
