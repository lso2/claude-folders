// background.js
// Service worker that answers extension messages against the cached folder data.
// Globals: cachedData, currentAccountKey, offscreenCreated, accessWindowId, writerPort,
//          writerRequestId, acctKey, persist, broadcastDataUpdated, broadcastToClaudeTabs,
//          countChatsInData, overlapRatioWithScraped, ensureOffscreen, askOffscreen,
//          askWriterWindow, askFolderWorker, syncDataToDisk, openAccessWindow, fileImportedChat,
//          loadCachedData, countBgChats, handleMessage
// Notes: docs/notes/background.js.md

let cachedData = null;
let currentAccountKey = null;
let offscreenCreated = false;
let accessWindowId = null;
let writerPort = null;
let writerRequestId = 0;

// Each signed-in account keeps its own folders under cfData_<key>. `cachedData`
// is always a mirror of the active account so the organizer page and the
// offscreen disk-writer (both read `cachedData`) keep working unchanged.
function acctKey(key) { return 'cfData_' + (key || currentAccountKey || 'default'); }

async function persist() {
  if (!cachedData) return;
  const obj = { cachedData };
  if (currentAccountKey) obj[acctKey()] = cachedData;
  await chrome.storage.local.set(obj);
}

async function broadcastToClaudeTabs(message) {
  const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  for (const tab of tabs) {
    try { await chrome.tabs.sendMessage(tab.id, message); } catch (e) {}
  }
}

async function broadcastDataUpdated() {
  await broadcastToClaudeTabs({ action: 'dataUpdated' });
}

function countChatsIn(data) {
  let n = 0;
  data?.folders?.forEach(f => { if (f.chats) n += f.chats.length; });
  return n;
}

// How much of the data we currently hold actually belongs to the just-scraped
// account. Near zero means the held data is a different account's, so the caller
// starts this account fresh instead of mixing the two together.
function overlapRatioWithScraped(scrapedIds) {
  const haveIds = [];
  cachedData?.folders?.forEach(f => f.chats?.forEach(c => haveIds.push(c.id)));
  if (haveIds.length < 50 || scrapedIds.size < 50) return 1; // too little to judge - keep
  let overlap = 0;
  haveIds.forEach(id => { if (scrapedIds.has(id)) overlap++; });
  return overlap / haveIds.length;
}

// The offscreen document performs every data-folder write and Chrome can close it between calls
async function ensureOffscreen() {
  try {
    if (await chrome.offscreen.hasDocument()) {
      offscreenCreated = true;
      return true;
    }
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['LOCAL_STORAGE'],
      justification: 'Write export files to user folder via FileSystem API'
    });
    offscreenCreated = true;
    console.log('[BG] Offscreen document created');
    return true;
  } catch (e) {
    console.log('[BG] Offscreen creation failed:', e.message);
    return false;
  }
}

// Writes the cached data to the data folder
async function syncDataToDisk() {
  const response = await askFolderWorker({ action: 'folderSyncToDisk' }, { success: false });
  console.log('[BG] syncToDisk:', response?.success, response?.error || '');
  return response;
}

// Sends one folder request to the offscreen document, creating it first when needed
async function askOffscreen(request, fallback) {
  const ready = await ensureOffscreen();
  if (!ready) return { ...fallback, error: 'The offscreen writer could not be created' };
  const response = await chrome.runtime.sendMessage({ ...request, target: 'offscreen' });
  return response || { ...fallback, error: 'No response from offscreen' };
}

// Replies from the open access window are received over its port. Null means no reply within 30 seconds.
function askWriterWindow(request) {
  return new Promise((resolve) => {
    const port = writerPort;
    if (!port) return resolve(null);
    const id = ++writerRequestId;
    const onReply = (msg) => {
      if (!msg || msg.id !== id) return;
      clearTimeout(timer);
      port.onMessage.removeListener(onReply);
      resolve(msg.result || null);
    };
    const timer = setTimeout(() => {
      port.onMessage.removeListener(onReply);
      resolve(null);
    }, 30000);
    port.onMessage.addListener(onReply);
    try {
      port.postMessage({ id, request });
    } catch (e) {
      clearTimeout(timer);
      port.onMessage.removeListener(onReply);
      resolve(null);
    }
  });
}

// Measured 2026-10-27: the offscreen document kept seeing the folder permission as "prompt"
// while the access window held the user's grant. The access window, when open, performs
// folder requests; otherwise the offscreen document does.
async function askFolderWorker(request, fallback) {
  if (writerPort) {
    const viaWindow = await askWriterWindow(request);
    if (viaWindow) return viaWindow;
  }
  return askOffscreen(request, fallback);
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'folder-writer') return;
  writerPort = port;
  port.onDisconnect.addListener(() => {
    if (writerPort === port) writerPort = null;
  });
});

// The access window is an extension page, the only place a click can re-grant
// the File System Access permission for the data folder
async function openAccessWindow() {
  if (accessWindowId !== null) {
    try {
      await chrome.windows.update(accessWindowId, { focused: true });
      return;
    } catch (e) {
      accessWindowId = null;
    }
  }
  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('access/index.html'),
    type: 'popup',
    width: 460,
    height: 380,
    focused: true
  });
  accessWindowId = win && typeof win.id === 'number' ? win.id : null;
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === accessWindowId) accessWindowId = null;
});

// An imported chat is filed under a folder named for the project it was shared in
async function fileImportedChat(chat, folderId, folderName, category) {
  if (!cachedData) await loadCachedData();
  if (!Array.isArray(cachedData.categories)) cachedData.categories = [];
  if (!cachedData.categories.includes(category)) cachedData.categories.push(category);
  let folder = cachedData.folders.find(f => f.id === folderId);
  if (!folder) {
    folder = { id: folderId, category, name: folderName, chats: [] };
    cachedData.folders.push(folder);
  }
  cachedData.folders.forEach(f => { f.chats = (f.chats || []).filter(c => c.id !== chat.id); });
  folder.chats.push(chat);
  await persist();
  await syncDataToDisk();
  await broadcastDataUpdated();
  return { success: true, folderId: folder.id };
}

// Load cached data on startup
chrome.runtime.onStartup.addListener(loadCachedData);
chrome.runtime.onInstalled.addListener(loadCachedData);

async function loadCachedData() {
  try {
    const result = await chrome.storage.local.get('cachedData');
    if (result.cachedData && result.cachedData.folders) {
      cachedData = result.cachedData;
      console.log('[BG] Loaded cache:', cachedData.folders?.length, 'folders,', countBgChats(), 'chats');
    } else {
      cachedData = { folders: [], categories: ['Personal', 'Work', 'Projects'], metadata: { userName: 'James', userInitial: 'J' } };
      console.log('[BG] No cache found, using defaults');
    }
  } catch (e) {
    console.log('[BG] Error loading cache:', e.message);
    cachedData = { folders: [], categories: ['Personal', 'Work', 'Projects'], metadata: { userName: 'James', userInitial: 'J' } };
  }
}

function countBgChats() {
  let count = 0;
  if (cachedData?.folders) {
    cachedData.folders.forEach(f => { if (f.chats) count += f.chats.length; });
  }
  return count;
}

// Initialize cache
loadCachedData();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender, sendResponse);
  return true;
});

async function handleMessage(message, sender, sendResponse) {
  try {
    switch (message.action) {

      case 'setAccount': {
        // Switch the active account. The panel must never go blank: if this
        // account has no slot yet, fall back to the last working data (or the
        // blob the earlier build stashed) so existing folders stay visible.
        const key = message.accountKey || 'default';
        if (key === currentAccountKey && cachedData && cachedData.folders && cachedData.folders.length) {
          sendResponse({ success: true }); break;
        }
        const nonEmpty = d => d && Array.isArray(d.folders) && d.folders.length;
        const slot = await chrome.storage.local.get(acctKey(key));
        let data = slot[acctKey(key)];
        if (!nonEmpty(data)) {
          // Never blank: recover the richest dataset stored under any key (the
          // active mirror, the old global cache, a stash, or a prior slot) so
          // the earlier build's overwrite can't lose the user's folders.
          const all = await chrome.storage.local.get(null);
          let best = null, bestN = -1;
          for (const [k, v] of Object.entries(all)) {
            if (k === acctKey(key)) continue;
            if (v && Array.isArray(v.folders)) {
              const n = countChatsIn(v);
              if (n > bestN) { bestN = n; best = v; }
            }
          }
          data = nonEmpty(best) ? best : (data || { folders: [], categories: ['Personal', 'Work', 'Projects'], metadata: {} });
        }
        currentAccountKey = key;
        cachedData = data;
        // The offscreen writer has no page context, so the key it needs to name
        // this account's data file is persisted here
        await chrome.storage.local.set({ activeAccountKey: key });
        console.log('[BG] Account', key, '-', countChatsIn(cachedData), 'chats');
        await persist();
        await broadcastDataUpdated();
        sendResponse({ success: true });
        break;
      }

      case 'getData': {
        // Return cached data for the active account
        if (!cachedData) await loadCachedData();
        const allChats = [];
        cachedData.folders?.forEach(f => f.chats?.forEach(c => allChats.push(c)));
        sendResponse({
          success: true,
          folders: cachedData.folders || [],
          categories: cachedData.categories || ['Personal', 'Work', 'Projects'],
          metadata: cachedData.metadata || {},
          allChats
        });
        break;
      }
        
      case 'saveData':
        // Called by content-script after organizing - update cache and trigger file sync
        console.log('[BG] saveData received');
        cachedData = message.data;
        await persist();
        console.log('[BG] Cache updated:', cachedData.folders?.length, 'folders');
        // Write to the user's folder via the offscreen document
        await syncDataToDisk();
        await broadcastDataUpdated();
        sendResponse({ success: true });
        break;
      
      case 'updateCache':
        // Called by popup/organizer after writing to JSON file
        cachedData = message.data;
        await persist();
        console.log('[BG] Cache updated:', cachedData.folders?.length, 'folders');
        await broadcastDataUpdated();
        sendResponse({ success: true });
        break;

      case 'dataUpdated':
        await broadcastDataUpdated();
        sendResponse({ success: true });
        break;
        
      case 'createFolder':
        if (!cachedData) await loadCachedData();
        cachedData.folders.push(message.folder);
        await persist();
        // Tell popup to sync to disk
        syncDataToDisk();
        sendResponse({ success: true });
        break;
        
      case 'assignChatToFolder':
        if (!cachedData) await loadCachedData();
        const folder = cachedData.folders.find(f => f.id === message.folderId);
        if (folder) {
          // Remove from other folders first
          cachedData.folders.forEach(f => {
            f.chats = f.chats.filter(c => c.id !== message.chat.id);
          });
          folder.chats.push(message.chat);
          await persist();
          // Tell popup to sync to disk
          syncDataToDisk();
        }
        sendResponse({ success: true });
        break;
        
      case 'scrapedChats':
        if (!cachedData) await loadCachedData();
        // If the data we hold is a different account's (almost no overlap with
        // what we just scraped), start this account fresh so the two never mix.
        if (overlapRatioWithScraped(new Set((message.chats || []).map(c => c.id))) < 0.10) {
          console.log('[BG] Scraped set does not match held data - starting fresh for this account');
          cachedData = { folders: [], categories: cachedData.categories || ['Personal', 'Work', 'Projects'], metadata: cachedData.metadata || {} };
        }
        let unsorted = cachedData.folders.find(f => f.id === 'unsorted');
        if (!unsorted) {
          unsorted = { id: 'unsorted', category: 'Personal', name: 'Unsorted Chats', chats: [] };
          cachedData.folders.push(unsorted);
        }
        // Index every chat we already have by id (across all folders)
        const existingById = new Map();
        cachedData.folders.forEach(f => f.chats?.forEach(c => existingById.set(c.id, c)));

        let newCount = 0;
        let updatedCount = 0;
        for (const incoming of message.chats) {
          const current = existingById.get(incoming.id);
          if (current) {
            // Already organized somewhere: refresh changed metadata in place,
            // but keep the chat's folder, tags, snippet and exported flag
            if (incoming.title && incoming.title !== current.title) { current.title = incoming.title; updatedCount++; }
            if (incoming.date) current.date = incoming.date;
            if (incoming.relativeDate) current.relativeDate = incoming.relativeDate;
            if (incoming.url) current.url = incoming.url;
          } else {
            // Genuinely new: drop it into Unsorted and remember it
            unsorted.chats.push(incoming);
            existingById.set(incoming.id, incoming);
            newCount++;
          }
        }
        console.log('[BG] scrapedChats: received', message.chats.length, ', new:', newCount, ', updated:', updatedCount);
        console.log('[BG] unsorted folder now has', unsorted.chats.length, 'chats');
        
        // Save to storage first
        await persist();
        console.log('[BG] Saved to chrome.storage.local');

        // Write to the user's folder via the offscreen document
        await syncDataToDisk();
        sendResponse({ success: true, count: newCount, updated: updatedCount });
        break;
      
      case 'updateMetadata':
        if (!cachedData) await loadCachedData();
        if (message.metadata) {
          cachedData.metadata = { ...cachedData.metadata, ...message.metadata };
          await persist();
          console.log('[BG] Metadata updated:', cachedData.metadata);
          // Tell popup to sync
          syncDataToDisk();
        }
        sendResponse({ success: true });
        break;
        
      case 'saveExport':
        sendResponse(await askFolderWorker(
          { action: 'folderWriteExport', filename: message.filename, content: message.content },
          { success: false, code: 'write' }
        ));
        break;

      case 'checkWriteAccess':
        sendResponse(await askFolderWorker({ action: 'folderCheckAccess' }, { success: false }));
        break;

      case 'openFolderAccess':
        await openAccessWindow();
        sendResponse({ success: true });
        break;

      case 'folderAccessChanged':
        // Sent by the access window once the folder can be written again
        await broadcastToClaudeTabs({ action: 'folderAccessChanged', written: message.written || 0, failed: message.failed || 0 });
        sendResponse({ success: true });
        break;

      case 'fileImportedChat':
        sendResponse(await fileImportedChat(message.chat, message.folderId, message.folderName, message.category || 'Shared'));
        break;

      case 'exportChatById':
        sendResponse(await askFolderWorker(
          { action: 'folderExportChatById', chatId: message.chatId, chatTitle: message.chatTitle, orgId: message.orgId },
          { success: false }
        ));
        break;

      case 'getExportedChat':
        sendResponse(await askFolderWorker(
          { action: 'folderReadExport', chatId: message.chatId, chatTitle: message.chatTitle },
          { success: false }
        ));
        break;

      case 'listExports':
        // One directory read for the whole sync, not one message per chat
        sendResponse(await askFolderWorker({ action: 'folderListExports' }, { success: false, files: [] }));
        break;

      case 'checkExportExists':
        sendResponse(await askFolderWorker(
          { action: 'folderCheckExportExists', chatId: message.chatId, chatTitle: message.chatTitle },
          { success: false, exists: false }
        ));
        break;

      case 'openOrganizer':
        let url = chrome.runtime.getURL('organizer/index.html');
        if (message.folderId) url += `?folder=${message.folderId}`;
        await chrome.tabs.create({ url });
        sendResponse({ success: true });
        break;
        
      case 'startAutoScrape': {
        // Sync no longer needs the recents page, so any open Claude tab is used
        // and the active one is preferred. A new tab is created only when Claude
        // is not open at all, which is what used to force a second recents tab
        // and a fresh scroll every time.
        const claudeTabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
        let tab = claudeTabs.find(t => t.active) || claudeTabs[0];

        if (!tab) {
          tab = await chrome.tabs.create({ url: 'https://claude.ai/recents', active: true });
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
          await new Promise(resolve => setTimeout(resolve, 3000));
        } else {
          console.log('[BG] Reusing the open Claude tab', tab.id, 'for this sync');
        }

        let retries = 5;
        while (retries > 0) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'startScrape' });
            sendResponse({ success: true, reusedTab: claudeTabs.length > 0 });
            return;
          } catch (error) {
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              sendResponse({ success: false, error: 'The Claude tab did not answer. Reload claude.ai and try again.' });
            }
          }
        }
        break;
      }

      default:
        sendResponse({ error: 'Unknown action: ' + message.action });
    }
  } catch (error) {
    console.log('[BG] Error:', error.message);
    sendResponse({ error: error.message });
  }
}