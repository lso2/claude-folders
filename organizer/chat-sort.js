// organizer/chat-sort.js
// Sort by for the chat lists of a folder and of the List and Cards views, and the comparison the search's Sort by shares.
// Globals: CHAT_SORT_DIRECTION, CHAT_SORT_LABELS, chatListSortKey, chatListSortDir, chatSortTime, chatSortValue,
//          cfSortItems, sortChatItems, renderChatSortControls, setChatListSort, loadChatListSort
// Depends on: organizer/chat-rows.js (exportedAtById), organizer/content-index.js (contentIndexFiles, contentIndexModified),
//             lib/chat-markdown.js (exportIdPrefix), lib/storage-keys.js (CHAT_LIST_SORT_KEY),
//             organizer/chats.js (renderChatList), organizer/home-views.js (renderHomeView), organizer/app.js (currentFolder)
// Notes: docs/notes/organizer/chat-sort.js.md

// The direction each choice starts in: names A to Z, times newest first
const CHAT_SORT_DIRECTION = { name: 'asc', recent: 'desc', oldest: 'desc', exported: 'desc' };
// The direction button's tooltip for each choice, ascending then descending
const CHAT_SORT_LABELS = {
  name: ['Ascending: A to Z', 'Descending: Z to A'],
  recent: ['Ascending: oldest last message first', 'Descending: newest last message first'],
  oldest: ['Ascending: earliest started chat first', 'Descending: latest started chat first'],
  exported: ['Ascending: earliest export first', 'Descending: latest export first']
};
let chatListSortKey = 'recent';
let chatListSortDir = 'desc';

function chatSortTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

// The value a chat is sorted on, or null when it has none. recent is its last message (updatedAt), oldest its
// first (createdAt), exported the newest of its export record's time and its export files' modification times.
function chatSortValue(chat, key, files) {
  if (key === 'name') return String(chat.title || 'Untitled');
  if (key === 'recent') return chatSortTime(chat.updatedAt || chat.date);
  if (key === 'oldest') return chatSortTime(chat.createdAt);
  if (key === 'exported') {
    const names = files || contentIndexFiles.get(exportIdPrefix(chat.id).toLowerCase()) || [];
    const times = names.map(name => contentIndexModified.get(name)).concat([exportedAtById.get(chat.id)]).filter(Number.isFinite);
    return times.length ? Math.max(...times) : null;
  }
  return null;
}

// Items with no value are listed after the others in both directions
function cfSortItems(items, key, dir, valueOf) {
  const sign = dir === 'asc' ? 1 : -1;
  const names = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return items
    .map(item => ({ item, value: valueOf(item) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) return (a.value === null) - (b.value === null);
      const order = key === 'name' ? names.compare(a.value, b.value) : a.value - b.value;
      return sign * order;
    })
    .map(entry => entry.item);
}

// items: [{ chat, folder }]
function sortChatItems(items) {
  return cfSortItems(items, chatListSortKey, chatListSortDir, item => chatSortValue(item.chat, chatListSortKey));
}

// Every .chat-sort control in the page shows the one choice
function renderChatSortControls() {
  const tip = CHAT_SORT_LABELS[chatListSortKey][chatListSortDir === 'asc' ? 0 : 1];
  document.querySelectorAll('.chat-sort-select').forEach(select => { select.value = chatListSortKey; });
  document.querySelectorAll('.chat-sort-dir').forEach(btn => {
    btn.classList.toggle('asc', chatListSortDir === 'asc');
    btn.querySelector('.chat-sort-dir-text').textContent = chatListSortDir === 'asc' ? 'Asc' : 'Desc';
    btn.title = tip;
    btn.setAttribute('aria-label', tip);
  });
}

// The open folder's list and the List or Cards view are drawn again in the new order
function setChatListSort(key, dir) {
  chatListSortKey = CHAT_SORT_DIRECTION[key] ? key : 'recent';
  chatListSortDir = dir === 'asc' ? 'asc' : 'desc';
  renderChatSortControls();
  chrome.storage.local.set({ [CHAT_LIST_SORT_KEY]: { key: chatListSortKey, dir: chatListSortDir } })
    .catch(e => console.log('[ORGANIZER] Sort by not stored:', e.message));
  if (currentFolder) renderChatList();
  renderHomeView();
}

async function loadChatListSort() {
  try {
    const stored = (await chrome.storage.local.get(CHAT_LIST_SORT_KEY))[CHAT_LIST_SORT_KEY];
    if (stored && CHAT_SORT_DIRECTION[stored.key]) {
      chatListSortKey = stored.key;
      chatListSortDir = stored.dir === 'asc' ? 'asc' : 'desc';
    }
  } catch (e) {
    console.log('[ORGANIZER] Sort by not read:', e.message);
  }
  renderChatSortControls();
}

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.chat-sort-select').forEach(select => select.addEventListener('change', () => {
    setChatListSort(select.value, CHAT_SORT_DIRECTION[select.value]);
  }));
  document.querySelectorAll('.chat-sort-dir').forEach(btn => btn.addEventListener('click', () => {
    setChatListSort(chatListSortKey, chatListSortDir === 'asc' ? 'desc' : 'asc');
  }));
});
