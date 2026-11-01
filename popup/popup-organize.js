// popup/popup-organize.js
// Starts the Ask Claude to Organize request from the toolbar popup in a new claude.ai tab.
// Globals: popupOrganizeIndexKey, askClaudeToOrganize
// Depends on: lib/organize-prompt.js (cfBuildOrganizePrompt), lib/storage-keys.js (ORGANIZE_INDEX_KEY_PREFIX),
//             popup/popup.js (allChats), lib/organize-tabs.js (background), lib/page-dialog.js (cfPageAlert)
// Notes: docs/notes/popup/popup-organize.js.md

// The index is stored per login, under the same key as the Folders panel's (content/cf-account.js)
async function popupOrganizeIndexKey() {
  const stored = await chrome.storage.local.get('activeAccountKey');
  return ORGANIZE_INDEX_KEY_PREFIX + stored.activeAccountKey;
}

// The popup closes when the new tab becomes active, so the index is stored before the tab is requested.
// content/cf-pending.js pastes the request in the new tab. auto: the tab also sends it and opens Claude's
// answer for applying (content/cf-organize-auto.js).
async function askClaudeToOrganize(auto) {
  if (!allChats.length) {
    cfPageAlert('Nothing to organize', 'There are no chats in the folders to organize. Run a sync first.');
    return;
  }
  const request = cfBuildOrganizePrompt(allChats);
  await chrome.storage.local.set({ [await popupOrganizeIndexKey()]: request.index });
  let opened = null;
  try {
    opened = await chrome.runtime.sendMessage({ action: 'startOrganizePrompt', prompt: request.prompt, auto: auto === true });
  } catch (e) {
    opened = { success: false, error: e.message };
  }
  if (!opened || !opened.success) {
    cfPageAlert('Organize request not opened', 'The tab for the organize request was not opened: ' + ((opened && opened.error) || 'the background answered nothing'));
  }
}
