// content/cf-data.js
// Loads the folder data from the background and refreshes the injected UI with it.
// Globals: knownChatIds, pendingNewChats, loadKnownChatIds, updateCurrentChatId, loadData,
//          updateUI, updateFoldersPanel, injectUI
// Notes: docs/notes/content/cf-data.js.md

let knownChatIds = new Set();
let pendingNewChats = [];

async function loadKnownChatIds() {
  try {
    const result = await chrome.storage.local.get([cfKnownKey(), cfPendingKey()]);
    if (result[cfKnownKey()]) {
      knownChatIds = new Set(result[cfKnownKey()]);
    }
    if (result[cfPendingKey()]) {
      pendingNewChats = result[cfPendingKey()];
    }
    
    // Also add all chats from folders to known
    folders.forEach(f => {
      if (f.chats) f.chats.forEach(c => knownChatIds.add(c.id));
    });
    
    console.log('[MONITOR] Known chat IDs:', knownChatIds.size, 'Pending:', pendingNewChats.length);
  } catch (e) {
    console.log('[MONITOR] Error loading known IDs:', e.message);
  }
}

function updateCurrentChatId() {
  const ref = cfConversationRef();
  currentChatId = ref ? ref.id : null;
}

async function loadData() {
  console.log('[CONTENT] loadData');
  try {
    const response = await chrome.runtime.sendMessage({ action: 'getData' });
    if (response?.success) {
      folders = response.folders || [];
      categories = response.categories || [];
      allChats = response.allChats || [];
      metadata = response.metadata || {};
      cfLegacyAvailable = !!response.legacyAvailable;
      console.log('[CONTENT] Got', folders.length, 'folders,', allChats.length, 'chats');
      
      // If no data from background, try reading cache directly
      if (folders.length === 0) {
        try {
          const result = await chrome.storage.local.get('cachedData');
          if (result.cachedData && result.cachedData.folders) {
            folders = result.cachedData.folders;
            categories = result.cachedData.categories || [];
            metadata = result.cachedData.metadata || {};
            allChats = [];
            folders.forEach(f => { if (f.chats) allChats.push(...f.chats); });
            console.log('[CONTENT] Got from cache:', folders.length, 'folders,', allChats.length, 'chats');
          }
        } catch (e) {
          console.log('[CONTENT] Cache fallback failed:', e.message);
        }
      }
      
      updateUI();
      updateFoldersPanel();
    }
  } catch (error) {
    console.log('[CONTENT] Error loading:', error.message);
    // Try cache directly on error
    try {
      const result = await chrome.storage.local.get('cachedData');
      if (result.cachedData && result.cachedData.folders) {
        folders = result.cachedData.folders;
        categories = result.cachedData.categories || [];
        metadata = result.cachedData.metadata || {};
        allChats = [];
        folders.forEach(f => { if (f.chats) allChats.push(...f.chats); });
        console.log('[CONTENT] Cache fallback:', folders.length, 'folders');
        updateUI();
        updateFoldersPanel();
      }
    } catch (e) {
      console.log('[CONTENT] Cache fallback failed:', e.message);
    }
  }
}

function updateUI() {
  if (cfOnConversationPage()) {
    injectChatButton();
  }
}

function updateFoldersPanel() {
  const panel = document.querySelector('.claude-folders-panel');
  if (panel && panelExpanded) {
    renderPanelContent(panel);
  }
}

function injectUI() {
  injectSidebar();
  injectStyles();
  if (cfOnConversationPage()) {
    injectChatButton();
  }
}
