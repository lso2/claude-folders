// content/cf-core.js
// Starts every content-script part on page load and answers the background's broadcasts.
// Globals: init, cfOnRuntimeMessage
// Depends on: every content part listed before content/cf-boot.js in manifest.json
// Notes: docs/notes/content/cf-core.js.md

function init() {
  console.log('[CONTENT] Claude Folders loaded');
  // The listeners come first: a startup step below that throws must not leave this tab without them,
  // since the background's start messages then fail with "Receiving end does not exist"
  chrome.runtime.onMessage.addListener(cfOnRuntimeMessage);
  chrome.runtime.onMessage.addListener(cfOnExportMessage);
  updateCurrentChatId();
  scrapeUserInfo();

  // The organization this tab is signed into, used to label chats from other ones
  if (window.chatExporter?.getActiveOrganizationId) {
    window.chatExporter.getActiveOrganizationId()
      .then(id => { cfActiveOrgId = id || null; })
      .catch(() => {});
  }

  // Per-account data loads only after the account key reaches the background
  cfAccountReady = cfInitAccount();
  cfAccountReady.then(() => {
    loadData();
    checkPendingSync();
    startNewChatMonitor();
    cfResumeImport();
  });

  checkPendingOrganizeData();
  cfResumeOrganizeAuto();
  cfStartShellCapture();
  cfWatchShellClicks();
  cfTakeTabRequest().then(cfRunTabRequest);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(injectUI, 1000));
  } else {
    setTimeout(injectUI, 1000);
  }

  observeUrlChanges();
  observeUrlForSync();
}

// Returns true only for the actions answered here, leaving the channel to other listeners
function cfOnRuntimeMessage(message, sender, sendResponse) {
  if (message.action === 'dataUpdated') {
    loadData();
    sendResponse({ received: true });
    return true;
  }
  // auto: the start came from the automatic sync timer (lib/auto-sync.js). force: the popup's forced resync.
  // A tab opened for the sync gets the start message soon after it loads. The sync waits until this
  // tab's account key has reached the background and its folders are loaded, so it reads and writes this login's data.
  if (message.action === 'startScrape') {
    Promise.resolve(cfAccountReady)
      .catch(e => console.log('[SCRAPER] Account not resolved before the sync:', e.message))
      .then(() => loadData())
      .then(() => scrapeRecentsPage(message.force === true, message.auto === true, message.force === true));
    sendResponse({ received: true });
    return true;
  }
  if (message.action === 'folderAccessChanged') {
    cfClearAccessPrompt();
    const written = message.written || 0;
    showNotification(written ? `Folder access granted. ${written} queued export${written === 1 ? '' : 's'} written.` : 'Folder access granted.');
    cfRefreshSyncBar();
    // The sync this tab asked for before access was granted
    const request = cfTakeSyncRequest();
    if (request) scrapeRecentsPage(request.fullResync, false, request.rewriteAll === true);
    sendResponse({ received: true });
    return true;
  }
  return false;
}
