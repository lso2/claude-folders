// Claude Folders content script - startup, pending work and the folders data load

function init() {
  console.log('[CONTENT] Claude Folders loaded');
  updateCurrentChatId();
  scrapeUserInfo();

  // Everything that reads per-account data waits until the key is resolved and
  // handed to the background, so the first load already targets this account.
  // Which organization this tab is signed into, so a chat belonging to one of the
  // other organizations on the login can be labelled instead of looking identical
  if (window.chatExporter?.getActiveOrganizationId) {
    window.chatExporter.getActiveOrganizationId()
      .then(id => { cfActiveOrgId = id || null; })
      .catch(() => {});
  }

  cfAccountReady = cfInitAccount();
  cfAccountReady.then(() => {
    loadData();
    checkPendingSync();
    startNewChatMonitor();
  });

  // Check if we need to auto-paste organize data (account-independent)
  checkPendingOrganizeData();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(injectUI, 1000));
  } else {
    setTimeout(injectUI, 1000);
  }
  
  observeUrlChanges();
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[CONTENT] Message:', message.action);
    if (message.action === 'dataUpdated') {
      loadData();
      sendResponse({ received: true });
    }
    if (message.action === 'startScrape') {
      scrapeRecentsPage(true);
      sendResponse({ received: true });
    }
    return true;
  });
}

async function checkPendingSync() {
  // Check if we navigated here to run a sync
  if (sessionStorage.getItem('cf-pending-sync') === 'true') {
    sessionStorage.removeItem('cf-pending-sync');
    console.log('[CONTENT] Running pending sync after navigation to recents');
    
    // Only run if we're actually on recents page
    if (window.location.pathname.includes('/recents')) {
      // Wait for page to fully load
      setTimeout(() => scrapeRecentsPage(), 2000);
    } else {
      console.log('[CONTENT] Not on recents page, skipping sync');
    }
  }
}

async function checkPendingOrganizeData() {
  // Only on /new page
  if (!window.location.pathname.includes('/new')) return;
  
  try {
    const result = await chrome.storage.local.get(['pendingOrganizePrompt', 'pendingOrganizeAnalysis']);
    if (!result.pendingOrganizePrompt) return;
    
    console.log('[CONTENT] Found pending organize prompt, will paste...');
    
    // Clear it immediately so it doesn't paste again on refresh
    await chrome.storage.local.remove(['pendingOrganizePrompt', 'pendingOrganizeAnalysis']);
    
    // Wait for the input to be ready
    setTimeout(async () => {
      await pasteOrganizePrompt(result.pendingOrganizePrompt);
    }, 2000);
  } catch (e) {
    console.log('[CONTENT] Error checking pending data:', e.message);
  }
}

async function pasteOrganizePrompt(prompt) {
  await new Promise(r => setTimeout(r, 1500));
  
  const textInput = document.querySelector('[contenteditable="true"]') || 
                    document.querySelector('textarea') ||
                    document.querySelector('.ProseMirror');
  
  if (textInput) {
    if (textInput.tagName === 'TEXTAREA') {
      textInput.value = prompt;
      textInput.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      textInput.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, prompt);
    }
    showNotification('Prompt pasted! Send to Claude, then use "Apply Response" button.');
  } else {
    navigator.clipboard.writeText(prompt);
    showNotification('Prompt copied to clipboard - paste it manually');
  }
}

// ============ PASSIVE NEW CHAT MONITOR ============

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

// Read the signed-in name, initial and team off the account row so the panel
// header shows who the folders belong to. The row's class names change often, so
// the values come from its leaf text spans: the single-character avatar first,
// then the name, then the team, with separators and icon glyphs discarded.
function scrapeUserInfo() {
  const tryCount = [1000, 3000, 6000];

  tryCount.forEach(delay => {
    setTimeout(() => {
      try {
        const userBtn = document.querySelector('[data-testid="user-menu-button"]');
        if (!userBtn) {
          console.log('[CONTENT] Account row not found yet');
          return;
        }

        const parts = Array.from(userBtn.querySelectorAll('span'))
          .filter(span => !span.querySelector('span'))
          .map(span => cfStripGlyphs(span.textContent))
          .filter(text => text.length > 0 && !/^[\u00b7\u2022|,\-\u2013\u2014/]+$/.test(text));

        let userInitial = '';
        if (parts.length && Array.from(parts[0]).length === 1) userInitial = parts.shift();
        const userName = parts[0] || '';
        const userTeam = parts[1] || '';
        if (!userInitial && userName) userInitial = Array.from(userName)[0].toUpperCase();

        console.log('[CONTENT] Account:', userName, '/', userTeam, '/', userInitial);

        if (userName) {
          chrome.runtime.sendMessage({
            action: 'updateMetadata',
            metadata: { userName, userInitial: userInitial || 'U', userTeam }
          }).catch(() => {});
        }
      } catch (e) {
        console.log('[CONTENT] Account read error:', e.message);
      }
    }, delay);
  });
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
  if (window.location.pathname.startsWith('/chat/')) {
    injectChatButton();
  }
}
