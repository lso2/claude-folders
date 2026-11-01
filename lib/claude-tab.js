// lib/claude-tab.js
// Starts a sync or an export run in a claude.ai tab, opening one when none is open.
// Globals: CF_CLAUDE_TAB_TRIES, cfClaudeTabForRun, cfStartRunInClaudeTab
// Notes: docs/notes/lib/claude-tab.js.md

// Start messages sent before the tab's content scripts answer, 2 seconds apart
const CF_CLAUDE_TAB_TRIES = 5;

// Any open claude.ai tab runs it, the active one first. A tab is opened only when claude.ai is not open.
async function cfClaudeTabForRun() {
  const claudeTabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  const open = claudeTabs.find(t => t.active) || claudeTabs[0];
  if (open) return { tab: open, reused: true };
  const tab = await chrome.tabs.create({ url: 'https://claude.ai/recents', active: true });
  await new Promise((resolve) => {
    const listener = (tabId, info) => {
      if (tabId === tab.id && info.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(resolve, 15000);
  });
  // The content scripts start at document idle, after the load completes
  await new Promise(resolve => setTimeout(resolve, 3000));
  return { tab, reused: false };
}

// message: { action: 'startScrape' } or { action: 'startBulkExport', chats, title }
async function cfStartRunInClaudeTab(message) {
  const { tab, reused } = await cfClaudeTabForRun();
  let lastError = null;
  for (let attempt = 1; attempt <= CF_CLAUDE_TAB_TRIES; attempt++) {
    try {
      await chrome.tabs.sendMessage(tab.id, message);
      console.log('[BG]', message.action, 'started in', reused ? 'the open claude.ai tab' : 'a new claude.ai tab', tab.id);
      return { success: true, tabId: tab.id, reusedTab: reused };
    } catch (e) {
      lastError = e;
      if (attempt < CF_CLAUDE_TAB_TRIES) await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return { success: false, error: `The claude.ai tab did not answer ${CF_CLAUDE_TAB_TRIES} start messages sent 2 seconds apart: ${lastError.message}` };
}
