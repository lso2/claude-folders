// content/cf-url-watch.js
// Watches Claude's single-page navigation and puts the injected rows and buttons back after re-renders.
// Globals: observeUrlChanges
// Depends on: content/cf-routes.js, content/cf-data.js, content/cf-chat.js, content/cf-sidebar.js, content/cf-panel.js,
//             content/cf-groups-panel.js, content/cf-project-import.js, content/cf-export-state.js, content/cf-push.js,
//             content/cf-header-buttons.js
// Notes: docs/notes/content/cf-url-watch.js.md

function observeUrlChanges() {
  let lastUrl = location.href;
  let checkScheduled = false;

  // Bursts of React mutations collapse into one check per animation frame
  const scheduleCheck = () => {
    if (checkScheduled) return;
    checkScheduled = true;
    requestAnimationFrame(() => {
      checkScheduled = false;
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        updateCurrentChatId();
        // With a panel open, only the Chats page's column is pushed right (content/cf-push.js)
        cfUpdatePush();
        if (cfOnConversationPage()) {
          setTimeout(injectChatButton, 500);
        } else {
          cfClearChatButtons();
        }
      }
      // A panel removed with the part of Claude's page that held it (content/cf-panel-host.js) is closed in the state too
      if (panelExpanded && !document.querySelector('.claude-folders-panel')) cfClosePanel();
      if (groupsPanelOpen && !document.querySelector('.claude-groups-panel')) cfCloseGroupsPanel();
      // The header buttons and the sidebar rows are added again when React removed them
      if (cfHeaderButtonsMissing()) cfInjectHeaderButtons();
      if (cfSidebarRowsMissing()) {
        sidebarInjected = false;
        injectSidebar();
      }
      // React drops the chat buttons when the header re-renders on the same URL
      if (cfOnConversationPage() && !document.querySelector('.claude-folders-btn')) {
        injectChatButton();
      }
      cfCheckProjectImport();
      cfWatchExportFreshness();
    });
  };

  new MutationObserver(scheduleCheck).observe(document, { subtree: true, childList: true });
}
