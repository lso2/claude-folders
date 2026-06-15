// Content Script - Injects folder UI into claude.ai

let folders = [];
let categories = [];
let allChats = [];
let metadata = {};
let cfOrganizeIndex = []; // ordered chat ids from the last "Ask Claude" prompt
let cfLegacyAvailable = false; // older data exists that this account can restore by syncing
let currentChatId = null;
let sidebarInjected = false;
let panelExpanded = false;
let sidebarInjectRetries = 0;

// Shared folder glyph used for the sidebar nav icon and panel headers
const CF_FOLDER_ICON_PATH = 'M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z';

// Escape user-supplied strings before they go into innerHTML so a title like
// "<img onerror=...>" renders as text instead of breaking the layout
function cfEscapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow safe chat links into href so a stored "javascript:" url can't run
function cfSafeUrl(url) {
  const s = String(url || '');
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return cfEscapeHtml(s);
  return '#';
}

// ===== Account scoping =====
// Folders, known IDs and pending lists are stored separately per signed-in
// account so switching Claude accounts never shows the previous one's chats.
let cfAccountKey = 'acct_default';
let cfAccountReady = null;

function cfHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

async function cfResolveAccountKey() {
  try {
    const res = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
    if (res.ok) {
      const orgs = await res.json();
      if (Array.isArray(orgs) && orgs.length) {
        const ids = orgs.map(o => o && (o.uuid || o.id)).filter(Boolean).sort();
        if (ids.length) return 'acct_' + cfHash(ids.join('|'));
      }
    }
  } catch (e) {
    console.log('[CONTENT] account resolve failed:', e.message);
  }
  try {
    const btn = document.querySelector('[data-testid="user-menu-button"]');
    const txt = btn?.textContent?.trim();
    if (txt) return 'acct_' + cfHash(txt);
  } catch (e) {}
  return 'acct_default';
}

function cfKnownKey() { return 'knownChatIds__' + cfAccountKey; }
function cfPendingKey() { return 'pendingNewChats__' + cfAccountKey; }
function cfMonitorKey() { return 'monitoredNewChats__' + cfAccountKey; }

async function cfInitAccount() {
  cfAccountKey = await cfResolveAccountKey();
  console.log('[CONTENT] account key:', cfAccountKey);
  try {
    await chrome.runtime.sendMessage({ action: 'setAccount', accountKey: cfAccountKey });
  } catch (e) {
    console.log('[CONTENT] setAccount failed:', e.message);
  }
}

init();

function init() {
  console.log('[CONTENT] Claude Folders loaded');
  updateCurrentChatId();
  scrapeUserInfo();

  // Everything that reads per-account data waits until the key is resolved and
  // handed to the background, so the first load already targets this account.
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
    await chrome.storage.local.set({ [cfPendingKey()]: pendingNewChats });
    
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
      [cfKnownKey()]: Array.from(knownChatIds),
      [cfPendingKey()]: []
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
      [cfKnownKey()]: Array.from(knownChatIds),
      [cfPendingKey()]: []
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

// Find the nav anchor we clone for styling. Claude relabels and restructures
// the sidebar often, so try several anchors by text and only fall back to the
// first icon-bearing link, rather than depending on one exact label.
function findSidebarTemplateLink(nav) {
  const links = Array.from(nav.querySelectorAll('a'));
  const byText = (label) => links.find(a => a.textContent.trim().toLowerCase().includes(label));
  return byText('projects') || byText('chats') || links.find(a => a.querySelector('svg')) || links[0] || null;
}

// Build a folder icon sized to fill Claude's icon box (so it lines up with the
// other nav icons and stays visible when the sidebar collapses).
function buildFolderSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.style.cssText = 'width:20px;height:20px;flex:0 0 auto;';
  svg.innerHTML = `<path d="${CF_FOLDER_ICON_PATH}"/>`;
  return svg;
}

// Convert the cloned "Projects" link into "Folders" while keeping Claude's exact
// inner structure (the translate offset, the sized icon box, the truncating label
// span). That structure is what makes the row align with the other nav items and
// collapse with the sidebar, so we only swap two things: the icon-font glyph
// (<span data-cds="Icon">) becomes a folder SVG, and the label text becomes
// "Folders". After the glyph is gone, the first remaining text node is the label,
// so we rename it and blank any leftover copies to avoid a duplicate "Projects".
function renderFoldersLinkInner(link) {
  const glyph = link.querySelector('[data-cds="Icon"]');
  if (glyph) {
    glyph.replaceWith(buildFolderSvg());
  } else if (!link.querySelector('svg')) {
    link.insertBefore(buildFolderSvg(), link.firstChild);
  }

  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (node.textContent && node.textContent.trim().length > 0) textNodes.push(node);
  }
  if (textNodes.length > 0) {
    textNodes[0].textContent = 'Folders';
    for (let i = 1; i < textNodes.length; i++) textNodes[i].textContent = '';
  }
}

function injectSidebar() {
  // Check if our link still exists (React may have removed it)
  if (document.querySelector('a[data-folders-link="true"]')) return;

  const nav = document.querySelector('nav');
  const templateLink = nav ? findSidebarTemplateLink(nav) : null;

  if (!nav || !templateLink) {
    // Cap retries so a Claude DOM change can't schedule callbacks forever
    if (sidebarInjectRetries++ < 30) {
      setTimeout(injectSidebar, 500);
    } else {
      console.log('[CONTENT] Gave up injecting sidebar - nav/template link not found');
    }
    return;
  }
  sidebarInjectRetries = 0;

  const foldersLink = templateLink.cloneNode(true);
  foldersLink.setAttribute('data-folders-link', 'true');
  foldersLink.setAttribute('aria-label', 'Folders');
  foldersLink.removeAttribute('aria-current');
  foldersLink.classList.remove('active');
  renderFoldersLinkInner(foldersLink);

  foldersLink.href = '#';
  foldersLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFoldersPanel();
  });

  templateLink.parentNode.insertBefore(foldersLink, templateLink.nextSibling);
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

  // Anchor the flyout to the real sidebar edge so it sits flush whether the
  // sidebar is expanded or collapsed (the CSS default assumes the expanded width)
  const navEl = document.querySelector('a[data-folders-link="true"]')?.closest('nav') || document.querySelector('nav');
  if (navEl) {
    const right = Math.round(navEl.getBoundingClientRect().right);
    if (right > 0) panel.style.left = right + 'px';
  }

  // Close on outside click (delay to avoid immediate close)
  setTimeout(() => {
    document.addEventListener('click', closePanelOnOutsideClick);
  }, 100);
}

function closePanelOnOutsideClick(e) {
  const panel = document.querySelector('.claude-folders-panel');
  const foldersLink = document.querySelector('a[data-folders-link="true"]'); // The Folders nav link
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
    const emptyHint = cfLegacyAvailable
      ? 'Previously organized data was found. Run a Sync on this account to restore it.'
      : 'Use Import or Ask Claude to add chats';
    html += `<div class="folders-empty"><p>No folders yet</p><p style="font-size:12px;color:#888;">${cfEscapeHtml(emptyHint)}</p></div>`;
  } else {
    const byCategory = {};
    folders.forEach(f => {
      if (!byCategory[f.category]) byCategory[f.category] = [];
      byCategory[f.category].push(f);
    });
    
    Object.keys(byCategory).forEach(cat => {
      html += `<div class="folder-category-group"><div class="folder-category-header">${cfEscapeHtml(cat)}</div>`;
      byCategory[cat].forEach(folder => {
        const chatCount = folder.chats ? folder.chats.length : 0;
        html += `
          <div class="folder-panel-item" data-folder-id="${cfEscapeHtml(folder.id)}">
            <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor" style="margin-right:8px;opacity:0.6;flex-shrink:0;">
              <path d="M2 3h6l2 2h6v10H2V3z"/>
            </svg>
            <span class="folder-panel-name">${cfEscapeHtml(folder.name)}</span>
            <span class="folder-panel-count">${chatCount}</span>
            <button class="folder-export-btn" data-folder-id="${cfEscapeHtml(folder.id)}" title="Export folder to markdown">
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
          <div class="folder-chats-list" data-folder-id="${cfEscapeHtml(folder.id)}" data-shown="10" style="display:none;">
            ${(folder.chats || []).slice(0, 10).map(chat => `
              <a href="${cfSafeUrl(chat.url)}" target="_blank" class="folder-chat-link" title="${cfEscapeHtml(chat.title)}">
                ${cfEscapeHtml(chat.title)}
              </a>
            `).join('')}
            ${(folder.chats?.length || 0) > 10 ? `<button class="folder-load-more-btn" data-folder-id="${cfEscapeHtml(folder.id)}">Load +${folder.chats.length - 10} more</button>` : ''}
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
  
  // Setup actions (Ask Claude / Apply) stay open by default. The gear is always
  // available and only collapses the row when the user wants more list room.
  const toggleSetupBtn = panel.querySelector('.toggle-setup-btn');
  const panelActions = panel.querySelector('.folders-panel-actions');

  if (toggleSetupBtn) toggleSetupBtn.style.display = 'flex';
  if (panelActions) panelActions.style.display = 'block';

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
      <a href="${cfSafeUrl(chat.url)}" target="_blank" class="folder-chat-link" title="${cfEscapeHtml(chat.title)}">
        ${cfEscapeHtml(chat.title)}
      </a>
    `).join('');

    if (remaining > 0) {
      html += `<button class="folder-load-more-btn" data-folder-id="${cfEscapeHtml(folderId)}">Load +${remaining} more</button>`;
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
  picker.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  picker.style.left = 'auto';

  let html = '<div class="folders-picker-header">Select folder</div><div class="folders-picker-list">';

  if (folders.length > 0) {
    folders.forEach(folder => {
      html += `
        <div class="folder-picker-item" data-folder-id="${cfEscapeHtml(folder.id)}">
          <span class="folder-category">${cfEscapeHtml(folder.category)}</span>
          <span class="folder-name">${cfEscapeHtml(folder.name)}</span>
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
        ${(categories.length > 0 ? categories : ['Personal', 'Work', 'Projects']).map(cat => `<option value="${cfEscapeHtml(cat)}">${cfEscapeHtml(cat)}</option>`).join('')}
      </select>
      <button class="create-folder-btn">Create & Add</button>
    </div>
  `;

  picker.innerHTML = html;
  document.body.appendChild(picker);

  // Clamp inside the viewport: if it would spill past the bottom, flip above
  const pickerRect = picker.getBoundingClientRect();
  if (pickerRect.bottom > window.innerHeight - 8) {
    const flippedTop = rect.top - pickerRect.height - 8;
    picker.style.top = `${Math.max(8, flippedTop)}px`;
  }
  
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
  let checkScheduled = false;

  // React mutates the DOM constantly, so coalesce bursts of mutations into one
  // check on the next animation frame instead of querying on every mutation.
  const scheduleCheck = () => {
    if (checkScheduled) return;
    checkScheduled = true;
    requestAnimationFrame(() => {
      checkScheduled = false;
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
    });
  };

  new MutationObserver(scheduleCheck).observe(document, { subtree: true, childList: true });
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

  const analysis = analyzeChatsLocally();

  if (analysis.totalChats === 0) {
    showNotification('No chats to organize! Import chats first.', true);
    return;
  }

  // Send Claude the real numbered titles (so it can both design folders AND
  // directly assign the obvious ones) plus the frequency hints. The number->id
  // map is stored so the pasted-back response resolves to real chats.
  cfOrganizeIndex = allChats.map(c => c.id);
  const MAX_TITLES = 2000;
  const numbered = allChats.slice(0, MAX_TITLES)
    .map((c, i) => `${i + 1}. ${String(c.title || '').replace(/\s+/g, ' ').slice(0, 120)}`)
    .join('\n');

  const prompt = `I have ${analysis.totalChats} Claude chat titles to organize into folders. Each title is numbered.

FREQUENT WORDS: ${analysis.topWords.map(w => w.word).join(', ')}
FREQUENT PHRASES: ${analysis.topPhrases.map(p => p.phrase).join(', ')}

NUMBERED TITLES:
${numbered}

Design a folder system AND assign the clearly-matching titles. Return ONLY valid JSON in this shape:
{
  "categories": [
    {
      "name": "Category Name",
      "folders": [
        {"name": "Folder Name", "keywords": ["distinctive phrase", "specific term"], "chats": [12, 47, 103]}
      ]
    }
  ]
}

Rules:
- 6-9 categories, 2-5 folders each. Order the most specific category/folder first.
- keywords: 6-15 per folder. Strongly prefer DISTINCTIVE multi-word phrases ("global payments", "android app", "wordpress plugin") and specific nouns. Never use a generic word on its own (app, code, data, system, design, file, update, project, fix, build, error) - only inside a longer phrase. Keywords match whole words, case-insensitive.
- chats: the NUMBERS of titles that clearly belong in that folder. Include only ones you are confident about and leave the rest out (the keywords catch them). Each number in at most one folder.
- Last category "Miscellaneous", folder "General", keywords [], no chats.
- Return ONLY the JSON, no markdown, no commentary.`;

  await chrome.storage.local.set({
    pendingOrganizePrompt: prompt,
    pendingOrganizeAnalysis: analysis,
    ['organizeIndex__' + cfAccountKey]: cfOrganizeIndex
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

// ===== Shared text helpers for the categorizer =====
function cfTokenize(text) { return (String(text || '').toLowerCase().match(/[a-z0-9]+/g) || []); }
function cfEscapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function cfNormKw(s) { return String(s || '').toLowerCase().trim(); }

// Precompile folder keyword rules. A keyword shared across many folders gets an
// IDF down-weight (1/df) so generic words like "design" barely score, while
// distinctive phrases score high. Single words match on whole-word boundaries
// so "car" no longer matches inside "scorecard".
function cfBuildKeywordIndex(cats) {
  const folderCountByKw = new Map();
  const raw = [];
  (cats || []).forEach(cat => (cat.folders || []).forEach(fd => {
    const uniq = [...new Set((fd.keywords || []).map(cfNormKw).filter(Boolean))];
    raw.push({ category: cat.name, name: fd.name, keywords: uniq });
    uniq.forEach(kw => folderCountByKw.set(kw, (folderCountByKw.get(kw) || 0) + 1));
  }));
  return raw.map(rf => ({
    category: rf.category, name: rf.name,
    rules: rf.keywords.map(kw => {
      const isPhrase = kw.includes(' ');
      const df = folderCountByKw.get(kw) || 1;
      let base = isPhrase ? 3 : 1;
      if (kw.length >= 7) base += 0.5;
      base *= 1 / df;
      return { kw, isPhrase, base, re: isPhrase ? null : new RegExp('(^|[^a-z0-9])' + cfEscapeRe(kw) + '([^a-z0-9]|$)') };
    })
  }));
}

function cfScoreText(text, folder) {
  let s = 0;
  for (const r of folder.rules) {
    if (r.isPhrase) { if (text.includes(r.kw)) s += r.base; }
    else { if (r.re.test(text)) s += r.base; }
  }
  return s;
}

function cfReconcileTokens(name) { return new Set(cfTokenize(name).filter(t => t.length > 2 && t !== 'and' && t !== 'the')); }
function cfJaccard(a, b) { if (!a.size || !b.size) return 0; let i = 0; a.forEach(x => { if (b.has(x)) i++; }); return i / (a.size + b.size - i); }

// Merge + reconcile: snap a pre-existing category onto the closest new canonical
// name (so "Data & Analytics" folds into "Data & Analysis"), then merge folders
// that share a category and normalized name. The Unsorted bucket is left alone.
function cfReconcile(folderList, canonicalCats) {
  const canon = (canonicalCats || []).filter(Boolean);
  const canonTok = canon.map(c => ({ name: c, tok: cfReconcileTokens(c) }));
  const remap = new Map();
  folderList.forEach(f => {
    if (f.id === 'unsorted') { f.category = 'Unsorted'; return; }
    if (!f.category) f.category = 'Miscellaneous';
    if (canon.includes(f.category)) return;
    if (remap.has(f.category)) { f.category = remap.get(f.category); return; }
    const ft = cfReconcileTokens(f.category);
    let best = null, bestJ = 0;
    canonTok.forEach(c => { const j = cfJaccard(ft, c.tok); if (j > bestJ) { bestJ = j; best = c.name; } });
    const mapped = (best && bestJ >= 0.30) ? best : f.category;
    remap.set(f.category, mapped);
    f.category = mapped;
  });
  const normName = s => cfTokenize(s).join(' ');
  const seen = new Map();
  const out = [];
  for (const f of folderList) {
    const key = f.category.toLowerCase().trim() + '::' + normName(f.name);
    if (seen.has(key)) {
      const tgt = seen.get(key);
      const have = new Set(tgt.chats.map(c => c.id));
      (f.chats || []).forEach(c => { if (!have.has(c.id)) { tgt.chats.push(c); have.add(c.id); } });
    } else { seen.set(key, f); out.push(f); }
  }
  return out;
}

function applyCategorization(categoryDefs) {
  // Hybrid merge: (1) apply Claude's confident per-folder chat assignments, then
  // (2) a scored keyword matcher (whole-word, phrase-weighted, generic keywords
  // IDF-damped, best match wins) for the rest, (3) leftovers to Unsorted, then
  // (4) reconcile near-duplicate categories. Preserves existing folder ids/names.
  const merged = JSON.parse(JSON.stringify(folders || []));
  const preExistingIds = new Set((folders || []).map(f => f.id));
  const folderKey = (cat, name) => `${(cat || '').toLowerCase().trim()}::${(name || '').toLowerCase().trim()}`;
  const byKey = new Map();
  merged.forEach(f => byKey.set(folderKey(f.category, f.name), f));

  const chatById = new Map();
  (allChats || []).forEach(c => chatById.set(c.id, c));
  merged.forEach(f => f.chats?.forEach(c => { if (!chatById.has(c.id)) chatById.set(c.id, c); }));

  let nextIdNum = 1;
  const makeId = () => { let id; do { id = `folder-${nextIdNum++}`; } while (merged.some(f => f.id === id)); return id; };
  const getOrCreateFolder = (category, name) => {
    const key = folderKey(category, name);
    let f = byKey.get(key);
    if (!f) { f = { id: makeId(), name: name || 'Untitled', category: category || 'Miscellaneous', chats: [] }; merged.push(f); byKey.set(key, f); }
    if (!Array.isArray(f.chats)) f.chats = [];
    return f;
  };
  const assignChat = (target, chatId) => {
    const meta = chatById.get(chatId) || { id: chatId, title: 'Untitled Chat', url: `https://claude.ai/chat/${chatId}`, date: new Date().toISOString().split('T')[0] };
    merged.forEach(f => { if (f.chats) f.chats = f.chats.filter(c => c.id !== chatId); });
    target.chats.push({ id: chatId, title: meta.title, url: meta.url, date: meta.date, relativeDate: meta.relativeDate, snippet: meta.snippet || '', tags: meta.tags || [], exported: meta.exported });
  };

  // Resolve a chat reference: a 1-based number (from the prompt), numeric string,
  // an id, or {id}/{index}. Numbers map through the stored prompt index.
  const arrIdx = (cfOrganizeIndex && cfOrganizeIndex.length) ? cfOrganizeIndex : (allChats || []).map(c => c.id);
  const resolveId = (ref) => {
    if (ref == null) return null;
    if (typeof ref === 'object') ref = ref.id ?? ref.chatId ?? ref.index;
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
      const n = Number(ref);
      if (n >= 1 && n <= arrIdx.length) return arrIdx[n - 1];
      if (arrIdx[n] != null) return arrIdx[n];
      return null;
    }
    return String(ref);
  };

  const assigned = new Set();
  const cats = Array.isArray(categoryDefs.categories) ? categoryDefs.categories : [];
  const explicitFolders = Array.isArray(categoryDefs.folders) ? categoryDefs.folders : null;

  // PHASE 1 - Claude's confident assignments (chats listed per folder) win first
  const applyExplicit = (category, name, refs) => {
    if (!Array.isArray(refs) || !refs.length) return;
    const target = getOrCreateFolder(category, name);
    for (const ref of refs) {
      const id = resolveId(ref);
      if (!id || assigned.has(id) || !chatById.has(id)) continue;
      assignChat(target, id);
      assigned.add(id);
    }
  };
  if (explicitFolders) { for (const fd of explicitFolders) { if (fd) applyExplicit(fd.category, fd.name, fd.chats || fd.chatIndices); } }
  for (const cat of cats) { for (const fd of (cat.folders || [])) { applyExplicit(cat.name, fd.name, fd.chats || fd.chatIndices); } }

  // PHASE 2 - scored keyword matching, best folder wins, for the remainder
  const ruleFolders = cfBuildKeywordIndex(cats);
  const THRESH = 0.6;
  for (const chat of (allChats || [])) {
    if (assigned.has(chat.id)) continue;
    const text = ' ' + String(chat.title || '').toLowerCase() + ' ' + String(chat.snippet || '').toLowerCase() + ' ';
    let best = null, bestScore = 0;
    for (const rf of ruleFolders) {
      if (!rf.rules.length) continue;
      const sc = cfScoreText(text, rf);
      if (sc > bestScore) { bestScore = sc; best = rf; }
    }
    if (best && bestScore >= THRESH) { assignChat(getOrCreateFolder(best.category, best.name), chat.id); assigned.add(chat.id); }
  }

  // PHASE 3 - anything still unplaced goes to Unsorted (kept visible, never absorbed)
  let unsorted = merged.find(f => f.id === 'unsorted');
  (allChats || []).forEach(c => {
    if (merged.some(f => f.chats?.some(x => x.id === c.id))) return;
    if (!unsorted) { unsorted = { id: 'unsorted', name: 'Unsorted Chats', category: 'Unsorted', chats: [] }; merged.push(unsorted); }
    unsorted.chats.push({ id: c.id, title: c.title, url: c.url, date: c.date, relativeDate: c.relativeDate, snippet: c.snippet || '', tags: c.tags || [], exported: c.exported });
  });

  let result = merged.filter(f => (f.chats && f.chats.length > 0) || preExistingIds.has(f.id) || f.id === 'unsorted');

  // PHASE 4 - collapse near-duplicate categories/folders
  result = cfReconcile(result, cats.map(c => c.name));

  const uniqueCategories = [...new Set([...(categories || []), ...result.map(f => f.category)].filter(Boolean))];
  return { categories: uniqueCategories, folders: result };
}

function showApplyCategoriesModal() {
  // Restore the number->id map from the last "Ask Claude" run so pasted-back
  // numeric assignments resolve, even if this is a fresh page load.
  if (!cfOrganizeIndex.length) {
    chrome.storage.local.get('organizeIndex__' + cfAccountKey, (r) => {
      const idx = r['organizeIndex__' + cfAccountKey];
      if (Array.isArray(idx) && idx.length) cfOrganizeIndex = idx;
    });
  }

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
      statsDiv.innerHTML = `<span style="color:#ef4444;">Error: ${cfEscapeHtml(e.message)}</span>`;
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

// Convert a relative label like "3 hours ago" / "Yesterday" to an ISO date
function cfRelativeToISODate(relativeDate) {
  let date = new Date();
  if (relativeDate) {
    const d = new Date();
    const num = (re) => { const m = relativeDate.match(re); return m ? parseInt(m[1]) : null; };
    const minutes = num(/(\d+)\s+minute/i);
    const hours = num(/(\d+)\s+hour/i);
    const days = num(/(\d+)\s+day/i);
    const weeks = num(/(\d+)\s+week/i);
    const months = num(/(\d+)\s+month/i);
    const years = num(/(\d+)\s+year/i);
    if (minutes !== null) d.setMinutes(d.getMinutes() - minutes);
    else if (hours !== null) d.setHours(d.getHours() - hours);
    else if (days !== null) d.setDate(d.getDate() - days);
    else if (weeks !== null) d.setDate(d.getDate() - weeks * 7);
    else if (months !== null) d.setMonth(d.getMonth() - months);
    else if (years !== null) d.setFullYear(d.getFullYear() - years);
    else if (relativeDate.toLowerCase().includes('yesterday')) d.setDate(d.getDate() - 1);
    date = d;
  }
  return date.toISOString().split('T')[0];
}

// Parse a recents chat <a> element into a chat record (or null if not a chat)
function cfParseChatLink(link) {
  const href = link.getAttribute('href');
  if (!href || !href.includes('/chat/')) return null;
  const match = href.match(/\/chat\/([a-f0-9-]+)/i);
  if (!match) return null;

  let title = '';
  let relativeDate = '';
  const titleEl = link.querySelector('[class*="title"]') ||
                  link.querySelector('[class*="name"]') ||
                  link.querySelector('div > div:first-child');
  const dateEl = link.querySelector('[class*="time"]') ||
                 link.querySelector('[class*="date"]') ||
                 link.querySelector('[class*="ago"]');
  if (titleEl) title = titleEl.textContent?.trim() || '';
  if (dateEl) relativeDate = dateEl.textContent?.trim() || '';

  if (!title || !relativeDate) {
    const fullText = link.textContent?.trim() || '';
    const timeMatch = fullText.match(/(\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago|Yesterday|Today)/i);
    if (timeMatch) {
      relativeDate = relativeDate || timeMatch[1];
      const idx = fullText.indexOf('Last message');
      if (idx > 0) title = title || fullText.substring(0, idx).trim();
      else title = title || fullText.replace(/Last message.*$/i, '').replace(timeMatch[0], '').trim();
    } else if (!title) {
      title = fullText;
    }
  }

  title = title.replace(/\s+/g, ' ').trim();
  if (title.length > 200) title = title.substring(0, 197) + '...';
  if (!title || title.length < 2) title = 'Untitled Chat';

  return {
    id: match[1],
    title,
    url: href.startsWith('http') ? href : `https://claude.ai${href}`,
    date: cfRelativeToISODate(relativeDate),
    relativeDate: relativeDate || 'Today',
    snippet: '',
    tags: []
  };
}

// Find the nearest scrollable ancestor of the chat list so we can drive it
function cfFindScroller(root) {
  let el = root.querySelector('a[href*="/chat/"]');
  while (el && el !== document.body) {
    const style = getComputedStyle(el);
    if (/(auto|scroll)/.test(style.overflowY) && el.scrollHeight > el.clientHeight + 20) return el;
    el = el.parentElement;
  }
  return null;
}

// Claude's recents list is infinite-scroll, so we scroll to the bottom and wait
// for lazy-loaded rows instead of clicking a "Show more" button that no longer
// exists. Collects every chat link (deduped by id). Returns all visible records
// so the caller can both add new chats and refresh changed ones.
async function cfCollectChatsByScrolling(rootEl, onProgress) {
  const root = rootEl || document.body;
  const seenIds = new Set();
  const collected = [];
  let stagnantRounds = 0;
  let lastCount = -1;

  for (let round = 0; round < 200; round++) {
    const links = root.querySelectorAll('a[href*="/chat/"]');
    for (const link of links) {
      if (link.closest('nav')) continue;
      const record = cfParseChatLink(link);
      if (!record || seenIds.has(record.id)) continue;
      seenIds.add(record.id);
      collected.push(record);
    }

    if (onProgress) onProgress(collected.length);

    // Stop once the count stops growing across several scroll attempts
    if (collected.length === lastCount) {
      if (++stagnantRounds >= 4) break;
    } else {
      stagnantRounds = 0;
      lastCount = collected.length;
    }

    // Prefer a real load-more button if one exists, otherwise scroll
    const moreBtn = Array.from(root.querySelectorAll('button')).find(btn => {
      const t = btn.textContent.trim().toLowerCase();
      return (t.includes('show more') || t.includes('load more')) && !btn.closest('nav');
    });
    if (moreBtn) {
      moreBtn.click();
    } else {
      const scroller = cfFindScroller(root);
      if (scroller) scroller.scrollTo(0, scroller.scrollHeight);
      else window.scrollTo(0, document.body.scrollHeight);
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  return collected;
}

async function scrapeAllChats() {
  console.log('[SCRAPER] Starting...');
  showNotification('Scraping chats...');

  monitoredNewChats.clear();
  chrome.storage.local.set({ [cfMonitorKey()]: [] });
  hideSyncNotification();

  await new Promise(resolve => setTimeout(resolve, 2000));

  const existingIds = new Set();
  folders.forEach(f => { if (f.chats) f.chats.forEach(c => existingIds.add(c.id)); });
  console.log('[SCRAPER] Existing chat IDs:', existingIds.size);

  const collected = await cfCollectChatsByScrolling(document.body, (count) => {
    showNotification(`Scanning... ${count} chats found`);
  });
  const newChats = collected.filter(c => !existingIds.has(c.id));

  // Send everything: background adds new chats and refreshes changed metadata
  if (collected.length > 0) {
    try {
      await chrome.runtime.sendMessage({ action: 'scrapedChats', chats: collected });
    } catch (error) {
      console.log('[SCRAPER] Error:', error.message);
    }
  }

  showNotification(`Done! ${newChats.length} new, ${collected.length} scanned`);
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
    chrome.storage.local.set({ [cfMonitorKey()]: [] });
  }
  
  console.log('[SCRAPER] Scraping recents page...');
  showSyncProgressBar('Syncing from Recents...');

  // Wait for page to fully render
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Get existing IDs from all folders
  const existingIds = new Set();
  folders.forEach(f => {
    if (f.chats) f.chats.forEach(c => existingIds.add(c.id));
  });
  console.log('[SCRAPER] Existing chat IDs:', existingIds.size);

  // Find the main content area (not the nav sidebar)
  const mainContent = document.querySelector('main') || document.querySelector('[class*="main"]') || document.body;

  // Auto-scroll the recents list and collect every chat (Claude uses infinite scroll)
  const collected = await cfCollectChatsByScrolling(mainContent, (count) => {
    showSyncProgressBar(`Scanning... ${count} chats found`);
  });
  // scrapedChats = the genuinely new ones (used below for passive export + counts)
  const scrapedChats = collected.filter(c => !existingIds.has(c.id));
  console.log('[SCRAPER] Scanned', collected.length, 'chats,', scrapedChats.length, 'new');

  // Send everything: background adds new chats and refreshes changed metadata
  if (collected.length > 0) {
    try {
      await chrome.runtime.sendMessage({ action: 'scrapedChats', chats: collected });
      // Update known IDs so the passive monitor doesn't re-flag these
      collected.forEach(c => knownChatIds.add(c.id));
      await chrome.storage.local.set({ [cfKnownKey()]: Array.from(knownChatIds) });
    } catch (error) {
      console.log('[SCRAPER] Error:', error.message);
    }
  }
  
  await loadData();
  
  // Refresh known IDs from updated folders so monitor doesn't re-detect
  await loadKnownChatIds();
  
  // Clear any pending new chats that accumulated during sync
  pendingNewChats = [];
  await chrome.storage.local.set({ [cfPendingKey()]: [] });
  if (typeof monitoredNewChats !== 'undefined') {
    monitoredNewChats.clear();
    await chrome.storage.local.set({ [cfMonitorKey()]: [] });
  }
  
  // Now export chats to markdown
  let exportSuccess = 0;
  let exportSkipped = 0;
  let exportEmpty = 0;
  let exportFail = 0;
  
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
  
  // Load tracked IDs from storage (per active account)
  chrome.storage.local.get(cfMonitorKey(), (result) => {
    if (result[cfMonitorKey()]) {
      monitoredNewChats = new Set(result[cfMonitorKey()]);
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
    chrome.storage.local.set({ [cfMonitorKey()]: [...monitoredNewChats] });
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
  chrome.storage.local.set({ [cfMonitorKey()]: [] });

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
