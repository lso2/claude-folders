// content/cf-core.js
// Starts every content-script part on page load and answers the background's broadcasts.
// Globals: init, cfOnRuntimeMessage
// Depends on: every content part listed before content/cf-boot.js in manifest.json
// Notes: docs/notes/content/cf-core.js.md

function init() {
  console.log('[CONTENT] Claude Folders loaded');
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => setTimeout(injectUI, 1000));
  } else {
    setTimeout(injectUI, 1000);
  }

  observeUrlChanges();
  observeUrlForSync();
  chrome.runtime.onMessage.addListener(cfOnRuntimeMessage);
  chrome.runtime.onMessage.addListener(cfOnExportMessage);
}

// Returns true only for the actions answered here, leaving the channel to other listeners
function cfOnRuntimeMessage(message, sender, sendResponse) {
  if (message.action === 'dataUpdated') {
    loadData();
    sendResponse({ received: true });
    return true;
  }
  if (message.action === 'startScrape') {
    scrapeRecentsPage(true);
    sendResponse({ received: true });
    return true;
  }
  if (message.action === 'folderAccessChanged') {
    cfClearAccessPrompt();
    const written = message.written || 0;
    showNotification(written ? `Folder access granted. ${written} queued export${written === 1 ? '' : 's'} written.` : 'Folder access granted.');
    cfRefreshSyncBar();
    cfResetCoworkImport();
    // The sync this tab asked for before access was granted
    const request = cfTakeSyncRequest();
    if (request) scrapeRecentsPage(request.exportAllMissing, request.fullResync);
    sendResponse({ received: true });
    return true;
  }
  return false;
}
