// content/cf-boot.js
// Confirms every content-script part loaded, then starts the extension on this page.
// Globals: CF_PART_CHECKS, cfBootCheck
// Depends on: every file listed before it in manifest.json content_scripts
// Notes: docs/notes/content/cf-boot.js.md

// One function from each part, in manifest order; 'undefined' means that file did not load
const CF_PART_CHECKS = [
  ['lib/chat-markdown.js', typeof convertToMarkdown],
  ['lib/cowork-api.js', typeof fetchCoworkEvents],
  ['lib/cowork-markdown.js', typeof coworkToMarkdown],
  ['lib/cowork-export.js', typeof exportCoworkSession],
  ['lib/chat-exporter.js', typeof fetchConversationData],
  ['lib/share-snapshots.js', typeof fetchSnapshot],
  ['lib/storage-keys.js', typeof QUEUED_EXPORTS_KEY === 'string' ? 'function' : 'undefined'],
  ['lib/folder-picker.js', typeof cfFolderPickerAvailable],
  ['content/cf-state.js', typeof CF_FOLDER_ICON_PATH === 'string' ? 'function' : 'undefined'],
  ['content/cf-text.js', typeof cfEscapeHtml],
  ['content/cf-routes.js', typeof cfConversationRef],
  ['content/cf-account.js', typeof cfInitAccount],
  ['content/cf-notify.js', typeof cfNotifyAction],
  ['content/cf-data.js', typeof loadData],
  ['content/cf-account-info.js', typeof scrapeUserInfo],
  ['content/cf-pending.js', typeof checkPendingSync],
  ['content/cf-styles.js', typeof injectStyles],
  ['content/cf-org-filter.js', typeof cfRenderOrgFilter],
  ['content/cf-sidebar.js', typeof injectSidebar],
  ['content/cf-panel.js', typeof renderPanelContent],
  ['content/cf-chat.js', typeof injectChatButton],
  ['content/cf-picker.js', typeof showFolderPicker],
  ['content/cf-url-watch.js', typeof observeUrlChanges],
  ['content/cf-export-records.js', typeof markChatAsExported],
  ['content/cf-disk.js', typeof cfSaveExport],
  ['content/cf-export.js', typeof handleExportCurrentChat],
  ['content/cf-export-run.js', typeof cfExportChatList],
  ['content/cf-export-messages.js', typeof cfOnExportMessage],
  ['content/cf-organize.js', typeof askClaudeToOrganize],
  ['content/cf-panel-analytics.js', typeof renderPanelAnalytics],
  ['content/cf-cowork-sync.js', typeof cfCollectCoworkSessions],
  ['content/cf-sync.js', typeof scrapeRecentsPage],
  ['content/cf-sync-summary.js', typeof showSyncSuccessModal],
  ['content/cf-monitor.js', typeof startNewChatMonitor],
  ['content/cf-composer.js', typeof cfComposerReady],
  ['content/cf-import-registry.js', typeof cfReconcileImported],
  ['content/cf-import.js', typeof cfImportSharePage],
  ['content/cf-cowork-import.js', typeof cfCheckCoworkImport],
  ['content/cf-project-import.js', typeof cfCheckProjectImport],
  ['content/cf-core.js', typeof init]
];

// The version shows which build Chrome loaded after an update was applied
function cfBootCheck() {
  const version = chrome.runtime.getManifest().version;
  const missing = CF_PART_CHECKS.filter(([, kind]) => kind !== 'function').map(([file]) => file);
  if (missing.length) console.log(`[BOOT] Claude Folders ${version}: parts that did not load: ${missing.join(', ')}`);
  else console.log(`[BOOT] Claude Folders ${version}: all ${CF_PART_CHECKS.length} parts loaded`);
}

cfBootCheck();
init();
