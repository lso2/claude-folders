// background.js
// Service worker that answers extension messages against the cached folder data.
// Globals: cachedData, currentAccountKey, offscreenCreated, offscreenSetup, writerPort,
//          writerRequestId, acctKey, persist, broadcastDataUpdated, broadcastToClaudeTabs,
//          countChatsInData, overlapRatioWithScraped, ensureOffscreen, setUpOffscreen, askOffscreen,
//          askWriterWindow, askFolderWorker, syncDataToDisk, fileImportedChat,
//          reloadClaudeTabs, loadCachedData, countBgChats, handleMessage, CF_BACKGROUND_FILES
// Notes: docs/notes/background.js.md

// The background's other files, run in this order before the code below
const CF_BACKGROUND_FILES = ['lib/build-reload.js', 'lib/background-build.js', 'lib/helper-host.js', 'lib/storage-keys.js',
  'lib/activity-kinds.js', 'lib/activity-log.js', 'lib/activity-watch.js',
  'lib/account-identity.js', 'lib/account-migrate.js', 'lib/account-entries.js', 'lib/accounts.js', 'lib/tab-handoff.js', 'lib/organize-tabs.js',
  'lib/shell-address.js', 'lib/claude-tab.js', 'lib/account-restore.js', 'lib/auto-sync.js', 'lib/first-run.js', 'lib/library-refresh.js',
  'lib/access-window.js', 'lib/update-check.js'];
importScripts(...CF_BACKGROUND_FILES);

let cachedData = null;
let currentAccountKey = null;
let offscreenCreated = false;
// The setup in progress. Concurrent folder requests share it.
let offscreenSetup = null;
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

// The offscreen document performs every data-folder write and Chrome can close it between calls.
// While a new document is loading, hasDocument() is already true and its message listener is
// not there yet. A second request waits for the first one's setup.
function ensureOffscreen() {
  if (!offscreenSetup) offscreenSetup = setUpOffscreen().finally(() => { offscreenSetup = null; });
  return offscreenSetup;
}

async function setUpOffscreen() {
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

// Writes the cached data to the data folder, with the button color for the offline library's data.js
async function syncDataToDisk() {
  let buttonColor = null;
  try {
    buttonColor = (await chrome.storage.local.get(BUTTON_COLOR_KEY))[BUTTON_COLOR_KEY] || null;
  } catch (e) {
    console.log('[BG] Button color not read:', e.message);
  }
  const response = await askFolderWorker({ action: 'folderSyncToDisk', data: cachedData, accountKey: currentAccountKey, buttonColor }, { success: false });
  console.log('[BG] syncToDisk:', response?.success, response?.error || '');
  return response;
}

// A new button color is written into data.js for the offline library (standalone/library-color.js)
chrome.storage.onChanged.addListener(async (changes, area) => {
  if (area !== 'local' || !changes[BUTTON_COLOR_KEY]) return;
  if (!cachedData) await loadCachedData();
  syncDataToDisk();
});

// Sends one folder request to the offscreen document, creating it first when needed
async function askOffscreen(request, fallback) {
  const ready = await ensureOffscreen();
  if (!ready) return { ...fallback, error: 'The offscreen writer could not be created' };
  const response = await chrome.runtime.sendMessage({ ...request, target: 'offscreen' });
  return response || { ...fallback, error: 'No response from offscreen' };
}

// Replies from the open access window are received over its port. Null means no reply within 30 seconds,
// or the window closed before replying.
function askWriterWindow(request) {
  return new Promise((resolve) => {
    const port = writerPort;
    if (!port) return resolve(null);
    const id = ++writerRequestId;
    const finish = (result) => {
      clearTimeout(timer);
      port.onMessage.removeListener(onReply);
      port.onDisconnect.removeListener(onGone);
      resolve(result);
    };
    const onReply = (msg) => {
      if (msg && msg.id === id) finish(msg.result || null);
    };
    const onGone = () => finish(null);
    const timer = setTimeout(() => finish(null), 30000);
    port.onMessage.addListener(onReply);
    port.onDisconnect.addListener(onGone);
    try {
      port.postMessage({ id, request });
    } catch (e) {
      finish(null);
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
  cfTagChats(cachedData, currentAccountKey);
  await persist();
  await syncDataToDisk();
  await broadcastDataUpdated();
  return { success: true, folderId: folder.id };
}

// Load cached data on startup
chrome.runtime.onStartup.addListener(loadCachedData);
chrome.runtime.onInstalled.addListener(loadCachedData);

// A tab opened before an update keeps the old content scripts, cut off from the
// extension, until it loads again. claude.ai restores the composer draft on reload.
async function reloadClaudeTabs(details) {
  if (!details || details.reason !== 'update') return;
  const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
  for (const tab of tabs) {
    try {
      await chrome.tabs.reload(tab.id);
    } catch (e) {
      console.log('[BG] Could not reload tab', tab.id, '-', e.message);
    }
  }
  console.log('[BG] Updated to', chrome.runtime.getManifest().version + ':', 'reloaded', tabs.length, 'claude.ai tabs');
}
chrome.runtime.onInstalled.addListener(reloadClaudeTabs);

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
        // Switch the active account. Each account gets only its own folders.
        const key = message.accountKey || 'default';
        const switched = !(key === currentAccountKey && cachedData && cachedData.folders && cachedData.folders.length);
        let adopted = null;
        if (switched) {
          const nonEmpty = d => d && Array.isArray(d.folders) && d.folders.length;
          const slot = await chrome.storage.local.get(acctKey(key));
          let data = slot[acctKey(key)];
          // A login keyed by its organization before 1.4.0 moves to its own key (lib/account-migrate.js)
          if (!nonEmpty(data)) {
            adopted = await cfAdoptLegacySlot(key, message.legacyKey || null, message.account || null);
            if (adopted) data = adopted;
          }
          // Storage emptied by removing the extension: the login's folders are read from its data file (lib/account-restore.js)
          if (!nonEmpty(data)) data = (await cfReadAccountFile(key)) || data;
          if (!nonEmpty(data)) {
            // Folders saved before per-account slots existed go to the first account that signs in.
            // Once another account has its own slot, a new account starts empty.
            const all = await chrome.storage.local.get(null);
            const otherAccounts = Object.keys(all).filter(k => k.startsWith('cfData_') && k !== acctKey(key) && k !== 'cfData_default' && nonEmpty(all[k]));
            const legacy = nonEmpty(all.cfData_default) ? all.cfData_default : (nonEmpty(all.cachedData) ? all.cachedData : null);
            data = !otherAccounts.length && legacy ? legacy : (data || { folders: [], categories: ['Personal', 'Work', 'Projects'], metadata: {} });
            console.log('[BG] Account', key, 'has no folders yet:', otherAccounts.length ? `starting empty beside ${otherAccounts.length} other account slots` : (legacy ? 'adopting folders saved before account slots' : 'starting empty'));
          }
          currentAccountKey = key;
          cachedData = data;
          // The offscreen writer has no page context, so the key it needs to name
          // this account's data file is persisted here
          await chrome.storage.local.set({ activeAccountKey: key });
          console.log('[BG] Account', key, '-', countChatsIn(cachedData), 'chats');
        }
        // The account's email and name in its data, and its key on each chat (lib/account-identity.js)
        const identified = cfApplyAccountIdentity(cachedData, key, message.account || null);
        if (switched || identified) await persist();
        if (adopted) {
          await syncDataToDisk();
          await cfRetireLegacyFile(message.legacyKey, message.account && message.account.uuid);
        } else if (identified) {
          syncDataToDisk();
        }
        if (switched) await broadcastDataUpdated();
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
        cfTagChats(cachedData, currentAccountKey);
        await persist();
        console.log('[BG] Cache updated:', cachedData.folders?.length, 'folders');
        // Write to the user's folder via the offscreen document
        await syncDataToDisk();
        await broadcastDataUpdated();
        sendResponse({ success: true });
        break;
      
      case 'updateCache': {
        // A change saved in the popup or the organizer. The data file is written through the folder writer,
        // the one place holding the folder grant.
        cachedData = message.data;
        cfTagChats(cachedData, currentAccountKey);
        await persist();
        console.log('[BG] Cache updated:', cachedData.folders?.length, 'folders');
        const written = await syncDataToDisk();
        await broadcastDataUpdated();
        sendResponse({ success: true, written: !!(written && written.success), error: (written && written.error) || null });
        break;
      }

      case 'dataUpdated':
        await broadcastDataUpdated();
        sendResponse({ success: true });
        break;
        
      case 'createFolder':
        if (!cachedData) await loadCachedData();
        cachedData.folders.push(message.folder);
        cfTagChats(cachedData, currentAccountKey);
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
          cfTagChats(cachedData, currentAccountKey);
          await persist();
          // Tell popup to sync to disk
          syncDataToDisk();
        }
        sendResponse({ success: true });
        break;
        
      case 'scrapedChats':
        if (!cachedData) await loadCachedData();
        // Folder access may have been missing when this login was set up. A sync has it, and the login's
        // data file is read before the sync's chats are filed, so they keep their folders.
        if (!countBgChats() && currentAccountKey) {
          const fromFile = await cfReadAccountFile(currentAccountKey);
          if (fromFile) {
            cachedData = fromFile;
            cfApplyAccountIdentity(cachedData, currentAccountKey, null);
          }
        }
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
        let orgTagged = 0;
        for (const incoming of message.chats) {
          const current = existingById.get(incoming.id);
          if (current) {
            // Already organized somewhere: refresh changed metadata in place,
            // but keep the chat's folder, tags, snippet and exported flag
            if (incoming.title && incoming.title !== current.title) { current.title = incoming.title; updatedCount++; }
            if (incoming.date) current.date = incoming.date;
            // A sync compares updatedAt with the export's time to find outdated exports (content/cf-export-run.js)
            if (incoming.updatedAt) current.updatedAt = incoming.updatedAt;
            if (incoming.createdAt) current.createdAt = incoming.createdAt;
            if (incoming.relativeDate) current.relativeDate = incoming.relativeDate;
            if (incoming.url) current.url = incoming.url;
            // A chat stored before chats carried their organization gets it from the listing
            if (incoming.orgId && !current.orgId) { current.orgId = incoming.orgId; orgTagged++; }
            if (incoming.orgId && incoming.orgId === current.orgId && incoming.orgName) current.orgName = incoming.orgName;
          } else {
            // Genuinely new: drop it into Unsorted and remember it
            unsorted.chats.push(incoming);
            existingById.set(incoming.id, incoming);
            newCount++;
          }
        }
        cfTagChats(cachedData, currentAccountKey);
        console.log('[BG] scrapedChats: received', message.chats.length, ', new:', newCount, ', updated:', updatedCount, ', organization added:', orgTagged);
        console.log('[BG] unsorted folder now has', unsorted.chats.length, 'chats');
        
        // Save to storage first
        await persist();
        console.log('[BG] Saved to chrome.storage.local');

        // Write to the user's folder via the offscreen document. The sync summary reports whether data.js was written.
        const libraryWrite = await syncDataToDisk();
        sendResponse({ success: true, count: newCount, updated: updatedCount, orgTagged, libraryWritten: !!(libraryWrite && libraryWrite.success) });
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

      // The version on GitHub against the running one (lib/update-check.js)
      case 'checkForUpdate':
        sendResponse(await cfCheckForUpdate(message.force === true));
        break;

      // mode: 'setup', 'restore' or 'hold' (lib/access-window.js)
      case 'openFolderAccess':
        await openAccessWindow(message.mode);
        sendResponse({ success: true });
        break;

      case 'openFlagsPage': {
        // Only a browser flag page; the URL itself comes from lib/folder-picker.js
        const url = String(message.url || '');
        if (!/^chrome:\/\/flags\/#[a-z0-9-]+$/.test(url)) {
          sendResponse({ success: false, error: `not a flags page: ${url}` });
          break;
        }
        const tab = await chrome.tabs.create({ url });
        sendResponse({ success: true, tabId: tab.id });
        break;
      }

      case 'folderAccessChanged':
        // Sent by the access window once the folder can be written again
        cfLogActivity('Folder access', `Folder access granted${message.written ? `, ${message.written} queued export${message.written === 1 ? '' : 's'} written` : ''}${message.failed ? `, ${message.failed} not written` : ''}`);
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

      case 'readExportFile':
        sendResponse(await askFolderWorker({ action: 'folderReadExportFile', filename: message.filename, maxBytes: message.maxBytes }, { success: false }));
        break;

      // The organizer's content search brings its index up to date one time slice at a time (lib/search-build.js)
      case 'indexExports':
        sendResponse(await askFolderWorker({ action: 'folderIndexExports', after: typeof message.after === 'string' ? message.after : null }, { success: false }));
        break;

      case 'listExports':
        // One directory read for the whole sync, not one message per chat
        sendResponse(await askFolderWorker({ action: 'folderListExports' }, { success: false, files: [] }));
        break;

      case 'findExport':
        sendResponse(await askFolderWorker({ action: 'folderFindExport', chatId: message.chatId, filename: message.filename || null }, { success: false }));
        break;

      case 'helperStatus':
        sendResponse(await helperStatus(message.fresh === true));
        break;

      case 'revealExport':
        sendResponse(await revealWithHelper(message.filename, message.prefix));
        break;

      // Pages compare this with their manifest version (lib/apply-update.js, content/cf-build-check.js)
      case 'backgroundBuild':
        sendResponse({ success: true, build: CF_BACKGROUND_BUILD });
        break;

      // The accounts with folder data (lib/accounts.js). The settings page asks without folders.
      case 'listAccounts':
        sendResponse(await listAccounts(message.withFolders !== false));
        break;

      // Chats an export pass could not read, released to the accounts that hold them (lib/accounts.js)
      case 'releaseForeignChats':
        sendResponse(await releaseForeignChats(message.ids || []));
        break;

      // The settings page's Clear: this login's folders and categories are emptied, its account record stays
      case 'clearFolderData': {
        if (!cachedData) await loadCachedData();
        const account = cachedData.metadata && cachedData.metadata.account;
        cachedData = { folders: [], categories: [], metadata: account ? { account } : {} };
        await persist();
        const written = await syncDataToDisk();
        await broadcastDataUpdated();
        sendResponse({ success: true, accountKey: currentAccountKey, written: !!(written && written.success) });
        break;
      }

      // Ask Claude to Organize opens /new and stores the request under that tab's id (lib/organize-tabs.js).
      // With auto, the tab sends it and opens the answer for applying (content/cf-organize-auto.js).
      case 'startOrganizePrompt':
        sendResponse(await cfStartOrganizeTab(message.prompt, message.auto));
        break;

      case 'getOrganizePrompt':
        sendResponse(await cfOrganizePromptFor(sender.tab && sender.tab.id));
        break;

      case 'organizePromptPasted':
        await cfForgetOrganizePrompt(sender.tab && sender.tab.id);
        sendResponse({ success: true });
        break;

      // An organizer row or menu item without an address runs in a new claude.ai tab (content/cf-shell-replay.js)
      case 'runShellItem':
        sendResponse({ success: true, tabId: await cfOpenTabWithHandoff('shell', message.request, CF_SHELL_ADDRESS_PAGE) });
        break;

      // Clicking the organizer's import button opens the import dialog in a new claude.ai tab (content/cf-import-dialog.js)
      case 'openImportDialog':
        sendResponse({ success: true, tabId: await cfOpenTabWithHandoff('import', { accountKey: message.accountKey || null }, 'https://claude.ai/new') });
        break;

      // The content script of a tab opened for a shell item or the import dialog asks for its request once, on load
      // (content/cf-tab-request.js)
      case 'takeTabRequest':
        sendResponse({ success: true, handoff: await cfTakeHandoff(sender.tab && sender.tab.id, ['shell', 'import']) });
        break;

      case 'openSettings':
        await chrome.runtime.openOptionsPage();
        sendResponse({ success: true });
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
        
      // A sync or a folder export runs in a claude.ai tab (lib/claude-tab.js)
      case 'startAutoScrape':
        // force: the popup's forced resync reads every page and writes every export again
        sendResponse(await cfStartRunInClaudeTab({ action: 'startScrape', force: message.force === true }));
        break;

      case 'startFolderExport':
        sendResponse(await cfStartRunInClaudeTab({ action: 'startBulkExport', chats: message.chats || [], title: message.title || 'Exporting chats' }));
        break;

      default:
        sendResponse({ error: 'Unknown action: ' + message.action });
    }
  } catch (error) {
    console.log('[BG] Error:', error.message);
    sendResponse({ error: error.message });
  }
}