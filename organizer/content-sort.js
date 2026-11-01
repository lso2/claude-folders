// organizer/content-sort.js
// Orders the rows of the search's Chats list by the Sort by choice and its direction.
// Globals: CONTENT_SORT_DIRECTION, CONTENT_SORT_LABELS, contentSortKey, contentSortDir, contentSortTime,
//          contentSortValue, sortContentRows, renderContentSortControls, setContentSort
// Depends on: organizer/content-index.js (contentIndexModified), organizer/content-search.js
//             (contentSearchState, contentSearchSeq, CONTENT_SEARCH_PAGE, renderContentSearch, fillContentSnippets)
// Notes: docs/notes/organizer/content-sort.js.md

// The direction each choice starts in: names A to Z, times newest first. Best match has no direction.
const CONTENT_SORT_DIRECTION = { name: 'asc', recent: 'desc', oldest: 'desc', exported: 'desc' };
// The direction button's tooltip for each choice, ascending then descending
const CONTENT_SORT_LABELS = {
  name: ['Ascending: A to Z', 'Descending: Z to A'],
  recent: ['Ascending: oldest last message first', 'Descending: newest last message first'],
  oldest: ['Ascending: earliest started chat first', 'Descending: latest started chat first'],
  exported: ['Ascending: earliest export first', 'Descending: latest export first']
};
// 'match' keeps the search's order: title matches first, then the newest
let contentSortKey = 'match';
let contentSortDir = 'desc';

function contentSortTime(value) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) ? time : null;
}

// The value a row is sorted on, or null when the chat has none. recent is the chat's last message
// (updatedAt), oldest its first (createdAt), exported the newest modification time of its export files.
function contentSortValue(row, key) {
  const chat = row.chat;
  if (key === 'name') return String(chat.title || 'Untitled');
  if (key === 'recent') return contentSortTime(chat.updatedAt || chat.date);
  if (key === 'oldest') return contentSortTime(chat.createdAt);
  if (key === 'exported') {
    const times = (row.files || []).map(name => contentIndexModified.get(name)).filter(Number.isFinite);
    return times.length ? Math.max(...times) : null;
  }
  return null;
}

// Rows with no value are listed after the others in both directions
function sortContentRows(rows) {
  if (contentSortKey === 'match') return rows;
  const sign = contentSortDir === 'asc' ? 1 : -1;
  const names = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
  return rows
    .map(row => ({ row, value: contentSortValue(row, contentSortKey) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) return (a.value === null) - (b.value === null);
      const order = contentSortKey === 'name' ? names.compare(a.value, b.value) : a.value - b.value;
      return sign * order;
    })
    .map(entry => entry.row);
}

function renderContentSortControls() {
  const select = document.getElementById('contentSearchSort');
  const btn = document.getElementById('contentSearchSortDir');
  const labels = CONTENT_SORT_LABELS[contentSortKey];
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
    setContentSort(key, CONTENT_SORT_DIRECTION[key] || 'desc');
  });
  document.getElementById('contentSearchSortDir')?.addEventListener('click', () => {
    setContentSort(contentSortKey, contentSortDir === 'asc' ? 'desc' : 'asc');
  });
});
