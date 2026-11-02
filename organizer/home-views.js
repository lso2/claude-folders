// organizer/home-views.js
// The organizer home's Categories, Cards and List views of the folders and chats the account dropdown shows.
// Globals: HOME_VIEWS, HOME_PAGE, homeView, homeShown, homeViewItems, renderHomeView, setHomeView, loadHomeView
// Depends on: organizer/accounts.js (viewFolders), organizer/app.js (searchTerm), organizer/chat-rows.js (renderChatRows),
//             organizer/chat-sort.js (sortChatItems), lib/storage-keys.js (ORGANIZER_HOME_VIEW_KEY)
// Notes: docs/notes/organizer/home-views.js.md

const HOME_VIEWS = ['categories', 'cards', 'list'];
// Chats drawn at first and added by each Show more
const HOME_PAGE = 100;
// Categories until another view is chosen
let homeView = 'categories';
let homeShown = HOME_PAGE;

// Each chat of the view once with its folder. The search box's text narrows them by chat title or folder name,
// as it narrows the folder cards of the Categories view.
function homeViewItems() {
  const term = String(searchTerm || '').trim().toLowerCase();
  const seen = new Set();
  const items = [];
  viewFolders.forEach(folder => (folder.chats || []).forEach(chat => {
    if (seen.has(chat.id)) return;
    seen.add(chat.id);
    if (term && !String(chat.title || '').toLowerCase().includes(term) && !String(folder.name || '').toLowerCase().includes(term)) return;
    items.push({ chat, folder });
  }));
  return items;
}

// Categories shows the category filter beside the view buttons, the folder sort, the category pills and the folder
// cards (organizer/folders.js). Cards and List show the chats with Sort by (organizer/chat-sort.js).
async function renderHomeView() {
  const categoriesShown = homeView === 'categories';
  document.querySelectorAll('.home-view-btn').forEach(btn => {
    const on = btn.dataset.homeView === homeView;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  ['categoryFilterSearch', 'categorySortControls', 'filterPills', 'folderGrid'].forEach(id => { document.getElementById(id).hidden = !categoriesShown; });
  document.getElementById('homeChatTools').hidden = categoriesShown;
  const list = document.getElementById('homeChatList');
  const more = document.getElementById('homeChatMore');
  list.hidden = categoriesShown;
  more.hidden = true;
  if (categoriesShown) return;
  const items = sortChatItems(homeViewItems());
  const count = document.getElementById('homeChatCount');
  count.textContent = `${items.length.toLocaleString()} chat${items.length === 1 ? '' : 's'}`;
  if (!items.length) {
    list.className = 'chat-list-container';
    list.innerHTML = `<div class="home-chat-empty">${searchTerm.trim() ? 'No chat title or folder name has the search text.' : 'No chats in the folders shown.'}</div>`;
    return;
  }
  const shown = items.slice(0, homeShown);
  await renderChatRows(list, shown, homeView === 'cards' ? 'card' : 'list', { showFolder: true });
  const left = items.length - shown.length;
  more.hidden = left <= 0;
  more.textContent = `Show ${Math.min(HOME_PAGE, left).toLocaleString()} more (${left.toLocaleString()} not shown)`;
}

function setHomeView(view) {
  homeView = HOME_VIEWS.includes(view) ? view : 'categories';
  homeShown = HOME_PAGE;
  chrome.storage.local.set({ [ORGANIZER_HOME_VIEW_KEY]: homeView })
    .catch(e => console.log('[ORGANIZER] View not stored:', e.message));
  renderHomeView();
}

async function loadHomeView() {
  try {
    const stored = (await chrome.storage.local.get(ORGANIZER_HOME_VIEW_KEY))[ORGANIZER_HOME_VIEW_KEY];
    if (HOME_VIEWS.includes(stored)) homeView = stored;
  } catch (e) {
    console.log('[ORGANIZER] View not read:', e.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.home-view-btn').forEach(btn => btn.addEventListener('click', () => setHomeView(btn.dataset.homeView)));
  document.getElementById('homeChatMore').addEventListener('click', () => {
    homeShown += HOME_PAGE;
    renderHomeView();
  });
});
