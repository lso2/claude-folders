// lib/claude-tab.js
// Starts a sync or an export run in a claude.ai tab, opening one when none is open.
// Globals: CF_CLAUDE_TAB_TRIES, CF_OPEN_TAB_TRIES, cfOpenClaudeTab, cfClaudeTabForRun, cfSendStart, cfStartRunInClaudeTab
// Notes: docs/notes/lib/claude-tab.js.md

// Start messages sent to a new claude.ai tab before its content scripts answer, 2 seconds apart
const CF_CLAUDE_TAB_TRIES = 5;
// Start messages sent to a claude.ai tab that was already open. A tab loaded before this extension was
// installed or reloaded has none of its content scripts, and a new tab is opened after these.
const CF_OPEN_TAB_TRIES = 2;

async function cfOpenClaudeTab() {
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
  return tab;
}

// Any open claude.ai tab runs it, the active one first. A tab is opened only when claude.ai is not open.
async function cfClaudeTabForRun() {
  const claudeTabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  const open = claudeTabs.find(t => t.active) || claudeTabs[0];
  if (open) return { tab: open, reused: true };
  return { tab: await cfOpenClaudeTab(), reused: false };
}

// { success: true } once the tab's content scripts take the message, else the last send error
async function cfSendStart(tabId, message, tries) {
  let lastError = null;
  for (let attempt = 1; attempt <= tries; attempt++) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
      return { success: true };
    } catch (e) {
      lastError = e;
      if (attempt < tries) await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  return { success: false, error: lastError.message };
}

// message: { action: 'startScrape' } or { action: 'startBulkExport', chats, title }
async function cfStartRunInClaudeTab(message) {
  const { tab, reused } = await cfClaudeTabForRun();
  const first = await cfSendStart(tab.id, message, reused ? CF_OPEN_TAB_TRIES : CF_CLAUDE_TAB_TRIES);
  if (first.success) {
    console.log('[BG]', message.action, 'started in', reused ? 'the open claude.ai tab' : 'a new claude.ai tab', tab.id);
    return { success: true, tabId: tab.id, reusedTab: reused };
  }
  if (!reused) {
    return { success: false, error: `The new claude.ai tab did not answer ${CF_CLAUDE_TAB_TRIES} start messages sent 2 seconds apart: ${first.error}` };
  }
  console.log('[BG] The open claude.ai tab', tab.id, 'did not answer', CF_OPEN_TAB_TRIES, 'start messages:', first.error, '- opening a new claude.ai tab');
  const fresh = await cfOpenClaudeTab();
  const second = await cfSendStart(fresh.id, message, CF_CLAUDE_TAB_TRIES);
  if (second.success) {
    console.log('[BG]', message.action, 'started in a new claude.ai tab', fresh.id);
    return { success: true, tabId: fresh.id, reusedTab: false };
  }
  return {
    success: false,
    error: `The open claude.ai tab did not answer ${CF_OPEN_TAB_TRIES} start messages (${first.error}), and the new claude.ai tab did not answer ${CF_CLAUDE_TAB_TRIES} sent 2 seconds apart: ${second.error}`
  };
}
