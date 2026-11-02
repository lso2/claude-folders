// organizer/view-controls.js
// Wires the controls of the folder list, a folder and the analytics that the offline library shares with the organizer.
// Globals: setupViewControls, showFolderListView
// Depends on: the page's state (currentSort, searchTerm, currentFolder, currentView, currentTab), organizer/folders.js
//             (renderFolderList, filterCategoriesBySearch), organizer/home-views.js (renderHomeView, homeShown, HOME_PAGE),
//             organizer/chats.js (renderChatList, renderActivityTab), organizer/analytics.js (toggleAnalyticsView, hideAnalyticsView),
//             organizer/content-search.js (scheduleContentSearch, setSearchScope)
// Notes: docs/notes/organizer/view-controls.js.md

function setupViewControls() {
  document.getElementById('sortSelect')?.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderFolderList();
  });
  
  // Folders filter as each key is typed. Chats are listed after a pause (organizer/content-search.js).
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderFolderList();
    homeShown = HOME_PAGE;
    renderHomeView();
    scheduleContentSearch(searchTerm);
  });
  
  document.getElementById('backBtn')?.addEventListener('click', () => {
    document.getElementById('folderDetailView')?.classList.add('hidden');
    document.getElementById('folderListView')?.classList.remove('hidden');
    currentFolder = null;
  });
  
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      if (currentTab === 'chats') {
        renderChatList();
      }
    });
  });
  
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentTab = tab.dataset.tab;
      if (currentTab === 'chats') {
        renderChatList();
      } else if (currentTab === 'activity') {
        renderActivityTab();
      }
    });
  });
  
  // Folders in the top bar, shown above every view, returns to the folder grid
  document.getElementById('topBarFolders')?.addEventListener('click', showFolderListView);

  // Analytics
  document.getElementById('analyticsBtn')?.addEventListener('click', toggleAnalyticsView);
  document.getElementById('analyticsBackBtn')?.addEventListener('click', hideAnalyticsView);
  
  // Category search
  document.getElementById('categorySearchInput')?.addEventListener('input', (e) => {
    filterCategoriesBySearch(e.target.value);
  });
}

// The Folders row in the sidebar and Folders in the top bar return to the folder grid from a folder or the analytics
function showFolderListView() {
  document.getElementById('folderDetailView')?.classList.add('hidden');
  hideAnalyticsView();
  currentFolder = null;
  setSearchScope(false);
}
