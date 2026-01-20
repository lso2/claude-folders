// Content Script - Injects folder UI into claude.ai

let folders = [];
let categories = [];
let allChats = [];
let metadata = {};
let currentChatId = null;
let sidebarInjected = false;
let panelExpanded = false;

init();

function init() {
  console.log('[CONTENT] Claude Folders loaded');
  updateCurrentChatId();
  scrapeUserInfo();
  loadData();
  
  // Check if we navigated here to run a sync
  checkPendingSync();
  
  // Check if we need to auto-paste organize data
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
  
  // Start passive monitoring for new chats
  startNewChatMonitor();
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

let monitorInterval = null;
let knownChatIds = new Set();
let pendingNewChats = [];

async function startNewChatMonitor() {
  // Load known chat IDs from storage
  await loadKnownChatIds();
  
  // Check every 30 seconds
  if (monitorInterval) clearInterval(monitorInterval);
  monitorInterval = setInterval(checkForNewChats, 30000);
  
  // Initial check after 5 seconds
  setTimeout(checkForNewChats, 5000);
  
  console.log('[MONITOR] Started passive chat monitor');
}

async function loadKnownChatIds() {
  try {
    const result = await chrome.storage.local.get(['knownChatIds', 'pendingNewChats']);
    if (result.knownChatIds) {
      knownChatIds = new Set(result.knownChatIds);
    }
    if (result.pendingNewChats) {
      pendingNewChats = result.pendingNewChats;
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

async function checkForNewChats() {
  // Scan visible chat links
  const chatLinks = document.querySelectorAll('a[href*="/chat/"]');
  let newFound = 0;
  
  for (const link of chatLinks) {
    const href = link.getAttribute('href');
    if (!href?.includes('/chat/')) continue;
    const match = href.match(/\/chat\/([a-f0-9-]+)/i);
    if (!match) continue;
    const chatId = match[1];
    
    if (!knownChatIds.has(chatId) && !pendingNewChats.includes(chatId)) {
      pendingNewChats.push(chatId);
      newFound++;
    }
  }
  
  if (newFound > 0) {
    console.log('[MONITOR] Found', newFound, 'new chats. Pending total:', pendingNewChats.length);
    await chrome.storage.local.set({ pendingNewChats });
    
    // Check if we should show notification
    if (pendingNewChats.length >= 30) {
      maybeShowSyncNotification();
    }
  }
}

function maybeShowSyncNotification() {
  // Only show when not in an active chat
  const path = window.location.pathname;
  const isInChat = /\/chat\/[a-f0-9-]+/i.test(path);
  
  if (isInChat) {
    console.log('[MONITOR] In active chat, will show notification later');
    return;
  }
  
  // Don't show if already visible
  if (document.getElementById('cf-sync-notification')) return;
  
  showSyncNotification();
}

function showSyncNotification() {
  const existing = document.getElementById('cf-sync-notification');
  if (existing) existing.remove();
  
  const bar = document.createElement('div');
  bar.id = 'cf-sync-notification';
  bar.innerHTML = `
    <div style="
      position: fixed;
      top: 12px;
      left: 50%;
      transform: translateX(-50%);
      background: linear-gradient(135deg, #d97706, #b45309);
      color: white;
      padding: 10px 16px;
      border-radius: 8px;
      font-size: 13px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      display: flex;
      align-items: center;
      gap: 12px;
      z-index: 999999;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    ">
      <span>${pendingNewChats.length} new chats detected</span>
      <button id="cf-sync-btn" style="
        background: white;
        color: #b45309;
        border: none;
        padding: 6px 12px;
        border-radius: 6px;
        font-weight: 600;
        font-size: 12px;
        cursor: pointer;
      ">Sync Now</button>
      <button id="cf-dismiss-btn" style="
        background: transparent;
        color: white;
        border: none;
        padding: 4px 8px;
        font-size: 16px;
        cursor: pointer;
        opacity: 0.7;
      ">×</button>
    </div>
  `;
  
  document.body.appendChild(bar);
  
  document.getElementById('cf-sync-btn').addEventListener('click', async () => {
    bar.remove();
    await runSyncFromNotification();
  });
  
  document.getElementById('cf-dismiss-btn').addEventListener('click', async () => {
    bar.remove();
    // Just dismiss, don't clear pending - will show again later
  });
}

async function runSyncFromNotification() {
  // Always navigate to recents page first
  const currentPath = window.location.pathname;
  if (!currentPath.includes('/recents')) {
    showNotification('Navigating to Recents to sync...');
    
    // Mark pending as known so we don't re-detect them
    pendingNewChats.forEach(id => knownChatIds.add(id));
    await chrome.storage.local.set({ 
      knownChatIds: Array.from(knownChatIds),
      pendingNewChats: []
    });
    pendingNewChats = [];
    
    // Set flag and navigate - scrape will run after page loads
    sessionStorage.setItem('cf-pending-sync', 'true');
    window.location.href = 'https://claude.ai/recents';
  } else {
    // Already on recents, run scrape directly
    showNotification('Syncing from Recents page...');
    pendingNewChats.forEach(id => knownChatIds.add(id));
    await chrome.storage.local.set({ 
      knownChatIds: Array.from(knownChatIds),
      pendingNewChats: []
    });
    pendingNewChats = [];
    await scrapeRecentsPage();
  }
}

// Re-check when URL changes (might leave a chat)
function onUrlChangeForMonitor() {
  if (pendingNewChats.length >= 30) {
    setTimeout(maybeShowSyncNotification, 1000);
  }
}

function scrapeUserInfo() {
  // Try multiple times with increasing delay
  const tryCount = [1000, 3000, 6000];
  
  tryCount.forEach(delay => {
    setTimeout(() => {
      try {
        // Find the user menu button
        const userBtn = document.querySelector('[data-testid="user-menu-button"]');
        if (!userBtn) {
          console.log('[CONTENT] User menu button not found');
          return;
        }
        
        // Get the initial from the avatar (single letter in circle)
        const avatar = userBtn.querySelector('.font-bold');
        const userInitial = avatar?.textContent?.trim() || 'U';
        
        // Find the flex-col container with the name/team spans
        const textContainer = userBtn.querySelector('.flex-col');
        if (!textContainer) {
          console.log('[CONTENT] Text container not found');
          return;
        }
        
        // Get all spans inside - first is name, second is team
        const spans = textContainer.querySelectorAll('span');
        let userName = null;
        let userTeam = null;
        
        if (spans.length >= 1) {
          userName = spans[0]?.textContent?.trim();
        }
        if (spans.length >= 2) {
          userTeam = spans[1]?.textContent?.trim();
        }
        
        console.log('[CONTENT] Scraped user:', userName, userTeam, userInitial);
        
        if (userName && userName.length > 0) {
          chrome.runtime.sendMessage({ 
            action: 'updateMetadata', 
            metadata: { 
              userName: userName, 
              userInitial: userInitial,
              userTeam: userTeam || ''
            } 
          }).catch(() => {});
        }
      } catch (e) {
        console.log('[CONTENT] User scrape error:', e.message);
      }
    }, delay);
  });
}

function updateCurrentChatId() {
  const match = window.location.pathname.match(/\/chat\/([^\/]+)/);
  currentChatId = match ? match[1] : null;
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
  if (window.location.pathname.startsWith('/chat/')) {
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

function injectStyles() {
  if (document.getElementById('claude-folders-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'claude-folders-styles';
  style.textContent = `
    .claude-folders-panel {
      position: fixed;
      left: 260px;
      top: 0;
      width: 280px;
      height: 100vh;
      background: #2a2a28;
      border-right: 1px solid #3d3d3a;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      box-shadow: 4px 0 12px rgba(0,0,0,0.3);
    }
    .folders-panel-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px;
      border-bottom: 1px solid #3d3d3a;
      flex-shrink: 0;
    }
    .folders-panel-header h2 {
      margin: 0;
      font-size: 16px;
      color: #e8e6e3;
      font-weight: 500;
    }
    .panel-actions {
      display: flex;
      gap: 8px;
    }
    .panel-btn {
      background: transparent;
      border: none;
      color: #9c9a92;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .panel-btn:hover {
      background: #3d3d3a;
      color: #e8e6e3;
    }
    .panel-text-btn {
      background: transparent;
      border: none;
      color: #9c9a92;
      cursor: pointer;
      padding: 4px 8px;
      border-radius: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 12px;
    }
    .panel-text-btn:hover {
      background: #3d3d3a;
      color: #e8e6e3;
    }
    .folders-panel-actions {
      padding: 8px 12px;
      border-bottom: 1px solid #3d3d3a;
      flex-shrink: 0;
    }
    .ask-claude-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .ask-claude-btn:hover {
      background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);
      transform: translateY(-1px);
    }
    .apply-categories-btn {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 10px 12px;
      margin-top: 8px;
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      border: none;
      border-radius: 6px;
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .apply-categories-btn:hover {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
      transform: translateY(-1px);
    }
    .folders-panel-content {
      flex: 1;
      overflow-y: auto;
      padding: 8px 0;
    }
    .folders-empty {
      padding: 40px 20px;
      text-align: center;
      color: #9c9a92;
    }
    .folder-category-group {
      margin-bottom: 8px;
    }
    .folder-category-header {
      padding: 8px 16px;
      font-size: 11px;
      font-weight: 600;
      color: #9c9a92;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .folder-panel-item {
      display: flex;
      align-items: center;
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .folder-panel-item:hover {
      background: #3d3d3a;
    }
    .folder-panel-name {
      flex: 1;
      color: #e8e6e3;
      font-size: 14px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .folder-panel-count {
      color: #9c9a92;
      font-size: 12px;
      margin-left: 8px;
    }
    .folder-expand-icon {
      margin-left: 4px;
      transition: transform 0.15s;
      opacity: 0.6;
    }
    .folder-chats-list {
      background: #232321;
      padding: 4px 0;
    }
    .folder-chat-link {
      display: block;
      padding: 6px 16px 6px 38px;
      color: #a8a6a0;
      font-size: 12px;
      text-decoration: none;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: all 0.1s;
    }
    .folder-chat-link:hover {
      background: #3d3d3a;
      color: #e8e6e3;
    }
    .folder-chat-more {
      padding: 6px 16px 6px 38px;
      color: #7a786e;
      font-size: 11px;
      font-style: italic;
    }
    .folder-load-more-btn {
      display: block;
      width: calc(100% - 32px);
      margin: 6px 16px 6px 16px;
      padding: 8px;
      background: #2a2a28;
      border: 1px dashed #4a4a48;
      border-radius: 6px;
      color: #d97706;
      font-size: 12px;
      cursor: pointer;
      transition: all 0.15s;
      text-align: center;
    }
    .folder-load-more-btn:hover {
      background: #3a3a38;
      border-style: solid;
      color: #f59e0b;
    }
    .panel-folders-view {
      flex: 1;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      min-height: 0;
    }
    .panel-analytics-view {
      flex: 1;
      overflow-y: auto;
      padding: 12px;
    }
    .panel-analytics-header {
      margin-bottom: 12px;
    }
    .panel-donut-container {
      display: flex;
      justify-content: center;
      margin: 16px 0;
    }
    .panel-analytics-legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-bottom: 12px;
    }
    .panel-legend-item {
      display: flex;
      align-items: center;
      gap: 4px;
      font-size: 10px;
      color: #9c9a92;
    }
    .panel-legend-color {
      width: 8px;
      height: 8px;
      border-radius: 2px;
    }
    .panel-analytics-stats {
      background: #232321;
      border: 1px solid #3d3d3a;
      border-radius: 6px;
      padding: 10px;
    }
    .panel-stat-row {
      display: flex;
      justify-content: space-between;
      padding: 4px 0;
      font-size: 11px;
      border-bottom: 1px solid #3d3d3a;
    }
    .panel-stat-row:last-child {
      border-bottom: none;
    }
    .panel-stat-label { color: #9c9a92; }
    .panel-stat-value { color: #e8e6e3; font-weight: 500; }
    .claude-folders-btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 12px;
      margin-left: 12px;
      background: #3d3d3a;
      border: 1px solid #4d4d4a;
      border-radius: 6px;
      color: #e8e6e3;
      font-size: 13px;
      cursor: pointer;
      transition: all 0.15s;
    }
    .claude-folders-btn:hover {
      background: #4d4d4a;
    }
    .claude-folders-picker {
      position: fixed;
      background: #2a2a28;
      border: 1px solid #3d3d3a;
      border-radius: 8px;
      box-shadow: 0 8px 24px rgba(0,0,0,0.4);
      z-index: 10001;
      min-width: 280px;
      max-width: 350px;
      max-height: 90vh;
      display: flex;
      flex-direction: column;
    }
    .folders-picker-header {
      padding: 12px 16px;
      font-size: 13px;
      font-weight: 500;
      color: #9c9a92;
      border-bottom: 1px solid #3d3d3a;
      flex-shrink: 0;
    }
    .folders-picker-list {
      flex: 1;
      overflow-y: auto;
      max-height: 50vh;
    }
    .folder-picker-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 16px;
      cursor: pointer;
      transition: background 0.15s;
    }
    .folder-picker-item:hover {
      background: #3d3d3a;
    }
    .folder-picker-item .folder-category {
      font-size: 10px;
      color: #9c9a92;
      text-transform: uppercase;
    }
    .folder-picker-item .folder-name {
      color: #e8e6e3;
      font-size: 14px;
    }
    .folder-picker-divider {
      height: 1px;
      background: #3d3d3a;
      margin: 8px 0;
    }
    .folder-picker-new {
      padding: 12px 16px;
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .new-folder-input {
      padding: 8px 12px;
      background: #1a1a18;
      border: 1px solid #3d3d3a;
      border-radius: 6px;
      color: #e8e6e3;
      font-size: 13px;
    }
    .new-folder-select {
      padding: 8px 12px;
      background: #1a1a18;
      border: 1px solid #3d3d3a;
      border-radius: 6px;
      color: #e8e6e3;
      font-size: 13px;
    }
    .create-folder-btn {
      padding: 8px 16px;
      background: #b87333;
      border: none;
      border-radius: 6px;
      color: white;
      font-size: 13px;
      cursor: pointer;
    }
    .create-folder-btn:hover {
      background: #c98040;
    }
    .claude-folders-notification {
      position: fixed;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%) translateY(100px);
      background: #2a2a28;
      border: 1px solid #3d3d3a;
      padding: 12px 24px;
      border-radius: 8px;
      color: #e8e6e3;
      font-size: 14px;
      z-index: 10002;
      transition: transform 0.3s ease;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }
    .claude-folders-notification.show {
      transform: translateX(-50%) translateY(0);
    }
    .claude-folders-notification.error {
      border-color: #b85050;
      background: #3a2020;
    }
    .categories-modal-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 10003;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .categories-modal {
      background: #2a2a28;
      border: 1px solid #3d3d3a;
      border-radius: 12px;
      width: 90%;
      max-width: 600px;
      max-height: 80vh;
      display: flex;
      flex-direction: column;
      box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    }
    .categories-modal-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 16px 20px;
      border-bottom: 1px solid #3d3d3a;
    }
    .categories-modal-header h3 {
      margin: 0;
      color: #e8e6e3;
      font-size: 16px;
    }
    .modal-close-btn {
      background: none;
      border: none;
      color: #9c9a92;
      font-size: 24px;
      cursor: pointer;
      padding: 0;
      line-height: 1;
    }
    .modal-close-btn:hover { color: #e8e6e3; }
    .categories-modal-body {
      padding: 20px;
      flex: 1;
      overflow-y: auto;
    }
    .categories-modal-body p {
      margin: 0 0 12px 0;
      color: #9c9a92;
      font-size: 14px;
    }
    .categories-modal-body textarea {
      width: 100%;
      height: 200px;
      background: #1a1a18;
      border: 1px solid #3d3d3a;
      border-radius: 8px;
      color: #e8e6e3;
      font-family: monospace;
      font-size: 12px;
      padding: 12px;
      resize: vertical;
    }
    .categories-modal-body textarea:focus {
      outline: none;
      border-color: #d97706;
    }
    .modal-stats {
      margin-top: 12px;
      padding: 12px;
      background: #1a1a18;
      border-radius: 8px;
      font-size: 13px;
      color: #9c9a92;
      line-height: 1.6;
    }
    .categories-modal-footer {
      display: flex;
      justify-content: flex-end;
      gap: 10px;
      padding: 16px 20px;
      border-top: 1px solid #3d3d3a;
    }
    .modal-btn {
      padding: 10px 20px;
      border-radius: 6px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.15s;
    }
    .modal-btn.cancel-btn {
      background: transparent;
      border: 1px solid #3d3d3a;
      color: #9c9a92;
    }
    .modal-btn.cancel-btn:hover {
      border-color: #5d5d5a;
      color: #e8e6e3;
    }
    .modal-btn.preview-btn {
      background: linear-gradient(135deg, #d97706 0%, #b45309 100%);
      border: none;
      color: #fff;
    }
    .modal-btn.preview-btn:hover { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); }
    .modal-btn.preview-btn.done {
      background: #3d3d3a;
      color: #9c9a92;
    }
    .modal-btn.apply-btn {
      background: #3d3d3a;
      border: none;
      color: #9c9a92;
    }
    .modal-btn.apply-btn:hover:not(:disabled) {
      background: #4d4d4a;
    }
    .modal-btn.apply-btn:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    .modal-btn.apply-btn.ready {
      background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: #fff;
    }
    .modal-btn.apply-btn.ready:hover {
      background: linear-gradient(135deg, #10b981 0%, #059669 100%);
    }
  `;
  document.head.appendChild(style);
}

function injectSidebar() {
  // Check if our link still exists (React may have removed it)
  const existingLink = document.querySelector('a[data-folders-link="true"]');
  if (existingLink) return;
  
  const nav = document.querySelector('nav');
  if (!nav) {
    setTimeout(injectSidebar, 500);
    return;
  }
  
  const links = nav.querySelectorAll('a');
  let projectsLink = null;
  links.forEach(link => {
    if (link.textContent.includes('Projects')) projectsLink = link;
  });
  
  if (!projectsLink) {
    setTimeout(injectSidebar, 500);
    return;
  }
  
  const foldersLink = projectsLink.cloneNode(true);
  foldersLink.setAttribute('data-folders-link', 'true');
  const span = foldersLink.querySelector('span');
  if (span) span.textContent = 'Folders';
  
  const svg = foldersLink.querySelector('svg');
  if (svg) {
    svg.innerHTML = '<path d="M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z" fill="none" stroke="currentColor" stroke-width="2"/>';
    svg.setAttribute('viewBox', '0 0 24 24');
  }
  
  foldersLink.href = '#';
  foldersLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFoldersPanel();
  });
  
  projectsLink.parentNode.insertBefore(foldersLink, projectsLink.nextSibling);
  sidebarInjected = true;
  console.log('[CONTENT] Sidebar injected');
}

function toggleFoldersPanel() {
  let panel = document.querySelector('.claude-folders-panel');
  
  if (panel) {
    panel.remove();
    panelExpanded = false;
    document.removeEventListener('click', closePanelOnOutsideClick);
    return;
  }
  
  // Create panel
  panel = document.createElement('div');
  panel.className = 'claude-folders-panel';
  panelExpanded = true;
  
  renderPanelContent(panel);
  document.body.appendChild(panel);
  
  // Close on outside click (delay to avoid immediate close)
  setTimeout(() => {
    document.addEventListener('click', closePanelOnOutsideClick);
  }, 100);
}

function closePanelOnOutsideClick(e) {
  const panel = document.querySelector('.claude-folders-panel');
  const foldersLink = document.querySelector('a[href="#"]'); // The Folders nav link
  if (panel && !panel.contains(e.target) && !foldersLink?.contains(e.target)) {
    panel.remove();
    panelExpanded = false;
    document.removeEventListener('click', closePanelOnOutsideClick);
  }
}

function renderPanelContent(panel) {
  let html = `
    <div class="folders-panel-header">
      <h2>Folders</h2>
      <div class="panel-actions">
        <button class="panel-btn analytics-btn" title="Analytics">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 8L8 3" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 8L12 10" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="panel-organizer-btn open-organizer-btn" title="Open full organizer">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2v12h12V8h-2v4H4V4h4V2H2zm8 0v2h2.6L7.3 9.3l1.4 1.4L14 5.4V8h2V2h-6z"/>
          </svg>
          Organizer
        </button>
        <button class="panel-btn toggle-setup-btn" title="Show/Hide Setup" style="display:none;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
        <button class="panel-btn close-btn" title="Close">×</button>
      </div>
    </div>
    
    <!-- Analytics View (hidden by default) -->
    <div class="panel-analytics-view" style="display:none;">
      <div class="panel-analytics-header">
        <button class="panel-btn back-to-folders-btn">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10 2L4 8l6 6" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
          Back
        </button>
      </div>
      <div class="panel-donut-container">
        <canvas id="panelDonutChart" width="180" height="180"></canvas>
      </div>
      <div id="panelAnalyticsLegend" class="panel-analytics-legend"></div>
      <div id="panelAnalyticsStats" class="panel-analytics-stats"></div>
    </div>
    
    <!-- Folders View -->
    <div class="panel-folders-view">
    <div class="folders-panel-actions">
      <button class="ask-claude-btn" id="askClaudeBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
        Ask Claude to Organize
      </button>
      <button class="apply-categories-btn" id="applyCategoriesBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
        </svg>
        Apply Claude's Response
      </button>
    </div>
    <div class="folders-panel-content">
  `;
  
  if (folders.length === 0) {
    html += `<div class="folders-empty"><p>No folders yet</p><p style="font-size:12px;color:#888;">Use Import or Ask Claude to add chats</p></div>`;
  } else {
    const byCategory = {};
    folders.forEach(f => {
      if (!byCategory[f.category]) byCategory[f.category] = [];
      byCategory[f.category].push(f);
    });
    
    Object.keys(byCategory).forEach(cat => {
      html += `<div class="folder-category-group"><div class="folder-category-header">${cat}</div>`;
      byCategory[cat].forEach(folder => {
        const chatCount = folder.chats ? folder.chats.length : 0;
        html += `
          <div class="folder-panel-item" data-folder-id="${folder.id}">
            <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor" style="margin-right:8px;opacity:0.6;flex-shrink:0;">
              <path d="M2 3h6l2 2h6v10H2V3z"/>
            </svg>
            <span class="folder-panel-name">${folder.name}</span>
            <span class="folder-panel-count">${chatCount}</span>
            <button class="folder-export-btn" data-folder-id="${folder.id}" title="Export folder to markdown">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <svg class="folder-expand-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 4l4 4-4 4"/>
            </svg>
          </div>
          <div class="folder-chats-list" data-folder-id="${folder.id}" data-shown="10" style="display:none;">
            ${(folder.chats || []).slice(0, 10).map(chat => `
              <a href="${chat.url}" target="_blank" class="folder-chat-link" title="${chat.title}">
                ${chat.title}
              </a>
            `).join('')}
            ${(folder.chats?.length || 0) > 10 ? `<button class="folder-load-more-btn" data-folder-id="${folder.id}">Load +${folder.chats.length - 10} more</button>` : ''}
          </div>
        `;
      });
      html += `</div>`;
    });
  }
  
  html += `</div></div>`;
  panel.innerHTML = html;
  
  panel.querySelector('.close-btn')?.addEventListener('click', () => {
    panel.remove();
    panelExpanded = false;
    document.removeEventListener('click', closePanelOnOutsideClick);
  });
  
  panel.querySelector('.open-organizer-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openOrganizer' });
  });
  
  // Analytics toggle
  panel.querySelector('.analytics-btn')?.addEventListener('click', () => {
    const foldersView = panel.querySelector('.panel-folders-view');
    const analyticsView = panel.querySelector('.panel-analytics-view');
    if (analyticsView.style.display === 'none') {
      foldersView.style.display = 'none';
      analyticsView.style.display = 'block';
      renderPanelAnalytics(panel);
    } else {
      analyticsView.style.display = 'none';
      foldersView.style.display = 'block';
    }
  });
  
  panel.querySelector('.back-to-folders-btn')?.addEventListener('click', () => {
    panel.querySelector('.panel-analytics-view').style.display = 'none';
    panel.querySelector('.panel-folders-view').style.display = 'block';
  });
  
  panel.querySelector('#askClaudeBtn')?.addEventListener('click', () => {
    askClaudeToOrganize();
  });
  
  panel.querySelector('#applyCategoriesBtn')?.addEventListener('click', () => {
    showApplyCategoriesModal();
  });
  
  // Toggle setup buttons visibility
  const organizedFolders = folders.filter(f => f.id !== 'unsorted');
  const hasOrganizedData = organizedFolders.length > 0 && categories.length > 0;
  const toggleSetupBtn = panel.querySelector('.toggle-setup-btn');
  const panelActions = panel.querySelector('.folders-panel-actions');
  
  if (hasOrganizedData && toggleSetupBtn && panelActions) {
    toggleSetupBtn.style.display = 'flex';
    panelActions.style.display = 'none';
  }
  
  toggleSetupBtn?.addEventListener('click', () => {
    if (panelActions) {
      panelActions.style.display = panelActions.style.display === 'none' ? 'block' : 'none';
    }
  });
  
  // Folder export buttons
  panel.querySelectorAll('.folder-export-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderId = btn.dataset.folderId;
      handleFolderExport(folderId, btn);
    });
  });
  
  // Folder click - expand/collapse chats inline
  panel.querySelectorAll('.folder-panel-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderId = item.dataset.folderId;
      const chatsList = panel.querySelector(`.folder-chats-list[data-folder-id="${folderId}"]`);
      const icon = item.querySelector('.folder-expand-icon');
      
      if (chatsList.style.display === 'none') {
        // Collapse all others first
        panel.querySelectorAll('.folder-chats-list').forEach(list => list.style.display = 'none');
        panel.querySelectorAll('.folder-expand-icon').forEach(i => i.style.transform = '');
        // Expand this one
        chatsList.style.display = 'block';
        icon.style.transform = 'rotate(90deg)';
      } else {
        chatsList.style.display = 'none';
        icon.style.transform = '';
      }
    });
  });
  
  // Load more button click - use named function for re-attachment
  function handleLoadMore(e) {
    e.stopPropagation();
    const btn = e.target;
    const folderId = btn.dataset.folderId;
    const chatsList = panel.querySelector(`.folder-chats-list[data-folder-id="${folderId}"]`);
    const folder = folders.find(f => f.id === folderId);
    if (!folder || !folder.chats) return;
    
    const currentShown = parseInt(chatsList.dataset.shown) || 10;
    const newShown = currentShown + 20;
    chatsList.dataset.shown = newShown;
    
    // Rebuild the chat list
    const remaining = folder.chats.length - newShown;
    let html = folder.chats.slice(0, newShown).map(chat => `
      <a href="${chat.url}" target="_blank" class="folder-chat-link" title="${chat.title}">
        ${chat.title}
      </a>
    `).join('');
    
    if (remaining > 0) {
      html += `<button class="folder-load-more-btn" data-folder-id="${folderId}">Load +${remaining} more</button>`;
    }
    
    chatsList.innerHTML = html;
    
    // Re-attach load more handler if button still exists
    const newBtn = chatsList.querySelector('.folder-load-more-btn');
    if (newBtn) {
      newBtn.addEventListener('click', handleLoadMore);
    }
  }
  
  panel.querySelectorAll('.folder-load-more-btn').forEach(btn => {
    btn.addEventListener('click', handleLoadMore);
  });
}

function injectChatButton() {
  const existing = document.querySelector('.claude-folders-btn');
  if (existing) existing.remove();
  
  const existingExport = document.querySelector('.claude-export-btn');
  if (existingExport) existingExport.remove();
  
  const header = document.querySelector('header');
  if (!header) {
    setTimeout(injectChatButton, 500);
    return;
  }
  
  const h1 = header.querySelector('h1');
  if (!h1) {
    setTimeout(injectChatButton, 500);
    return;
  }
  
  const titleContainer = h1.parentElement;
  
  // Export button
  const exportBtn = document.createElement('button');
  exportBtn.className = 'claude-folders-btn claude-export-btn';
  exportBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    <span>Export</span>
  `;
  exportBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await handleExportCurrentChat(exportBtn);
  });
  titleContainer.appendChild(exportBtn);
  
  // Folder button
  const btn = document.createElement('button');
  btn.className = 'claude-folders-btn';
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/>
    </svg>
    <span>Add to folder</span>
  `;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    showFolderPicker(btn);
  });
  titleContainer.appendChild(btn);
}

// Export handler function
async function handleExportCurrentChat(btn) {
  if (!window.chatExporter) {
    showNotification('Export module not loaded', true);
    return;
  }
  
  const originalText = btn.innerHTML;
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
    <span>Exporting...</span>
  `;
  btn.disabled = true;
  
  try {
    const result = await window.chatExporter.exportCurrentChat();
    
    if (result.success && result.markdown) {
      // Send to background to write file
      const saveResponse = await chrome.runtime.sendMessage({
        action: 'saveExport',
        filename: result.filename,
        content: result.markdown
      });
      
      if (saveResponse?.success) {
        showNotification(`Saved: ${result.filename}`);
        if (currentChatId) markChatAsExported(currentChatId);
      } else {
        showNotification('Could not save: ' + (saveResponse?.error || 'Unknown error'), true);
      }
    } else {
      showNotification('Export failed: ' + result.error, true);
    }
  } catch (e) {
    showNotification('Export error: ' + e.message, true);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// Mark chat as exported in storage
async function markChatAsExported(chatId) {
  try {
    const result = await chrome.storage.local.get('exportedChats');
    const exported = result.exportedChats || {};
    exported[chatId] = new Date().toISOString();
    await chrome.storage.local.set({ exportedChats: exported });
  } catch (e) {
    console.log('[EXPORT] Failed to mark as exported:', e.message);
  }
}

// Handle folder export - shows confirmation then starts bulk export
async function handleFolderExport(folderId, btn) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.chats?.length) {
    showNotification('No chats in this folder to export', true);
    return;
  }
  
  const chatCount = folder.chats.length;
  const estimatedTime = Math.ceil(chatCount * 0.5 / 60); // ~0.5s per chat
  
  if (!confirm(`Export ${chatCount} chats from "${folder.name}"?\n\nThis will visit each chat page to extract content.\nEstimated time: ${estimatedTime > 0 ? estimatedTime + ' minute(s)' : 'less than a minute'}\n\nFiles will be saved to your data folder/chats/`)) {
    return;
  }
  
  showBulkExportProgress(folder);
}

// Show bulk export progress modal
function showBulkExportProgress(folder) {
  const existing = document.querySelector('.export-progress-modal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.className = 'export-progress-modal';
  modal.innerHTML = `
    <div class="export-progress-content">
      <div class="export-progress-title">Exporting: ${folder.name}</div>
      <div class="export-progress-bar-container">
        <div class="export-progress-bar" style="width: 0%"></div>
      </div>
      <div class="export-progress-text">Preparing... 0 / ${folder.chats.length}</div>
      <div class="export-progress-current">Starting export...</div>
      <button class="export-cancel-btn">Cancel</button>
    </div>
  `;
  document.body.appendChild(modal);
  
  let cancelled = false;
  modal.querySelector('.export-cancel-btn').addEventListener('click', () => {
    cancelled = true;
    modal.remove();
    showNotification('Export cancelled');
  });
  
  // Start the export process
  runBulkExport(folder, modal, () => cancelled);
}

// Run the bulk export process
async function runBulkExport(folder, modal, isCancelled) {
  const progressBar = modal.querySelector('.export-progress-bar');
  const progressText = modal.querySelector('.export-progress-text');
  const currentText = modal.querySelector('.export-progress-current');
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < folder.chats.length; i++) {
    if (isCancelled()) break;
    
    const chat = folder.chats[i];
    const percent = ((i + 1) / folder.chats.length * 100).toFixed(0);
    
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `Exporting... ${i + 1} / ${folder.chats.length}`;
    currentText.textContent = chat.title;
    
    try {
      // Use the chat exporter to fetch and convert
      if (window.chatExporter) {
        const result = await window.chatExporter.exportChatById(chat.id, chat.title);
        
        if (result.success && result.markdown) {
          // Send to background to write file
          const saveResponse = await chrome.runtime.sendMessage({
            action: 'saveExport',
            filename: result.filename,
            content: result.markdown
          });
          
          if (saveResponse?.success) {
            successCount++;
            await markChatAsExported(chat.id);
          } else {
            failCount++;
            console.log('[EXPORT] Write failed:', chat.title, saveResponse?.error);
          }
        } else {
          failCount++;
          console.log('[EXPORT] Failed:', chat.title, result.error);
        }
      }
    } catch (e) {
      failCount++;
      console.log('[EXPORT] Error exporting:', chat.title, e.message);
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }
  
  if (!isCancelled()) {
    modal.remove();
    showNotification(`Export complete! ${successCount} succeeded, ${failCount} failed`);
  }
}

// Save export file via popup (which has file system access)
async function saveExportViaPopup(filename, content) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'saveExport',
      filename,
      content
    });
    return response?.success || false;
  } catch (e) {
    console.log('[EXPORT] saveExportViaPopup failed:', e.message);
    return false;
  }
}

function showFolderPicker(anchorElement) {
  const existing = document.querySelector('.claude-folders-picker');
  if (existing) { existing.remove(); return; }
  
  const picker = document.createElement('div');
  picker.className = 'claude-folders-picker';
  
  const rect = anchorElement.getBoundingClientRect();
  picker.style.top = `${rect.bottom + 8}px`;
  picker.style.right = `${window.innerWidth - rect.right}px`;
  picker.style.left = 'auto';
  
  let html = '<div class="folders-picker-header">Select folder</div><div class="folders-picker-list">';
  
  if (folders.length > 0) {
    folders.forEach(folder => {
      html += `
        <div class="folder-picker-item" data-folder-id="${folder.id}">
          <span class="folder-category">${folder.category}</span>
          <span class="folder-name">${folder.name}</span>
        </div>
      `;
    });
  } else {
    html += `<div style="padding:12px 16px;color:#888;font-size:13px;">No folders yet. Create one below:</div>`;
  }
  
  html += `</div>`;
  
  html += `
    <div class="folder-picker-divider"></div>
    <div class="folder-picker-new">
      <input type="text" id="newFolderName" placeholder="New folder name..." class="new-folder-input">
      <select id="newFolderCategory" class="new-folder-select">
        ${(categories.length > 0 ? categories : ['Personal', 'Work', 'Projects']).map(cat => `<option value="${cat}">${cat}</option>`).join('')}
      </select>
      <button class="create-folder-btn">Create & Add</button>
    </div>
  `;
  
  picker.innerHTML = html;
  document.body.appendChild(picker);
  
  picker.querySelectorAll('.folder-picker-item').forEach(item => {
    item.addEventListener('click', async () => {
      await assignCurrentChatToFolder(item.dataset.folderId);
      picker.remove();
    });
  });
  
  const createBtn = picker.querySelector('.create-folder-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const name = picker.querySelector('#newFolderName').value.trim();
      const category = picker.querySelector('#newFolderCategory').value;
      if (name) {
        await createFolderAndAssign(name, category);
        picker.remove();
      }
    });
  }
  
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!picker.contains(e.target) && e.target !== anchorElement) {
        picker.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 0);
}

async function createFolderAndAssign(folderName, category) {
  const folderId = 'folder-' + Date.now();
  try {
    await chrome.runtime.sendMessage({
      action: 'createFolder',
      folder: { id: folderId, category, name: folderName, chats: [] }
    });
    await loadData();
    await assignCurrentChatToFolder(folderId);
    showNotification('Folder created and chat added');
  } catch (error) {
    showNotification('Error: ' + error.message, true);
  }
}

async function assignCurrentChatToFolder(folderId) {
  const chatTitle = document.querySelector('h1')?.textContent || 'Untitled';
  const chatUrl = window.location.href;
  
  try {
    await chrome.runtime.sendMessage({
      action: 'assignChatToFolder',
      chat: {
        id: currentChatId,
        title: chatTitle,
        url: chatUrl,
        tags: [],
        date: new Date().toISOString().split('T')[0],
        relativeDate: 'Today'
      },
      folderId
    });
    await loadData();
    showNotification('Added to folder');
  } catch (error) {
    showNotification('Error: ' + error.message, true);
  }
}

function observeUrlChanges() {
  let lastUrl = location.href;
  new MutationObserver(() => {
    const url = location.href;
    if (url !== lastUrl) {
      lastUrl = url;
      updateCurrentChatId();
      if (url.includes('/chat/')) {
        setTimeout(injectChatButton, 500);
      }
    }
    // Re-inject sidebar if React removed it
    if (!document.querySelector('a[data-folders-link="true"]')) {
      sidebarInjected = false;
      injectSidebar();
    }
  }).observe(document, { subtree: true, childList: true });
}

function showNotification(message, isError = false) {
  const notification = document.createElement('div');
  notification.className = `claude-folders-notification ${isError ? 'error' : ''}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Orange styled progress bar for sync operations
function showSyncProgressBar(message) {
  let bar = document.getElementById('cf-sync-progress');
  
  // Determine position based on current page
  const isInChat = /\/chat\/[a-f0-9-]+/i.test(window.location.pathname);
  const positionStyle = isInChat 
    ? 'top: 12px; right: 12px; left: auto; transform: none;'
    : 'bottom: 20px; left: 50%; transform: translateX(-50%);';
  
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cf-sync-progress';
    bar.innerHTML = `
      <div style="
        position: fixed;
        ${positionStyle}
        background: linear-gradient(135deg, #d97706, #b45309);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        min-width: 280px;
      ">
        <svg class="sync-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="animation: cf-spin 1s linear infinite;">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <span class="sync-message">${message}</span>
      </div>
      <style>
        @keyframes cf-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>
    `;
    document.body.appendChild(bar);
  } else {
    bar.querySelector('.sync-message').textContent = message;
  }
}

function hideSyncProgressBar() {
  const bar = document.getElementById('cf-sync-progress');
  if (bar) bar.remove();
}

async function askClaudeToOrganize() {
  showNotification('Analyzing chat patterns...');
  
  // Step 1: Run local analysis
  const analysis = analyzeChatsLocally();
  
  if (analysis.totalChats === 0) {
    showNotification('No chats to organize! Import chats first.', true);
    return;
  }
  
  // Step 2: Build compact prompt with just the analysis
  const prompt = `I have ${analysis.totalChats} Claude chats to organize. Here's the word frequency analysis:

TOP 80 KEYWORDS (word: count):
${analysis.topWords.map(w => `${w.word}(${w.count})`).join(', ')}

TOP 40 PHRASES (phrase: count):
${analysis.topPhrases.map(p => `${p.phrase}(${p.count})`).join(', ')}

Based on these patterns, design a categorization system. Return ONLY valid JSON in this exact format:
{
  "categories": [
    {
      "name": "Category Name",
      "folders": [
        {"name": "Folder Name", "keywords": ["keyword1", "keyword2", "phrase match"]}
      ]
    }
  ]
}

Requirements:
- 6-8 broad categories representing major areas (e.g., "Development", "Business", "Personal", "Learning")
- 2-6 folders per category
- 5-15 keywords per folder (use words/phrases from my data above)
- Keywords are case-insensitive substring matches
- Order categories/folders from most specific to least (first match wins)
- Last category should be "Miscellaneous" with folder "General" and empty keywords []
- Return ONLY the JSON, no markdown, no explanation`;

  // Store for new tab
  await chrome.storage.local.set({ 
    pendingOrganizePrompt: prompt,
    pendingOrganizeAnalysis: analysis
  });
  
  window.open('https://claude.ai/new', '_blank');
  showNotification('Opening Claude - paste the response back to apply it!');
}

function analyzeChatsLocally() {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'about', 'how', 'why', 'what', 'when', 
    'where', 'this', 'that', 'your', 'new', 'can', 'you', 'help', 'need', 'want',
    'get', 'make', 'use', 'would', 'could', 'should', 'have', 'has', 'been', 'being',
    'will', 'are', 'was', 'were', 'they', 'them', 'their', 'there', 'here', 'which',
    'more', 'some', 'any', 'all', 'each', 'into', 'than', 'then', 'also', 'just',
    'like', 'know', 'think', 'does', 'did', 'doing', 'done', 'way', 'well', 'very'
  ]);
  
  const wordCounts = {};
  const phraseCounts = {};
  
  allChats.forEach(chat => {
    const title = chat.title.toLowerCase();
    
    // Extract words (3+ chars, not stop words)
    const words = title.match(/\b[a-z]{3,}\b/g) || [];
    const filteredWords = words.filter(w => !stopWords.has(w));
    
    filteredWords.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    // Extract bigrams
    for (let i = 0; i < filteredWords.length - 1; i++) {
      const bigram = `${filteredWords[i]} ${filteredWords[i+1]}`;
      phraseCounts[bigram] = (phraseCounts[bigram] || 0) + 1;
    }
  });
  
  // Sort and get top results
  const topWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([word, count]) => ({ word, count }));
  
  const topPhrases = Object.entries(phraseCounts)
    .filter(([_, count]) => count >= 2) // Only phrases that appear 2+ times
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([phrase, count]) => ({ phrase, count }));
  
  return {
    totalChats: allChats.length,
    topWords,
    topPhrases
  };
}

function applyCategorization(categoryDefs) {
  // categoryDefs = { categories: [{ name, folders: [{ name, keywords }] }] }
  
  const results = [];
  const usedChatIds = new Set();
  let folderId = 1;
  
  // Process each category/folder in order (first match wins)
  for (const category of categoryDefs.categories) {
    for (const folderDef of category.folders) {
      const matchedChats = [];
      
      // Skip empty keywords (catch-all)
      if (folderDef.keywords.length === 0) continue;
      
      for (const chat of allChats) {
        if (usedChatIds.has(chat.id)) continue;
        
        const titleLower = chat.title.toLowerCase();
        const matches = folderDef.keywords.some(kw => titleLower.includes(kw.toLowerCase()));
        
        if (matches) {
          matchedChats.push({
            id: chat.id,
            title: chat.title,
            url: chat.url,
            date: chat.date
          });
          usedChatIds.add(chat.id);
        }
      }
      
      if (matchedChats.length > 0) {
        results.push({
          id: `folder-${folderId++}`,
          name: folderDef.name,
          category: category.name,
          chats: matchedChats
        });
      }
    }
  }
  
  // Catch-all for uncategorized
  const uncategorized = allChats
    .filter(c => !usedChatIds.has(c.id))
    .map(c => ({ id: c.id, title: c.title, url: c.url, date: c.date }));
  
  if (uncategorized.length > 0) {
    results.push({
      id: `folder-${folderId}`,
      name: 'General',
      category: 'Miscellaneous',
      chats: uncategorized
    });
  }
  
  // Extract unique categories
  const uniqueCategories = [...new Set(results.map(f => f.category))];
  
  return {
    categories: uniqueCategories,
    folders: results
  };
}

function showApplyCategoriesModal() {
  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'categories-modal-overlay';
  overlay.innerHTML = `
    <div class="categories-modal">
      <div class="categories-modal-header">
        <h3>Apply Claude's Categories</h3>
        <button class="modal-close-btn">×</button>
      </div>
      <div class="categories-modal-body">
        <p>Paste Claude's JSON response below:</p>
        <textarea id="categoriesJsonInput" placeholder='{"categories": [{"name": "...", "folders": [...]}]}'></textarea>
        <div class="modal-stats" id="modalStats"><span style="color:#9c9a92;">Step 1: Paste JSON, then click Preview Categories</span></div>
      </div>
      <div class="categories-modal-footer">
        <button class="modal-btn cancel-btn">Cancel</button>
        <button class="modal-btn preview-btn" id="previewBtn">Preview Categories</button>
        <button class="modal-btn apply-btn" id="applyBtn" disabled title="Preview first to verify">Apply & Save</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const textarea = overlay.querySelector('#categoriesJsonInput');
  const statsDiv = overlay.querySelector('#modalStats');
  const previewBtn = overlay.querySelector('#previewBtn');
  const applyBtn = overlay.querySelector('#applyBtn');
  let previewResult = null;
  
  overlay.querySelector('.modal-close-btn').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.cancel-btn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  
  previewBtn.addEventListener('click', () => {
    try {
      const json = JSON.parse(textarea.value);
      if (!json.categories || !Array.isArray(json.categories)) {
        throw new Error('Invalid format - need {categories: [...]}');
      }
      
      previewResult = applyCategorization(json);
      
      const totalChats = previewResult.folders.reduce((sum, f) => sum + f.chats.length, 0);
      const byCategory = {};
      previewResult.folders.forEach(f => {
        byCategory[f.category] = (byCategory[f.category] || 0) + f.chats.length;
      });
      
      let statsHtml = `<strong>✓ Preview Ready:</strong> ${previewResult.categories.length} categories, ${previewResult.folders.length} folders, ${totalChats} chats<br><br>`;
      Object.entries(byCategory).forEach(([cat, count]) => {
        statsHtml += `• ${cat}: ${count} chats<br>`;
      });
      statsHtml += `<br><span style="color:#10b981;">Step 2: Click "Apply & Save" to finish</span>`;
      
      statsDiv.innerHTML = statsHtml;
      statsDiv.style.color = '#10b981';
      
      // Toggle button states
      previewBtn.classList.add('done');
      previewBtn.textContent = '✓ Previewed';
      applyBtn.disabled = false;
      applyBtn.classList.add('ready');
    } catch (e) {
      statsDiv.innerHTML = `<span style="color:#ef4444;">Error: ${e.message}</span>`;
      applyBtn.disabled = true;
    }
  });
  
  applyBtn.addEventListener('click', async () => {
    if (!previewResult) return;
    
    applyBtn.textContent = 'Saving...';
    applyBtn.disabled = true;
    
    try {
      // Update global state
      folders = previewResult.folders;
      categories = previewResult.categories;
      allChats = [];
      folders.forEach(f => { if (f.chats) allChats.push(...f.chats); });
      
      // Ensure metadata exists
      if (typeof metadata === 'undefined' || !metadata) {
        metadata = {};
      }
      
      // Save to storage and file
      const dataToSave = { folders, categories, metadata };
      await chrome.storage.local.set({ cachedData: dataToSave });
      
      // Tell background to sync and wait for it
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'saveData', data: dataToSave }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[CONTENT] Save error:', chrome.runtime.lastError.message);
          }
          resolve();
        });
      });
      
      overlay.remove();
      showNotification(`Organized ${allChats.length} chats into ${folders.length} folders!`);
      
      // Refresh the panel
      const panel = document.querySelector('.claude-folders-panel');
      if (panel) renderPanelContent(panel);
    } catch (e) {
      console.log('[CONTENT] Apply error:', e.message);
      showNotification('Error saving: ' + e.message, true);
      applyBtn.textContent = 'Apply & Save';
      applyBtn.disabled = false;
    }
  });
}

// Chart colors - distinct hues with good contrast
const PANEL_CHART_COLORS = [
  '#d97706', // orange (Claude primary)
  '#3d8b8b', // dark teal
  '#9b6b4a', // brown
  '#6478b8', // blue
  '#a85a9a', // purple
  '#6a9a5a', // green
  '#c87058', // coral
  '#5088a8', // steel blue
];

function renderPanelAnalytics(panel) {
  const canvas = panel.querySelector('#panelDonutChart');
  const legendEl = panel.querySelector('#panelAnalyticsLegend');
  const statsEl = panel.querySelector('#panelAnalyticsStats');
  
  if (!canvas) return;
  
  // Get category data
  const byCategory = {};
  let total = 0;
  folders.forEach(f => {
    const cat = f.category || 'Uncategorized';
    const count = f.chats?.length || 0;
    byCategory[cat] = (byCategory[cat] || 0) + count;
    total += count;
  });
  
  const data = Object.entries(byCategory)
    .map(([name, count]) => ({ name, count, percent: total > 0 ? (count / total * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.count - a.count);
  
  // Draw donut
  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const outerRadius = 80;
  const innerRadius = 50;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (total === 0) {
    ctx.fillStyle = '#9c9a92';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', centerX, centerY);
    return;
  }
  
  let startAngle = -Math.PI / 2;
  data.forEach((item, i) => {
    const sliceAngle = (item.count / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = PANEL_CHART_COLORS[i % PANEL_CHART_COLORS.length];
    ctx.fill();
    
    startAngle = endAngle;
  });
  
  // Center text
  ctx.fillStyle = '#e8e6e3';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total.toLocaleString(), centerX, centerY - 6);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#9c9a92';
  ctx.fillText('chats', centerX, centerY + 10);
  
  // Legend
  legendEl.innerHTML = data.map((item, i) => `
    <div class="panel-legend-item">
      <div class="panel-legend-color" style="background: ${PANEL_CHART_COLORS[i % PANEL_CHART_COLORS.length]}"></div>
      <span>${item.name} (${item.percent}%)</span>
    </div>
  `).join('');
  
  // Stats
  let statsHtml = `
    <div class="panel-stat-row">
      <span class="panel-stat-label">Total Chats</span>
      <span class="panel-stat-value">${total.toLocaleString()}</span>
    </div>
    <div class="panel-stat-row">
      <span class="panel-stat-label">Categories</span>
      <span class="panel-stat-value">${data.length}</span>
    </div>
    <div class="panel-stat-row">
      <span class="panel-stat-label">Folders</span>
      <span class="panel-stat-value">${folders.length}</span>
    </div>
  `;
  statsEl.innerHTML = statsHtml;
}

async function scrapeAllChats() {
  console.log('[SCRAPER] Starting...');
  showNotification('Scraping chats...');
  
  // Clear monitored new chats since we're doing a full sync
  monitoredNewChats.clear();
  chrome.storage.local.set({ monitoredNewChats: [] });
  hideSyncNotification();
  
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Get existing IDs from all folders
  const existingIds = new Set();
  folders.forEach(f => {
    if (f.chats) f.chats.forEach(c => existingIds.add(c.id));
  });
  console.log('[SCRAPER] Existing chat IDs:', existingIds.size);
  
  let clickCount = 0;
  const scrapedChats = [];
  const seenIds = new Set(existingIds);
  let consecutiveEmptyPages = 0;
  
  while (clickCount < 100) {
    // Track how many new chats found this page
    const countBefore = scrapedChats.length;
    
    // Scrape current visible chats
    const chatLinks = document.querySelectorAll('a[href*="/chat/"]');
    
    for (const link of chatLinks) {
      const href = link.getAttribute('href');
      if (!href?.includes('/chat/')) continue;
      const match = href.match(/\/chat\/([a-f0-9-]+)/i);
      if (!match) continue;
      const chatId = match[1];
      if (seenIds.has(chatId)) continue;
      seenIds.add(chatId);
      
      // Get title and date from separate elements within the link
      let title = '';
      let relativeDate = '';
      
      // Look for the title element (usually first text node or specific class)
      const titleEl = link.querySelector('[class*="title"]') || 
                      link.querySelector('[class*="name"]') ||
                      link.querySelector('div > div:first-child');
      
      // Look for the date element (usually contains "ago" or time info)
      const dateEl = link.querySelector('[class*="time"]') ||
                     link.querySelector('[class*="date"]') ||
                     link.querySelector('[class*="ago"]');
      
      if (titleEl) {
        title = titleEl.textContent?.trim() || '';
      }
      
      if (dateEl) {
        relativeDate = dateEl.textContent?.trim() || '';
      }
      
      // Fallback: if no separate elements, parse from full text
      if (!title || !relativeDate) {
        const fullText = link.textContent?.trim() || '';
        const timeMatch = fullText.match(/(\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago|Yesterday|Today)/i);
        if (timeMatch) {
          relativeDate = timeMatch[1];
          const idx = fullText.indexOf('Last message');
          if (idx > 0) {
            title = fullText.substring(0, idx).trim();
          } else {
            title = fullText.replace(/Last message.*$/i, '').replace(timeMatch[0], '').trim();
          }
        } else {
          title = fullText;
        }
      }
      
      // Clean up
      title = title.replace(/\s+/g, ' ').trim();
      if (title.length > 200) title = title.substring(0, 197) + '...';
      if (!title || title.length < 2) title = 'Untitled Chat';
      
      // Parse relative date to ISO date for sorting
      let date = new Date().toISOString().split('T')[0];
      if (relativeDate) {
        const d = new Date();
        const minutesMatch = relativeDate.match(/(\d+)\s+minute/i);
        const hoursMatch = relativeDate.match(/(\d+)\s+hour/i);
        const daysMatch = relativeDate.match(/(\d+)\s+day/i);
        const weeksMatch = relativeDate.match(/(\d+)\s+week/i);
        const monthsMatch = relativeDate.match(/(\d+)\s+month/i);
        const yearsMatch = relativeDate.match(/(\d+)\s+year/i);
        
        if (minutesMatch) d.setMinutes(d.getMinutes() - parseInt(minutesMatch[1]));
        else if (hoursMatch) d.setHours(d.getHours() - parseInt(hoursMatch[1]));
        else if (daysMatch) d.setDate(d.getDate() - parseInt(daysMatch[1]));
        else if (weeksMatch) d.setDate(d.getDate() - parseInt(weeksMatch[1]) * 7);
        else if (monthsMatch) d.setMonth(d.getMonth() - parseInt(monthsMatch[1]));
        else if (yearsMatch) d.setFullYear(d.getFullYear() - parseInt(yearsMatch[1]));
        else if (relativeDate.toLowerCase().includes('yesterday')) d.setDate(d.getDate() - 1);
        date = d.toISOString().split('T')[0];
      }
      
      scrapedChats.push({
        id: chatId,
        title,
        url: href.startsWith('http') ? href : `https://claude.ai${href}`,
        date,
        relativeDate: relativeDate || 'Today',
        snippet: '',
        tags: []
      });
    }
    
    // Check if we found any new chats this page
    const newThisPage = scrapedChats.length - countBefore;
    if (newThisPage === 0) {
      consecutiveEmptyPages++;
      console.log('[SCRAPER] No new chats this page, consecutive empty:', consecutiveEmptyPages);
      if (consecutiveEmptyPages >= 2) {
        console.log('[SCRAPER] Stopping early - no new chats found');
        break;
      }
    } else {
      consecutiveEmptyPages = 0;
    }
    
    // Try to click "Show more" button
    const showMoreBtn = Array.from(document.querySelectorAll('button')).find(btn => 
      btn.textContent.includes('Show more')
    );
    if (!showMoreBtn) break;
    
    showMoreBtn.click();
    clickCount++;
    await new Promise(resolve => setTimeout(resolve, 1500));
    showNotification(`Scanning... ${scrapedChats.length} new chats found`);
  }
  
  // Send only new chats to be appended
  if (scrapedChats.length > 0) {
    try {
      await chrome.runtime.sendMessage({ action: 'scrapedChats', chats: scrapedChats });
      allChats.push(...scrapedChats);
    } catch (error) {
      console.log('[SCRAPER] Error:', error.message);
    }
  }
  
  showNotification(`Done! Added ${scrapedChats.length} new chats`);
  await loadData();
}

// Scrape specifically from the recents page (not sidebar)
// exportAllMissing: true = check ALL chats for missing MD (popup manual sync)
//                   false = only export newly scraped chats (passive 30 notification)
async function scrapeRecentsPage(exportAllMissing = false) {
  // Ensure we're on recents page
  if (!window.location.pathname.includes('/recents')) {
    console.log('[SCRAPER] Not on recents page, redirecting...');
    sessionStorage.setItem('cf-pending-sync', 'true');
    window.location.href = 'https://claude.ai/recents';
    return;
  }
  
  // Mark sync in progress to suppress monitor notifications
  syncInProgress = true;
  
  // Hide any existing sync notification
  hideSyncNotification();
  const existingNotif = document.getElementById('cf-sync-notification');
  if (existingNotif) existingNotif.remove();
  const existingNotif2 = document.getElementById('claude-folders-sync-notification');
  if (existingNotif2) existingNotif2.remove();
  
  // Clear both monitor systems
  pendingNewChats = [];
  if (typeof monitoredNewChats !== 'undefined') {
    monitoredNewChats.clear();
    chrome.storage.local.set({ monitoredNewChats: [] });
  }
  
  console.log('[SCRAPER] Scraping recents page...');
  showSyncProgressBar('Syncing from Recents...', 0);
  
  // Wait for page to fully render
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Get existing IDs from all folders
  const existingIds = new Set();
  folders.forEach(f => {
    if (f.chats) f.chats.forEach(c => existingIds.add(c.id));
  });
  console.log('[SCRAPER] Existing chat IDs:', existingIds.size);
  
  let clickCount = 0;
  const scrapedChats = [];
  const seenIds = new Set(existingIds);
  let consecutiveEmptyPages = 0;
  
  // Find the main content area (not the nav sidebar)
  const mainContent = document.querySelector('main') || document.querySelector('[class*="main"]') || document.body;
  
  while (clickCount < 100) {
    const countBefore = scrapedChats.length;
    
    // Scrape chat links from main content area only
    const chatLinks = mainContent.querySelectorAll('a[href*="/chat/"]');
    
    for (const link of chatLinks) {
      // Skip if this link is in the nav sidebar
      if (link.closest('nav')) continue;
      
      const href = link.getAttribute('href');
      if (!href?.includes('/chat/')) continue;
      const match = href.match(/\/chat\/([a-f0-9-]+)/i);
      if (!match) continue;
      const chatId = match[1];
      if (seenIds.has(chatId)) continue;
      seenIds.add(chatId);
      
      // Get title and date from separate elements within the link
      let title = '';
      let relativeDate = '';
      
      const titleEl = link.querySelector('[class*="title"]') || 
                      link.querySelector('[class*="name"]') ||
                      link.querySelector('div > div:first-child');
      
      const dateEl = link.querySelector('[class*="time"]') ||
                     link.querySelector('[class*="date"]') ||
                     link.querySelector('[class*="ago"]');
      
      if (titleEl) {
        title = titleEl.textContent?.trim() || '';
      }
      
      if (dateEl) {
        relativeDate = dateEl.textContent?.trim() || '';
      }
      
      // Fallback: parse from full text
      if (!title || !relativeDate) {
        const fullText = link.textContent?.trim() || '';
        const timeMatch = fullText.match(/(\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago|Yesterday|Today)/i);
        if (timeMatch) {
          relativeDate = timeMatch[1];
          const idx = fullText.indexOf('Last message');
          if (idx > 0) {
            title = fullText.substring(0, idx).trim();
          } else {
            title = fullText.replace(/Last message.*$/i, '').replace(timeMatch[0], '').trim();
          }
        } else {
          title = fullText;
        }
      }
      
      // Clean up
      title = title.replace(/\s+/g, ' ').trim();
      if (title.length > 200) title = title.substring(0, 197) + '...';
      if (!title || title.length < 2) title = 'Untitled Chat';
      
      // Parse relative date to ISO date
      let date = new Date().toISOString().split('T')[0];
      if (relativeDate) {
        const d = new Date();
        const minutesMatch = relativeDate.match(/(\d+)\s+minute/i);
        const hoursMatch = relativeDate.match(/(\d+)\s+hour/i);
        const daysMatch = relativeDate.match(/(\d+)\s+day/i);
        const weeksMatch = relativeDate.match(/(\d+)\s+week/i);
        const monthsMatch = relativeDate.match(/(\d+)\s+month/i);
        const yearsMatch = relativeDate.match(/(\d+)\s+year/i);
        
        if (minutesMatch) d.setMinutes(d.getMinutes() - parseInt(minutesMatch[1]));
        else if (hoursMatch) d.setHours(d.getHours() - parseInt(hoursMatch[1]));
        else if (daysMatch) d.setDate(d.getDate() - parseInt(daysMatch[1]));
        else if (weeksMatch) d.setDate(d.getDate() - parseInt(weeksMatch[1]) * 7);
        else if (monthsMatch) d.setMonth(d.getMonth() - parseInt(monthsMatch[1]));
        else if (yearsMatch) d.setFullYear(d.getFullYear() - parseInt(yearsMatch[1]));
        else if (relativeDate.toLowerCase().includes('yesterday')) d.setDate(d.getDate() - 1);
        date = d.toISOString().split('T')[0];
      }
      
      scrapedChats.push({
        id: chatId,
        title,
        url: href.startsWith('http') ? href : `https://claude.ai${href}`,
        date,
        relativeDate: relativeDate || 'Today',
        snippet: '',
        tags: []
      });
    }
    
    // Check if we found any new chats this page
    const newThisPage = scrapedChats.length - countBefore;
    if (newThisPage === 0) {
      consecutiveEmptyPages++;
      console.log('[SCRAPER] No new chats this page, consecutive empty:', consecutiveEmptyPages);
      if (consecutiveEmptyPages >= 2) {
        console.log('[SCRAPER] Stopping - no new chats found');
        break;
      }
    } else {
      consecutiveEmptyPages = 0;
    }
    
    // Find "Show more" button in main content (not in sidebar)
    const showMoreBtn = Array.from(mainContent.querySelectorAll('button')).find(btn => 
      btn.textContent.includes('Show more') && !btn.closest('nav')
    );
    if (!showMoreBtn) break;
    
    showMoreBtn.click();
    clickCount++;
    await new Promise(resolve => setTimeout(resolve, 1500));
    showSyncProgressBar(`Scanning... ${scrapedChats.length} new chats found`);
  }
  
  // Send new chats to be appended to folders
  if (scrapedChats.length > 0) {
    try {
      await chrome.runtime.sendMessage({ action: 'scrapedChats', chats: scrapedChats });
      allChats.push(...scrapedChats);
      
      // Update known IDs
      scrapedChats.forEach(c => knownChatIds.add(c.id));
      await chrome.storage.local.set({ knownChatIds: Array.from(knownChatIds) });
    } catch (error) {
      console.log('[SCRAPER] Error:', error.message);
    }
  }
  
  await loadData();
  
  // Refresh known IDs from updated folders so monitor doesn't re-detect
  await loadKnownChatIds();
  
  // Clear any pending new chats that accumulated during sync
  pendingNewChats = [];
  await chrome.storage.local.set({ pendingNewChats: [] });
  if (typeof monitoredNewChats !== 'undefined') {
    monitoredNewChats.clear();
    await chrome.storage.local.set({ monitoredNewChats: [] });
  }
  
  // Now export chats to markdown
  let exportSuccess = 0;
  let exportSkipped = 0;
  let exportEmpty = 0;
  
  // Determine which chats to check for MD export
  let chatsToExport = [];
  if (exportAllMissing) {
    // Manual sync from popup: check ALL chats in folders for missing MD
    folders.forEach(f => {
      if (f.chats) {
        f.chats.forEach(c => chatsToExport.push(c));
      }
    });
  } else {
    // Passive sync (30 notification): only export newly scraped chats
    chatsToExport = scrapedChats;
  }
  
  if (chatsToExport.length > 0 && window.chatExporter) {
    showSyncProgressBar(`Checking ${chatsToExport.length} chats for missing exports...`);
    
    for (let i = 0; i < chatsToExport.length; i++) {
      const chat = chatsToExport[i];
      showSyncProgressBar(`Checking ${i + 1}/${chatsToExport.length}: ${chat.title.substring(0, 30)}...`);
      
      try {
        // Check if already exported
        const existsCheck = await chrome.runtime.sendMessage({
          action: 'checkExportExists',
          chatId: chat.id,
          chatTitle: chat.title
        });
        
        if (existsCheck?.exists) {
          exportSkipped++;
          await markChatAsExported(chat.id);
          await new Promise(r => setTimeout(r, 50));
          continue;
        }
        
        const result = await window.chatExporter.exportChatById(chat.id, chat.title);
        
        if (result.success && result.markdown) {
          const saveResponse = await chrome.runtime.sendMessage({
            action: 'saveExport',
            filename: result.filename,
            content: result.markdown
          });
          
          if (saveResponse?.success) {
            exportSuccess++;
            await markChatAsExported(chat.id);
          } else {
            exportFail++;
          }
        } else {
          // Empty chat (no messages) - not an error
          exportEmpty++;
        }
      } catch (e) {
        exportEmpty++;
      }
      
      // Rate limit
      await new Promise(r => setTimeout(r, 300));
    }
  }
  
  // Mark sync complete
  syncInProgress = false;
  
  // Show success modal
  showSyncSuccessModal(scrapedChats.length, exportSuccess, exportSkipped, exportEmpty);
}

function showSyncSuccessModal(totalChats, exportSuccess, exportSkipped, exportEmpty) {
  // Remove progress bar
  const progressBar = document.getElementById('cf-sync-progress');
  if (progressBar) progressBar.remove();
  
  const existing = document.querySelector('.sync-success-modal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.className = 'sync-success-modal';
  modal.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        background: #2a2a28;
        border: 1px solid #3d3d3a;
        border-radius: 16px;
        padding: 32px;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #10b981, #059669);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        ">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <h2 style="color: #e8e6e3; margin: 0 0 12px; font-size: 24px;">Sync Complete!</h2>
        <div style="color: #9c9a92; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          <div style="margin-bottom: 8px;">
            <span style="color: #10b981; font-weight: 600;">${totalChats}</span> new chats imported
          </div>
          <div style="margin-bottom: 8px;">
            <span style="color: #10b981; font-weight: 600;">${exportSuccess}</span> exported to markdown
          </div>
          ${exportSkipped > 0 ? `
            <div style="margin-bottom: 8px; color: #9c9a92;">
              ${exportSkipped} already exported (skipped)
            </div>
          ` : ''}
          ${exportEmpty > 0 ? `
            <div style="color: #9c9a92;">
              ${exportEmpty} empty chats (no content)
            </div>
          ` : ''}
        </div>
        <button id="syncSuccessClose" style="
          background: linear-gradient(135deg, #d97706, #b45309);
          border: none;
          color: white;
          padding: 12px 32px;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s;
        ">Done</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('#syncSuccessClose').addEventListener('click', () => {
    modal.remove();
  });
  
  // Also close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal.firstElementChild) {
      modal.remove();
    }
  });
}

// ============ PASSIVE NEW CHAT MONITOR ============
let monitoredNewChats = new Set();
let syncNotificationEl = null;
let syncInProgress = false;

function startNewChatMonitor() {
  console.log('[MONITOR] Starting passive chat monitor');
  
  // Load tracked IDs from storage
  chrome.storage.local.get('monitoredNewChats', (result) => {
    if (result.monitoredNewChats) {
      monitoredNewChats = new Set(result.monitoredNewChats);
      console.log('[MONITOR] Loaded', monitoredNewChats.size, 'pending new chats');
      checkSyncThreshold();
    }
  });
  
  // Set up mutation observer on sidebar
  const observer = new MutationObserver(() => {
    scanForNewChats();
  });
  
  // Start observing after a delay to let page load
  setTimeout(() => {
    const sidebar = document.querySelector('nav') || document.body;
    observer.observe(sidebar, { childList: true, subtree: true });
    scanForNewChats(); // Initial scan
  }, 3000);
  
  // Also scan periodically
  setInterval(scanForNewChats, 30000);
}

function scanForNewChats() {
  // Get existing known IDs
  const knownIds = new Set();
  folders.forEach(f => {
    if (f.chats) f.chats.forEach(c => knownIds.add(c.id));
  });
  
  // Find chat links in sidebar
  const chatLinks = document.querySelectorAll('a[href*="/chat/"]');
  let foundNew = false;
  
  for (const link of chatLinks) {
    const href = link.getAttribute('href');
    if (!href?.includes('/chat/')) continue;
    const match = href.match(/\/chat\/([a-f0-9-]+)/i);
    if (!match) continue;
    const chatId = match[1];
    
    // Skip if already known or already tracked as new
    if (knownIds.has(chatId)) continue;
    if (monitoredNewChats.has(chatId)) continue;
    
    // New chat found!
    monitoredNewChats.add(chatId);
    foundNew = true;
    console.log('[MONITOR] New chat detected:', chatId);
  }
  
  if (foundNew) {
    // Save to storage
    chrome.storage.local.set({ monitoredNewChats: [...monitoredNewChats] });
    checkSyncThreshold();
  }
}

function checkSyncThreshold() {
  const count = monitoredNewChats.size;
  console.log('[MONITOR] Pending new chats:', count);
  
  if (count >= 30) {
    showSyncNotification(count);
  } else {
    hideSyncNotification();
  }
}

function showSyncNotification(count) {
  // Don't show if sync is already in progress
  if (syncInProgress) {
    hideSyncNotification();
    return;
  }
  
  // Only show when NOT in a chat
  const inChat = window.location.pathname.match(/\/chat\/[a-f0-9-]+/i);
  if (inChat) {
    hideSyncNotification();
    return;
  }
  
  if (syncNotificationEl) {
    syncNotificationEl.querySelector('.sync-count').textContent = count;
    return;
  }
  
  syncNotificationEl = document.createElement('div');
  syncNotificationEl.id = 'claude-folders-sync-notification';
  syncNotificationEl.innerHTML = `
    <style>
      #claude-folders-sync-notification {
        position: fixed;
        bottom: 20px;
        left: 50%;
        transform: translateX(-50%);
        background: linear-gradient(135deg, #d97706, #b45309);
        color: white;
        padding: 12px 20px;
        border-radius: 12px;
        display: flex;
        align-items: center;
        gap: 12px;
        font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        font-size: 14px;
        box-shadow: 0 4px 20px rgba(0,0,0,0.3);
        z-index: 10001;
        animation: slideUp 0.3s ease;
      }
      @keyframes slideUp {
        from { transform: translateX(-50%) translateY(100px); opacity: 0; }
        to { transform: translateX(-50%) translateY(0); opacity: 1; }
      }
      #claude-folders-sync-notification .sync-icon {
        width: 20px;
        height: 20px;
      }
      #claude-folders-sync-notification .sync-btn {
        background: rgba(255,255,255,0.2);
        border: none;
        color: white;
        padding: 6px 14px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 500;
        transition: background 0.15s;
      }
      #claude-folders-sync-notification .sync-btn:hover {
        background: rgba(255,255,255,0.3);
      }
      #claude-folders-sync-notification .dismiss-btn {
        background: none;
        border: none;
        color: rgba(255,255,255,0.7);
        cursor: pointer;
        padding: 4px;
        font-size: 18px;
        line-height: 1;
      }
      #claude-folders-sync-notification .dismiss-btn:hover {
        color: white;
      }
    </style>
    <svg class="sync-icon" viewBox="0 0 20 20" fill="currentColor">
      <path d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z"/>
    </svg>
    <span><span class="sync-count">${count}</span> new chats detected</span>
    <button class="sync-btn">Sync Now</button>
    <button class="dismiss-btn">×</button>
  `;
  
  document.body.appendChild(syncNotificationEl);
  
  syncNotificationEl.querySelector('.sync-btn').addEventListener('click', () => {
    hideSyncNotification();
    runSyncAndClear();
  });
  
  syncNotificationEl.querySelector('.dismiss-btn').addEventListener('click', () => {
    hideSyncNotification();
  });
}

function hideSyncNotification() {
  if (syncNotificationEl) {
    syncNotificationEl.remove();
    syncNotificationEl = null;
  }
}

async function runSyncAndClear() {
  // Clear tracked new chats
  monitoredNewChats.clear();
  chrome.storage.local.set({ monitoredNewChats: [] });
  
  // Navigate to recents and run the scraper
  if (!window.location.pathname.includes('/recents')) {
    showNotification('Navigating to Recents to sync...');
    sessionStorage.setItem('cf-pending-sync', 'true');
    window.location.href = 'https://claude.ai/recents';
  } else {
    showNotification('Syncing new chats...');
    await scrapeRecentsPage();
  }
}

// Re-check threshold when URL changes (entering/leaving chats)
function observeUrlForSync() {
  let lastPath = window.location.pathname;
  setInterval(() => {
    if (window.location.pathname !== lastPath) {
      lastPath = window.location.pathname;
      checkSyncThreshold();
    }
  }, 1000);
}

// Start URL observer for sync notification
observeUrlForSync();

// ========== MESSAGE LISTENER FOR EXPORT ==========
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startBulkExport') {
    // Start the bulk export process
    const allChats = message.chats || [];
    if (allChats.length > 0) {
      startBulkExportFromPopup(allChats);
    }
    sendResponse({ success: true });
    return true;
  }
  
  if (message.action === 'exportChatById') {
    // Export a single chat by ID (called from organizer)
    handleExportChatByIdMessage(message.chatId, message.title)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true; // Keep channel open for async response
  }
  
  return true;
});

// Handle export request from organizer
async function handleExportChatByIdMessage(chatId, title) {
  if (!window.chatExporter) {
    return { success: false, error: 'Chat exporter not available' };
  }
  
  try {
    const result = await window.chatExporter.exportChatById(chatId, title);
    return result;
  } catch (e) {
    console.log('[EXPORT] handleExportChatByIdMessage error:', e.message);
    return { success: false, error: e.message };
  }
}

// Bulk export triggered from popup
async function startBulkExportFromPopup(chats) {
  const existing = document.querySelector('.export-progress-modal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.className = 'export-progress-modal';
  modal.innerHTML = `
    <div class="export-progress-content">
      <div class="export-progress-title">Exporting All Chats</div>
      <div class="export-progress-bar-container">
        <div class="export-progress-bar" style="width: 0%"></div>
      </div>
      <div class="export-progress-text">Preparing... 0 / ${chats.length}</div>
      <div class="export-progress-current">Starting export...</div>
      <button class="export-cancel-btn">Cancel</button>
    </div>
  `;
  document.body.appendChild(modal);
  
  let cancelled = false;
  modal.querySelector('.export-cancel-btn').addEventListener('click', () => {
    cancelled = true;
    modal.remove();
    showNotification('Export cancelled');
  });
  
  // Run the export
  const progressBar = modal.querySelector('.export-progress-bar');
  const progressText = modal.querySelector('.export-progress-text');
  const currentText = modal.querySelector('.export-progress-current');
  
  let successCount = 0;
  let skippedCount = 0;
  let emptyCount = 0;
  
  for (let i = 0; i < chats.length; i++) {
    if (cancelled) break;
    
    const chat = chats[i];
    const percent = ((i + 1) / chats.length * 100).toFixed(0);
    
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `Exporting... ${i + 1} / ${chats.length}`;
    currentText.textContent = `${chat.folderName}: ${chat.title}`;
    
    try {
      // Check if already exported
      const existsCheck = await chrome.runtime.sendMessage({
        action: 'checkExportExists',
        chatId: chat.id,
        chatTitle: chat.title
      });
      
      if (existsCheck?.exists) {
        skippedCount++;
        await new Promise(r => setTimeout(r, 10));
        continue;
      }
      
      if (window.chatExporter) {
        const result = await window.chatExporter.exportChatById(chat.id, chat.title);
        
        if (result.success && result.markdown) {
          // Send to background to write file
          const saveResponse = await chrome.runtime.sendMessage({
            action: 'saveExport',
            filename: result.filename,
            content: result.markdown
          });
          
          if (saveResponse?.success) {
            successCount++;
            await markChatAsExported(chat.id);
          } else {
            emptyCount++;
          }
        } else {
          emptyCount++;
        }
      }
    } catch (e) {
      emptyCount++;
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }
  
  if (!cancelled) {
    modal.remove();
    const parts = [];
    if (successCount > 0) parts.push(`${successCount} exported`);
    if (skippedCount > 0) parts.push(`${skippedCount} skipped (already exist)`);
    if (emptyCount > 0) parts.push(`${emptyCount} empty chats`);
    showNotification(`Export complete! ${parts.join(', ')}`);
  }
}
