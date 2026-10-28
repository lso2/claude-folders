// content/cf-url-watch.js
// Watches Claude's single-page navigation and puts the injected rows and buttons back after re-renders.
// Globals: observeUrlChanges
// Depends on: content/cf-routes.js, content/cf-data.js, content/cf-chat.js,
//             content/cf-sidebar.js, content/cf-project-import.js, content/cf-cowork-import.js
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
        if (cfOnConversationPage()) {
          setTimeout(injectChatButton, 500);
        } else {
          cfClearChatButtons();
        }
      }
      // Re-inject sidebar if React removed it
      if (!document.querySelector('a[data-folders-link="true"]')) {
        sidebarInjected = false;
        injectSidebar();
      }
      // React drops the chat buttons when the header re-renders on the same URL
      if (cfOnConversationPage() && !document.querySelector('.claude-folders-btn')) {
        injectChatButton();
      }
      cfCheckProjectImport();
      cfCheckCoworkImport();
    });
  };

  new MutationObserver(scheduleCheck).observe(document, { subtree: true, childList: true });
}
