// organizer/content-sort.js
// Orders the rows of the search's Chats list by the Sort by choice and its direction.
// Globals: contentSortKey, contentSortDir, contentSortValue, sortContentRows, renderContentSortControls, setContentSort
// Depends on: organizer/chat-sort.js (CHAT_SORT_DIRECTION, CHAT_SORT_LABELS, chatSortValue, cfSortItems), organizer/content-search.js
//             (contentSearchState, contentSearchSeq, CONTENT_SEARCH_PAGE, renderContentSearch, fillContentSnippets)
// Notes: docs/notes/organizer/content-sort.js.md

// 'match' keeps the search's order: title matches first, then the newest
let contentSortKey = 'match';
let contentSortDir = 'desc';

// recent, oldest and exported as in organizer/chat-sort.js, with the row's export files for exported
function contentSortValue(row, key) {
  return chatSortValue(row.chat, key, row.files);
}

// Rows with no value are listed after the others in both directions
function sortContentRows(rows) {
  if (contentSortKey === 'match') return rows;
  return cfSortItems(rows, contentSortKey, contentSortDir, row => contentSortValue(row, contentSortKey));
}

function renderContentSortControls() {
  const select = document.getElementById('contentSearchSort');
  const btn = document.getElementById('contentSearchSortDir');
  const labels = CHAT_SORT_LABELS[contentSortKey];
  select.value = contentSortKey;
  btn.disabled = !labels;
  btn.classList.toggle('asc', contentSortDir === 'asc');
  document.getElementById('contentSearchSortDirText').textContent = contentSortDir === 'asc' ? 'Asc' : 'Desc';
  const tip = labels ? labels[contentSortDir === 'asc' ? 0 : 1] : 'Best match has no direction';
  btn.title = tip;
  btn.setAttribute('aria-label', tip);
}

// The list is drawn again from its first page in the new order
function setContentSort(key, dir) {
  contentSortKey = key;
  contentSortDir = dir;
  renderContentSortControls();
  if (!contentSearchState) return;
  contentSearchState.shown = CONTENT_SEARCH_PAGE;
  renderContentSearch();
  fillContentSnippets(contentSearchSeq);
}

document.addEventListener('DOMContentLoaded', () => {
  renderContentSortControls();
  document.getElementById('contentSearchSort')?.addEventListener('change', (e) => {
    const key = e.target.value;
    setContentSort(key, CHAT_SORT_DIRECTION[key] || 'desc');
  });
  document.getElementById('contentSearchSortDir')?.addEventListener('click', () => {
    setContentSort(contentSortKey, contentSortDir === 'asc' ? 'desc' : 'asc');
  });
});
