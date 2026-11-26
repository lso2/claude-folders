// content/cf-monitor.js
// Watches Claude's sidebar for chats not yet imported and offers a one-click sync.
// Globals: monitoredNewChats, syncNotificationEl, syncInProgress, CF_SYNC_NOTIFY_THRESHOLD, cfSyncNoticeHidden,
//          cfReadNoticeChoice, startNewChatMonitor, scanForNewChats, checkSyncThreshold, showSyncNotification,
//          cfRefreshSyncBar, cfSyncBarClick, hideSyncNotification, runSyncAndClear, observeUrlForSync
// Depends on: content/cf-state.js, content/cf-account.js, content/cf-disk.js, content/cf-sync.js,
//             lib/storage-keys.js (AUTO_SYNC_KEY, AUTO_SYNC_DEFAULT, HIDE_SYNC_NOTICE_KEY)
// Notes: docs/notes/content/cf-monitor.js.md

// ============ PASSIVE NEW CHAT MONITOR ============
let monitoredNewChats = new Set();
let syncNotificationEl = null;
let syncInProgress = false;
// True while automatic sync is on and the settings page's Hide the new chats notice is checked
let cfSyncNoticeHidden = false;

// Nothing stored for the notice choice counts as checked
async function cfReadNoticeChoice() {
  try {
    const stored = await chrome.storage.local.get([AUTO_SYNC_KEY, HIDE_SYNC_NOTICE_KEY]);
    const auto = { ...AUTO_SYNC_DEFAULT, ...(stored[AUTO_SYNC_KEY] || {}) };
    cfSyncNoticeHidden = auto.enabled === true && stored[HIDE_SYNC_NOTICE_KEY] !== false;
  } catch (e) {
    console.log('[MONITOR] Notice choice not read:', e.message);
  }
  return cfSyncNoticeHidden;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || (!changes[AUTO_SYNC_KEY] && !changes[HIDE_SYNC_NOTICE_KEY])) return;
  cfReadNoticeChoice().then(() => checkSyncThreshold());
});

function startNewChatMonitor() {
  console.log('[MONITOR] Starting passive chat monitor');
  
  // Load tracked IDs from storage (per active account), after the notice choice
  cfReadNoticeChoice().then(() => chrome.storage.local.get(cfMonitorKey())).then((result) => {
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
  
  // Chats filed after detection, by an import or Add to folder, leave the waiting set
  let changed = false;
  for (const id of Array.from(monitoredNewChats)) {
    if (knownIds.has(id)) {
      monitoredNewChats.delete(id);
      changed = true;
    }
  }

  // Chat, Cowork session and Claude Code session links in the sidebar
  const chatLinks = document.querySelectorAll('a[href*="/chat/"], a[href*="/cowork/cse_"], a[href*="/code/session_"]');
  let foundNew = false;
  let scanned = 0;

  for (const link of chatLinks) {
    const href = link.getAttribute('href') || '';
    const code = href.match(/\/code\/session_([A-Za-z0-9]+)/);
    const match = href.match(/\/chat\/([a-f0-9-]+)/i) || href.match(/\/cowork\/(cse_[A-Za-z0-9]+)/);
    if (!match && !code) continue;
    const chatId = code ? 'cse_' + code[1] : match[1];
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

  if (foundNew || changed) {
    chrome.storage.local.set({ [cfMonitorKey()]: [...monitoredNewChats] });
    checkSyncThreshold();
  }
}

// Unimported chats needed before the sync bar appears; each scan logs what it saw
const CF_SYNC_NOTIFY_THRESHOLD = 1;

function checkSyncThreshold() {
  const count = monitoredNewChats.size;
  if (cfSyncNoticeHidden) {
    console.log('[MONITOR] Pending new chats:', count + '. The notice is hidden while automatic sync is on (settings page).');
    hideSyncNotification();
    return;
  }
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
  
  // Only show when NOT in a chat or a Cowork session
  const inChat = window.location.pathname.match(/\/chat\/[a-f0-9-]+|\/cowork\/cse_/i);
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
        background: var(--cf-orange);
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
        max-width: min(680px, calc(100vw - 32px));
        box-sizing: border-box;
      }
      #claude-folders-sync-notification .sync-access {
        font-size: 13px;
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
        background: rgba(0, 0, 0, 0.22);
        border: none;
        color: #ffffff;
        padding: 6px 14px;
        border-radius: 6px;
        cursor: pointer;
        font-size: 13px;
        font-weight: 600;
        transition: background 0.15s;
      }
      #claude-folders-sync-notification .sync-btn:hover {
        background: rgba(0, 0, 0, 0.32);
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
    <span class="sync-access" hidden></span>
    <button class="sync-btn">Sync Now</button>
    <button class="sync-btn sync-access-btn" hidden></button>
    <button class="dismiss-btn">×</button>
  `;

  document.body.appendChild(syncNotificationEl);

  syncNotificationEl.querySelector('.sync-btn:not(.sync-access-btn)').addEventListener('click', cfSyncBarClick);

  syncNotificationEl.querySelector('.dismiss-btn').addEventListener('click', () => {
    hideSyncNotification();
  });
  cfRefreshSyncBar();
}

// Sync Now is always on the bar. A folder without access adds the reason and the button that opens the
// settings page; Sync Now then stops at the same check and shows that notice.
async function cfRefreshSyncBar() {
  if (!syncNotificationEl) return;
  const access = await cfCheckWriteAccess();
  if (!syncNotificationEl) return;
  const note = syncNotificationEl.querySelector('.sync-access');
  const accessBtn = syncNotificationEl.querySelector('.sync-access-btn');
  if (access.ok) {
    note.hidden = true;
    accessBtn.hidden = true;
    return;
  }
  const action = cfIsFolderRefusal(access)
    ? cfFolderAccessAction(access)
    : { message: 'Folder access not read: ' + access.error, label: null };
  note.textContent = action.message;
  note.hidden = false;
  accessBtn.textContent = action.label || '';
  accessBtn.hidden = !action.label;
  accessBtn.onclick = action.label ? () => action.run() : null;
}

function cfSyncBarClick() {
  hideSyncNotification();
  runSyncAndClear();
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

  // The sync reads the conversation list from Claude's API on this page. content/cf-sync.js moves to
  // Recents only when that list cannot be read and the rendered page is the only source.
  showNotification('Syncing new chats...');
  await scrapeRecentsPage();
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
