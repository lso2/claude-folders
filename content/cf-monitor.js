// Claude Folders content script - new-chat monitor and popup-driven exports

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
  let scanned = 0;
  
  for (const link of chatLinks) {
    const href = link.getAttribute('href');
    if (!href?.includes('/chat/')) continue;
    const match = href.match(/\/chat\/([a-f0-9-]+)/i);
    if (!match) continue;
    const chatId = match[1];
    scanned++;

    // Skip if already known or already tracked as new
    if (knownIds.has(chatId)) continue;
    if (monitoredNewChats.has(chatId)) continue;
    
    // New chat found!
    monitoredNewChats.add(chatId);
    foundNew = true;
    console.log('[MONITOR] New chat detected:', chatId);
  }
  
  console.log('[MONITOR] Scanned', scanned, 'chat links on this page,', knownIds.size, 'already stored,', monitoredNewChats.size, 'waiting to import');

  if (foundNew) {
    // Save to storage
    chrome.storage.local.set({ [cfMonitorKey()]: [...monitoredNewChats] });
    checkSyncThreshold();
  }
}

// How many unimported chats the monitor waits for before it shows the sync bar.
// At 1 the bar appears for a single new chat; the scan log reports what each pass
// saw, so a hidden bar can be read as "nothing left to import" rather than guessed at.
const CF_SYNC_NOTIFY_THRESHOLD = 1;

function checkSyncThreshold() {
  const count = monitoredNewChats.size;
  console.log('[MONITOR] Pending new chats:', count, 'of', CF_SYNC_NOTIFY_THRESHOLD, 'needed for the sync bar');
  
  if (count >= CF_SYNC_NOTIFY_THRESHOLD) {
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
    console.log('[MONITOR]', count, 'chats waiting to import, bar held back while a chat is open');
    hideSyncNotification();
    return;
  }
  
  if (syncNotificationEl) {
    syncNotificationEl.querySelector('.sync-count').textContent = count;
    syncNotificationEl.querySelector('.sync-noun').textContent = count === 1 ? 'new chat detected' : 'new chats detected';
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
    <span><span class="sync-count">${count}</span> <span class="sync-noun">${count === 1 ? 'new chat detected' : 'new chats detected'}</span></span>
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
