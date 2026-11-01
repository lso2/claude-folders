// content/cf-organize.js
// Starts the Ask Claude to Organize request from the Folders panel in a new claude.ai tab.
// Globals: askClaudeToOrganize
// Depends on: lib/organize-prompt.js (cfBuildOrganizePrompt), content/cf-state.js (allChats, cfOrganizeIndex),
//             content/cf-account.js (cfOrganizeIndexKey), content/cf-notify.js, lib/organize-tabs.js (background)
// Notes: docs/notes/content/cf-organize.js.md

// The background opens the /new tab and stores the request under that tab's id (lib/organize-tabs.js).
// content/cf-pending.js pastes it in the new tab. auto: the tab also sends it and opens Claude's answer for
// applying (content/cf-organize-auto.js), the one-click version of the 2 steps.
async function askClaudeToOrganize(auto) {
  if (!allChats.length) {
    showNotification('There are no chats in the folders to organize. Run a sync first.', true);
    return;
  }
  const request = cfBuildOrganizePrompt(allChats);
  cfOrganizeIndex = request.index;
  await chrome.storage.local.set({ [cfOrganizeIndexKey()]: request.index });
  let opened = null;
  try {
    opened = await chrome.runtime.sendMessage({ action: 'startOrganizePrompt', prompt: request.prompt, auto: auto === true });
  } catch (e) {
    opened = { success: false, error: e.message };
  }
  if (!opened || !opened.success) {
    showNotification('The tab for the organize request was not opened: ' + ((opened && opened.error) || 'the background answered nothing'), true);
    return;
  }
  console.log('[ORGANIZE] Request with', request.analysis.totalChats, 'titles sent to tab', opened.tabId, auto === true ? 'to send and read' : 'to paste');
}
