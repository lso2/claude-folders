// lib/tab-handoff.js
// Opens a claude.ai tab with a request stored under the tab's id, for the page's content script to read.
// Globals: CF_TAB_HANDOFF_KEY, cfHandoffQueue, cfReadHandoffs, cfOpenTabWithHandoff, cfHandoffFor, cfTakeHandoff,
//          cfForgetHandoff
// Notes: docs/notes/lib/tab-handoff.js.md

// Session storage keeps the requests across service worker restarts: { [tab id]: { kind, payload, at } }
const CF_TAB_HANDOFF_KEY = 'cfTabHandoffs';
// Openings run one after another. Two quick clicks then never write the stored requests at the same time.
// A page asking for its request waits for the openings in progress.
let cfHandoffQueue = Promise.resolve();

async function cfReadHandoffs() {
  const stored = await chrome.storage.session.get(CF_TAB_HANDOFF_KEY);
  return stored[CF_TAB_HANDOFF_KEY] || {};
}

// The tab starts on about:blank, and the request is stored before the address loads in it
function cfOpenTabWithHandoff(kind, payload, url) {
  const opening = cfHandoffQueue.then(async () => {
    const tab = await chrome.tabs.create({ url: 'about:blank' });
    const all = await cfReadHandoffs();
    all[tab.id] = { kind, payload, at: new Date().toISOString() };
    await chrome.storage.session.set({ [CF_TAB_HANDOFF_KEY]: all });
    await chrome.tabs.update(tab.id, { url });
    return tab.id;
  });
  cfHandoffQueue = opening.catch(e => console.log('[BG] Tab for', kind, 'not opened:', e.message));
  return opening;
}

// The payload stored for this tab and kind, or null
async function cfHandoffFor(kind, tabId) {
  if (typeof tabId !== 'number') return null;
  await cfHandoffQueue;
  const entry = (await cfReadHandoffs())[tabId];
  return entry && entry.kind === kind ? entry.payload : null;
}

// The tab's { kind, payload } when its kind is one of kinds, removed as it is handed out; else null
async function cfTakeHandoff(tabId, kinds) {
  if (typeof tabId !== 'number') return null;
  await cfHandoffQueue;
  const entry = (await cfReadHandoffs())[tabId];
  if (!entry || !kinds.includes(entry.kind)) return null;
  await cfForgetHandoff(tabId);
  return { kind: entry.kind, payload: entry.payload };
}

async function cfForgetHandoff(tabId) {
  if (typeof tabId !== 'number') return;
  await cfHandoffQueue;
  const all = await cfReadHandoffs();
  if (!all[tabId]) return;
  delete all[tabId];
  await chrome.storage.session.set({ [CF_TAB_HANDOFF_KEY]: all });
}

chrome.tabs.onRemoved.addListener((tabId) => {
  cfForgetHandoff(tabId).catch(e => console.log('[BG] Request of closed tab', tabId, 'not removed:', e.message));
});
