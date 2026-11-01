// organizer/content-search.js
// Lists the chats of the account view whose title or exported text has the search box's words.
// Globals: CONTENT_SEARCH_MIN, CONTENT_SEARCH_PAGE, CONTENT_SEARCH_WAIT_MS, contentMatchChatIds, contentSearchSeq,
//          contentSearchTimer, contentSearchState, contentSearchMode, contentSearchCollapsed, scheduleContentSearch,
//          runContentSearch, contentSearchRows, contentSearchShownRows, renderContentSearch, contentSearchRowHtml,
//          contentSnippetHtml, contentReadExport, fillContentSnippets, openContentExport, setContentSearchMode,
//          setContentSearchCollapsed, refreshContentSearchRows, setContentSearchProgress
// Depends on: organizer/content-index.js, lib/search-words.js (cfSearchTokens), lib/chat-markdown.js (exportIdPrefix),
//             organizer/content-sort.js (sortContentRows), organizer/accounts.js (viewFolders), organizer/app.js (esc, safeUrl), organizer/folders.js
//             (renderFolderList), organizer/viewer.js (renderMarkdownAsHtml), lib/page-dialog.js (cfPageAlert)
// Notes: docs/notes/organizer/content-search.js.md

// Characters typed before chats are listed, rows shown at first and added by Show more, and the pause after typing
const CONTENT_SEARCH_MIN = 2;
const CONTENT_SEARCH_PAGE = 50;
const CONTENT_SEARCH_WAIT_MS = 250;
// Ids of the listed chats. organizer/folders.js shows the folders holding them.
let contentMatchChatIds = new Set();
let contentSearchSeq = 0;
let contentSearchTimer = null;
// The last search: { text, tokens, rows, shown, index } where index is the index update's answer
let contentSearchState = null;
// The matches listed: 'all', 'title' or 'content'. Every page load starts on 'all'.
let contentSearchMode = 'all';
// The list and its Show more button are hidden while collapsed; the heading and status stay
let contentSearchCollapsed = false;

function scheduleContentSearch(term) {
  clearTimeout(contentSearchTimer);
  contentSearchTimer = setTimeout(() => runContentSearch(term), CONTENT_SEARCH_WAIT_MS);
}

// The bar under the heading while the exports are read for search. checked and total null: the count of files
// is not known yet, and the bar moves without a fill. done: the bar is hidden.
function setContentSearchProgress(checked, total, done) {
  const bar = document.getElementById('contentSearchProgress');
  const fill = bar.firstElementChild;
  const known = Number.isFinite(total) && total > 0;
  // A search typed while an update runs keeps the count the bar already shows
  if (!done && !known && !bar.hidden && !bar.classList.contains('indeterminate')) return;
  bar.hidden = !!done;
  if (done) return;
  bar.classList.toggle('indeterminate', !known);
  fill.style.width = known ? `${Math.min(100, Math.round(checked / total * 100))}%` : '';
  if (known) {
    bar.setAttribute('aria-valuenow', String(checked));
    bar.setAttribute('aria-valuemax', String(total));
  } else {
    bar.removeAttribute('aria-valuenow');
    bar.removeAttribute('aria-valuemax');
  }
}

// Title matches are listed at once. Matches in the exported text are added when the index is up to date.
async function runContentSearch(term) {
  const seq = ++contentSearchSeq;
  const text = String(term || '').trim();
  const section = document.getElementById('contentSearch');
  if (text.length < CONTENT_SEARCH_MIN) {
    section.hidden = true;
    contentSearchState = null;
    contentMatchChatIds = new Set();
    setContentSearchProgress(null, null, true);
    return;
  }
  const tokens = cfSearchTokens(text);
  contentSearchState = { text, tokens, rows: contentSearchRows(text, tokens, false), shown: CONTENT_SEARCH_PAGE, index: null };
  section.hidden = false;
  renderContentSearch();
  if (!tokens.length) {
    setContentSearchProgress(null, null, true);
    return;
  }
  // An index already up to date answers at once, and the bar is hidden again before it is drawn
  setContentSearchProgress(null, null, false);
  // One index update serves every search typed while it runs. Its progress goes to the search
  // shown now, whichever search started the update.
  const index = await refreshContentIndex((checked, total) => {
    if (!contentSearchState || contentSearchState.index) return;
    setContentSearchProgress(checked, total, false);
    document.getElementById('contentSearchStatus').textContent = `Reading the chat exports for search: ${checked.toLocaleString()} of ${total.toLocaleString()} files`;
  });
  if (seq !== contentSearchSeq) return;
  setContentSearchProgress(null, null, true);
  contentSearchState.index = index;
  if (index.success) contentSearchState.rows = contentSearchRows(text, tokens, true);
  renderContentSearch();
  fillContentSnippets(seq);
}

// Each chat of the view once: { chat, folder, byTitle, matchFiles, files }, title matches first, then the newest.
// matchFiles are the chat's export files holding every word. withText: the index is read for matches.
function contentSearchRows(text, tokens, withText) {
  const lower = text.toLowerCase();
  const matched = new Set();
  if (withText && contentIndexWords) {
    for (const [name, words] of contentIndexWords) {
      if (tokens.every(t => words.includes(t))) matched.add(name);
    }
  }
  const rows = [];
  const seen = new Set();
  viewFolders.forEach(folder => (folder.chats || []).forEach(chat => {
    if (seen.has(chat.id)) return;
    const files = contentIndexFiles.get(exportIdPrefix(chat.id).toLowerCase()) || [];
    const matchFiles = files.filter(name => matched.has(name));
    const byTitle = String(chat.title || '').toLowerCase().includes(lower);
    if (!byTitle && !matchFiles.length) return;
    seen.add(chat.id);
    rows.push({ chat, folder, byTitle, matchFiles, files });
  }));
  return rows.sort((a, b) => (b.byTitle - a.byTitle) || (new Date(b.chat.date || 0) - new Date(a.chat.date || 0)));
}

// The account dropdown changes viewFolders. The last search's rows are built again from the index already
// read, which holds the exports of every account, so the list shows the matches of the accounts now chosen.
function refreshContentSearchRows() {
  const state = contentSearchState;
  if (!state) return;
  state.rows = contentSearchRows(state.text, state.tokens, !!(state.index && state.index.success));
  state.shown = CONTENT_SEARCH_PAGE;
  renderContentSearch();
  fillContentSnippets(contentSearchSeq);
}

// The rows of the last search that the mode lists: by title, by exported text or either
function contentSearchShownRows(state) {
  if (contentSearchMode === 'title') return state.rows.filter(r => r.byTitle);
  if (contentSearchMode === 'content') return state.rows.filter(r => r.matchFiles.length);
  return state.rows;
}

function renderContentSearch() {
  const state = contentSearchState;
  const status = document.getElementById('contentSearchStatus');
  const list = document.getElementById('contentSearchList');
  const more = document.getElementById('contentSearchMore');
  const access = document.getElementById('contentSearchAccess');
  const rows = sortContentRows(contentSearchShownRows(state));
  contentMatchChatIds = new Set(rows.map(r => r.chat.id));
  const n = rows.length;
  const by = contentSearchMode === 'title' ? ' by title' : contentSearchMode === 'content' ? ' by exported text' : '';
  const count = (n === 0 ? 'No chat matches' : n === 1 ? '1 chat matches' : `${n.toLocaleString()} chats match`) + by;
  const failed = state.index && !state.index.success;
  const titleOnly = contentSearchMode === 'all' ? `${count} by title` : count;
  if (!state.tokens.length) status.textContent = titleOnly;
  else if (!state.index) status.textContent = `${titleOnly}. Reading the chat exports for search...`;
  else if (failed) status.textContent = `${titleOnly}. The exports were not searched: ${state.index.error}`;
  else status.textContent = count;
  status.classList.toggle('error', !!failed);
  access.hidden = !(failed && (state.index.code === 'permission' || state.index.code === 'no-folder'));
  list.innerHTML = rows.slice(0, state.shown).map(contentSearchRowHtml).join('');
  const left = n - state.shown;
  more.hidden = left <= 0;
  more.textContent = `Show ${Math.min(CONTENT_SEARCH_PAGE, left).toLocaleString()} more`;
  renderFolderList();
}

// Another account's chat opens only in a browser signed in to it. Its title opens the chat's export
// in a new tab, and with no export the title is plain text.
function contentSearchRowHtml(row) {
  const chat = row.chat;
  const name = esc(chat.title || 'Untitled');
  const file = row.matchFiles[0] || row.files[0];
  let title = `<a class="content-search-chat" href="${safeUrl(chat.url)}" target="_blank" rel="noopener">${name}</a>`;
  if (chat.cfAccountLabel) {
    title = file
      ? `<a class="content-search-chat content-search-export" href="#" data-file="${esc(file)}" data-title="${name}" title="Open this chat's export">${name}</a>`
      : `<span class="content-search-chat">${name}</span>`;
  }
  const meta = [`<span class="content-search-tag">${esc(row.folder.category)}</span>`, `<span>${esc(row.folder.name)}</span>`];
  if (chat.cfAccountLabel) meta.push(`<span>${esc(chat.cfAccountLabel)}</span>`);
  const view = file ? `<button class="btn-secondary content-search-view" data-file="${esc(file)}" data-title="${esc(chat.title || 'Untitled')}">View export</button>` : '';
  const snippet = row.matchFiles.length ? `<div class="content-search-snippet" data-file="${esc(row.matchFiles[0])}"></div>` : '';
  return `<li class="content-search-row"><div class="content-search-main">${title}<div class="content-search-meta">${meta.join('')}</div>${snippet}</div>${view}</li>`;
}

// The text around the first place the search text, else one of its words, is found, with that part marked
function contentSnippetHtml(content, text, tokens) {
  const quote = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let found = new RegExp(quote(text), 'iu').exec(content);
  for (let i = 0; !found && i < tokens.length; i++) found = new RegExp(quote(tokens[i]), 'iu').exec(content);
  if (!found) return '';
  const at = found.index;
  const end = at + found[0].length;
  // About 90 characters on each side, cut at a space so no word is split
  let from = Math.max(0, at - 90);
  if (from > 0) {
    const space = content.slice(from, at).search(/\s/);
    if (space >= 0) from += space + 1;
  }
  let to = Math.min(content.length, end + 90);
  if (to < content.length) {
    const tail = content.slice(end, to);
    const space = Math.max(tail.lastIndexOf(' '), tail.lastIndexOf('\n'));
    if (space > 0) to = end + space;
  }
  const flat = (s) => esc(s.replace(/\s+/g, ' '));
  return `${from > 0 ? '…' : ''}${flat(content.slice(from, at))}<mark>${flat(content.slice(at, end))}</mark>${flat(content.slice(end, to))}${to < content.length ? '…' : ''}`;
}

// The data folder is read through the background's folder writer, which holds the folder grant
async function contentReadExport(filename) {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'readExportFile', filename });
    if (res && res.success) return res;
    return { success: false, error: (res && res.error) || 'the background answered nothing' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// Snippets of the listed rows, one export read at a time. A newer search stops the reading.
async function fillContentSnippets(seq) {
  const cells = Array.from(document.querySelectorAll('#contentSearchList .content-search-snippet[data-file]:not([data-read])'));
  for (const cell of cells) {
    if (seq !== contentSearchSeq) return;
    const res = await contentReadExport(cell.dataset.file);
    if (seq !== contentSearchSeq) return;
    cell.dataset.read = '1';
    cell.innerHTML = res.success ? contentSnippetHtml(res.content, contentSearchState.text, contentSearchState.tokens) : esc(`The export was not read: ${res.error}`);
  }
}

// The tab is opened during the click, then filled once the export is read
async function openContentExport(filename, title) {
  const tab = window.open('', '_blank');
  if (!tab) {
    cfPageAlert('Export not opened', 'The browser returned no new tab for the export.');
    return;
  }
  const res = await contentReadExport(filename);
  if (!res.success) {
    tab.close();
    cfPageAlert('Export not opened', `${filename} could not be read: ${res.error}`);
    return;
  }
  tab.document.write(renderMarkdownAsHtml(title, res.content));
  tab.document.close();
}

// The mode buttons show which is chosen; the list and the folder grid are drawn again for it
function setContentSearchMode(mode) {
  contentSearchMode = mode;
  document.querySelectorAll('#contentSearch .content-search-mode').forEach(btn => {
    const on = btn.dataset.mode === mode;
    btn.classList.toggle('active', on);
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  if (!contentSearchState) return;
  contentSearchState.shown = CONTENT_SEARCH_PAGE;
  renderContentSearch();
  fillContentSnippets(contentSearchSeq);
}

function setContentSearchCollapsed(collapsed) {
  contentSearchCollapsed = collapsed;
  const btn = document.getElementById('contentSearchCollapse');
  const label = collapsed ? 'Expand the chat list' : 'Collapse the chat list';
  document.getElementById('contentSearchBody').hidden = collapsed;
  document.getElementById('contentSearch').classList.toggle('collapsed', collapsed);
  btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
  btn.setAttribute('aria-label', label);
  btn.title = label;
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('contentSearchList')?.addEventListener('click', (e) => {
    const btn = e.target.closest('.content-search-view, .content-search-export');
    if (!btn) return;
    e.preventDefault();
    openContentExport(btn.dataset.file, btn.dataset.title);
  });
  document.querySelectorAll('#contentSearch .content-search-mode').forEach(btn => {
    btn.addEventListener('click', () => setContentSearchMode(btn.dataset.mode));
  });
  document.getElementById('contentSearchCollapse')?.addEventListener('click', () => setContentSearchCollapsed(!contentSearchCollapsed));
  document.getElementById('contentSearchMore')?.addEventListener('click', () => {
    if (!contentSearchState) return;
    contentSearchState.shown += CONTENT_SEARCH_PAGE;
    renderContentSearch();
    fillContentSnippets(contentSearchSeq);
  });
  document.getElementById('contentSearchAccess')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openFolderAccess' }).catch(e => console.log('[SEARCH] Folder access window not opened:', e.message));
  });
});
