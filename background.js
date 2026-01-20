// Background Service Worker - Routes messages and caches data in chrome.storage.local

let cachedData = null;
let offscreenCreated = false;

// Create offscreen document for file operations
async function ensureOffscreen() {
  if (offscreenCreated) return true;
  
  try {
    // Check if already exists
    const existing = await chrome.offscreen.hasDocument();
    if (existing) {
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
      
      case 'getData':
        // Return cached data
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
        
      case 'saveData':
        // Called by content-script after organizing - update cache and trigger file sync
        console.log('[BG] saveData received');
        cachedData = message.data;
        await chrome.storage.local.set({ cachedData });
        console.log('[BG] Cache updated:', cachedData.folders?.length, 'folders');
        // Tell popup to sync to disk
        try {
          await chrome.runtime.sendMessage({ action: 'syncToDisk' });
          console.log('[BG] Sent syncToDisk to popup');
        } catch (e) {
          console.log('[BG] Could not send to popup (probably closed):', e.message);
        }
        // Broadcast to content scripts
        const saveTabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
        for (const tab of saveTabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'dataUpdated' });
          } catch (e) {}
        }
        sendResponse({ success: true });
        break;
      
      case 'updateCache':
        // Called by popup after writing to JSON file
        cachedData = message.data;
        await chrome.storage.local.set({ cachedData });
        console.log('[BG] Cache updated:', cachedData.folders?.length, 'folders');
        // Broadcast to content scripts
        const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
        for (const tab of tabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'dataUpdated' });
          } catch (e) {}
        }
        sendResponse({ success: true });
        break;
        
      case 'dataUpdated':
        // Broadcast to all tabs
        const allTabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
        for (const tab of allTabs) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'dataUpdated' });
          } catch (e) {}
        }
        sendResponse({ success: true });
        break;
        
      case 'createFolder':
        if (!cachedData) await loadCachedData();
        cachedData.folders.push(message.folder);
        await chrome.storage.local.set({ cachedData });
        // Tell popup to sync to disk
        chrome.runtime.sendMessage({ action: 'syncToDisk', data: cachedData });
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
          await chrome.storage.local.set({ cachedData });
          // Tell popup to sync to disk
          chrome.runtime.sendMessage({ action: 'syncToDisk', data: cachedData });
        }
        sendResponse({ success: true });
        break;
        
      case 'scrapedChats':
        if (!cachedData) await loadCachedData();
        let unsorted = cachedData.folders.find(f => f.id === 'unsorted');
        if (!unsorted) {
          unsorted = { id: 'unsorted', category: 'Personal', name: 'Unsorted Chats', chats: [] };
          cachedData.folders.push(unsorted);
        }
        const existingIds = new Set();
        cachedData.folders.forEach(f => f.chats?.forEach(c => existingIds.add(c.id)));
        const newChats = message.chats.filter(c => !existingIds.has(c.id));
        console.log('[BG] scrapedChats: received', message.chats.length, ', new:', newChats.length);
        unsorted.chats.push(...newChats);
        console.log('[BG] unsorted folder now has', unsorted.chats.length, 'chats');
        console.log('[BG] cachedData.folders:', cachedData.folders.length, 'folders');
        
        // Save to storage first
        await chrome.storage.local.set({ cachedData });
        console.log('[BG] Saved to chrome.storage.local');
        
        // Tell popup to sync to disk
        try {
          await chrome.runtime.sendMessage({ action: 'syncToDisk' });
          console.log('[BG] Sent syncToDisk to popup');
        } catch (e) {
          console.log('[BG] Could not send to popup (probably closed):', e.message);
        }
        sendResponse({ success: true, count: newChats.length });
        break;
      
      case 'updateMetadata':
        if (!cachedData) await loadCachedData();
        if (message.metadata) {
          cachedData.metadata = { ...cachedData.metadata, ...message.metadata };
          await chrome.storage.local.set({ cachedData });
          console.log('[BG] Metadata updated:', cachedData.metadata);
          // Tell popup to sync
          chrome.runtime.sendMessage({ action: 'syncToDisk', data: cachedData });
        }
        sendResponse({ success: true });
        break;
        
      case 'saveExport':
        // Use offscreen document to write file
        try {
          await ensureOffscreen();
          const offscreenResponse = await chrome.runtime.sendMessage({
            action: 'offscreenWriteExport',
            filename: message.filename,
            content: message.content
          });
          sendResponse(offscreenResponse || { success: false, error: 'No response from offscreen' });
        } catch (e) {
          console.log('[BG] saveExport failed:', e.message);
          sendResponse({ success: false, error: e.message });
        }
        break;
      
      case 'exportChatById':
        // Export a single chat by ID - fetch from API and save
        try {
          await ensureOffscreen();
          const exportResponse = await chrome.runtime.sendMessage({
            action: 'offscreenExportChatById',
            chatId: message.chatId,
            chatTitle: message.chatTitle
          });
          sendResponse(exportResponse || { success: false, error: 'No response from offscreen' });
        } catch (e) {
          console.log('[BG] exportChatById failed:', e.message);
          sendResponse({ success: false, error: e.message });
        }
        break;
      
      case 'getExportedChat':
        // Get content of an exported chat
        try {
          await ensureOffscreen();
          const readResponse = await chrome.runtime.sendMessage({
            action: 'offscreenReadExport',
            chatId: message.chatId,
            chatTitle: message.chatTitle
          });
          sendResponse(readResponse || { success: false, error: 'No response from offscreen' });
        } catch (e) {
          console.log('[BG] getExportedChat failed:', e.message);
          sendResponse({ success: false, error: e.message });
        }
        break;
      
      case 'checkExportExists':
        // Check if an exported chat file exists
        try {
          await ensureOffscreen();
          const existsResponse = await chrome.runtime.sendMessage({
            action: 'offscreenCheckExportExists',
            chatId: message.chatId,
            chatTitle: message.chatTitle
          });
          sendResponse(existsResponse || { success: false, exists: false });
        } catch (e) {
          console.log('[BG] checkExportExists failed:', e.message);
          sendResponse({ success: false, exists: false });
        }
        break;
        
      case 'openOrganizer':
        let url = chrome.runtime.getURL('organizer/index.html');
        if (message.folderId) url += `?folder=${message.folderId}`;
        await chrome.tabs.create({ url });
        sendResponse({ success: true });
        break;
        
      case 'startAutoScrape':
        const existingTabs = await chrome.tabs.query({ url: 'https://claude.ai/recents' });
        let tab;
        if (existingTabs.length > 0) {
          tab = existingTabs[0];
          await chrome.tabs.update(tab.id, { active: true });
          await new Promise(resolve => setTimeout(resolve, 2000));
        } else {
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
        }
        
        let retries = 5;
        while (retries > 0) {
          try {
            await chrome.tabs.sendMessage(tab.id, { action: 'startScrape' });
            sendResponse({ success: true });
            return;
          } catch (error) {
            retries--;
            if (retries > 0) {
              await new Promise(resolve => setTimeout(resolve, 2000));
            } else {
              sendResponse({ success: false, error: 'Content script not ready. Refresh claude.ai/recents and try again.' });
            }
          }
        }
        break;
        
      default:
        sendResponse({ error: 'Unknown action: ' + message.action });
    }
  } catch (error) {
    console.error('[BG] Error:', error);
    sendResponse({ error: error.message });
  }
}