// standalone/app.js
// Starts the offline library page, opened as index.html from the data folder: the folders of data.js in the organizer's views.
// Globals: folders, categories, metadata, currentCategory, currentFolder, currentView, currentSort, searchTerm,
//          currentTab, libraryLayout, LIBRARY_SIDEBAR_IDS, loadLibraryData, refreshView, renderLibrarySidebar, renderLibraryAccess
// Depends on: data.js (claudeFoldersData), the organizer files copied beside this page by lib/data-file.js (folders.js, chats.js,
//             chat-rows.js, chat-sort.js, home-views.js, analytics.js, content-index.js, content-search.js, view-controls.js),
//             accounts.js (viewFolders, loadOrganizerAccounts, buildViewFolders, renderAccountSelect), library-files.js,
//             library-host.js, library-store.js, sidebar-layout.js, storage-keys.js (ORGANIZER_LAYOUT_KEY)
// Notes: docs/notes/standalone/app.js.md

// The organizer's page state, under the names its shared files read
let folders = [];
let categories = [];
let metadata = {};
let currentCategory = 'all';
let currentFolder = null;
let currentView = 'list';
let currentSort = 'activity';
let searchTerm = '';
let currentTab = 'chats';

let libraryLayout = { width: SIDEBAR_DEFAULT_WIDTH, collapsed: false };
const LIBRARY_SIDEBAR_IDS = { sidebar: 'sidebar', toggle: 'sidebarToggle', resizer: 'sidebarResizer' };

function loadLibraryData() {
  const data = (typeof claudeFoldersData !== 'undefined' && claudeFoldersData) || {};
  categories = data.categories || [];
  metadata = data.metadata || {};
  folders = data.folders || [];
}

// The organizer's refreshView. Exports may have been allowed since, so their files are listed again.
function refreshView() {
  buildViewFolders();
  renderAccountSelect();
  renderCategoryFilters();
  renderFolderList();
  renderRecentChats();
  refreshContentSearchRows();
  markExportedPrefixesStale();
  renderHomeView();
  if (currentFolder) renderChatList();
}

// New chat and Chats open claude.ai. Folders returns to the folder list, as in the organizer.
function renderLibrarySidebar() {
  document.getElementById('sidebarNav').innerHTML = `
    <a href="https://claude.ai/new" target="_blank" rel="noopener" class="nav-item" title="New chat">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M10 3C10.4142 3 10.75 3.33579 10.75 3.75V9.25H16.25C16.6642 9.25 17 9.58579 17 10C17 10.4142 16.6642 10.75 16.25 10.75H10.75V16.25C10.75 16.6642 10.4142 17 10 17C9.58579 17 9.25 16.6642 9.25 16.25V10.75H3.75C3.33579 10.75 3 10.4142 3 10C3 9.58579 3.33579 9.25 3.75 9.25H9.25V3.75C9.25 3.33579 9.58579 3 10 3Z"/></svg>
      <span class="nav-label">New chat</span></a>
    <a href="https://claude.ai/recents" target="_blank" rel="noopener" class="nav-item" title="Chats">
      <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor"><path d="M9 2C12.3 2 15 4.7 15 8C15 11.3 12.3 14 9 14H2.5C2.3 14 2.1 13.9 2 13.7C2 13.5 2 13.3 2.1 13.2L3.9 11.2C3.3 10.3 3 9.2 3 8C3 4.7 5.7 2 9 2ZM9 3C6.2 3 4 5.2 4 8C4 9.1 4.4 10.1 5 11C5.1 11.2 5.1 11.4 4.9 11.6L3.6 13H9C11.8 13 14 10.8 14 8C14 5.2 11.8 3 9 3Z"/></svg>
      <span class="nav-label">Chats</span></a>
    <a href="#" class="nav-item active" id="foldersLink" title="Folders">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/></svg>
      <span class="nav-label">Folders</span></a>`;
  document.getElementById('foldersLink').addEventListener('click', (e) => {
    e.preventDefault();
    showFolderListView();
  });
  const recorded = metadata.account || {};
  const name = metadata.userName || recorded.name || recorded.email || '';
  document.getElementById('userAvatar').textContent = metadata.userInitial || (name ? Array.from(name)[0].toUpperCase() : '');
  document.getElementById('userName').textContent = name;
  const team = document.getElementById('userTeam');
  team.textContent = metadata.userTeam || '';
  team.hidden = !metadata.userTeam;
}

// Reading the chats folder needs the person to allow it once per visit, from a click
async function renderLibraryAccess() {
  const bar = document.getElementById('libraryAccess');
  const text = document.getElementById('libraryAccessText');
  const btn = document.getElementById('libraryAccessBtn');
  const state = await libraryAccessState();
  if (state === 'granted') {
    bar.hidden = true;
    await loadOrganizerAccounts();
    markContentIndexStale();
    refreshView();
    return;
  }
  if (state === 'unsupported') {
    text.textContent = 'This browser cannot read the chats folder from a page opened from disk. Chrome and Edge can.';
    btn.hidden = true;
  } else {
    text.textContent = state === 'none'
      ? 'Chat texts are read from the chats folder of this library. Choose the folder that holds this page to read them here.'
      : 'Chat texts are read from the chats folder of this library, and this visit needs your permission.';
    btn.textContent = state === 'none' ? 'Choose folder' : 'Allow reading';
    btn.hidden = false;
    btn.onclick = cfHostOpenFolderAccess;
  }
  bar.hidden = false;
}

document.addEventListener('DOMContentLoaded', async () => {
  await Promise.all([loadHomeView(), loadChatListSort()]);
  libraryLayout = await cfReadSidebarLayout(ORGANIZER_LAYOUT_KEY);
  cfApplySidebarLayout(libraryLayout, LIBRARY_SIDEBAR_IDS);
  cfSetupSidebarFrame(libraryLayout, ORGANIZER_LAYOUT_KEY, LIBRARY_SIDEBAR_IDS);
  loadLibraryData();
  await loadOrganizerAccounts();
  setupViewControls();
  renderLibrarySidebar();
  refreshView();
  renderLibraryAccess();
});
