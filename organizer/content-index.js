// organizer/content-index.js
// Brings the content search index up to date through the background, then holds each export file's words in memory.
// Globals: contentIndexWords, contentIndexFiles, contentIndexModified, contentIndexStale, contentIndexRun, refreshContentIndex,
//          runContentIndex, markContentIndexStale
// Depends on: lib/search-store.js (cfSearchStoreAll), lib/chat-markdown.js (exportPrefixOfFilename),
//             lib/storage-keys.js (RUN_STATE_KEY), background.js (indexExports)
// Notes: docs/notes/organizer/content-index.js.md

// Export file name -> its words, read from the index once it is up to date
let contentIndexWords = null;
// Lowercase id prefix -> the export file names with it, for the View export buttons
let contentIndexFiles = new Map();
// Export file name -> the file's modification time in ms, the export date for Sort by (organizer/content-sort.js)
let contentIndexModified = new Map();
// True until the first update, and again after a sync or an import or when the page is shown again
let contentIndexStale = true;
let contentIndexRun = null;

// onProgress(checked, total) after each time slice of the update.
// Resolves to { success, total } or the folder request's failure ({ success: false, code, error }).
function refreshContentIndex(onProgress) {
  if (!contentIndexStale && contentIndexWords) return Promise.resolve({ success: true, total: contentIndexWords.size });
  if (!contentIndexRun) contentIndexRun = runContentIndex(onProgress).finally(() => { contentIndexRun = null; });
  return contentIndexRun;
}

async function runContentIndex(onProgress) {
  let after = null;
  let answer = null;
  do {
    try {
      answer = await chrome.runtime.sendMessage({ action: 'indexExports', after });
    } catch (e) {
      answer = { success: false, error: e.message };
    }
    if (!answer || !answer.success) return answer || { success: false, error: 'the background answered nothing' };
    console.log('[SEARCH] Index step:', answer.checked, 'of', answer.total, 'checked,', answer.indexed, 'read,', answer.removed, 'removed,', answer.ms, 'ms');
    onProgress(answer.checked, answer.total);
    after = answer.next;
  } while (after !== null);
  const rows = await cfSearchStoreAll('words');
  contentIndexWords = new Map(rows.map(r => [r.name, r.words]));
  contentIndexModified = new Map((await cfSearchStoreAll('meta')).map(m => [m.name, m.lastModified]));
  contentIndexFiles = new Map();
  rows.forEach(r => {
    const prefix = exportPrefixOfFilename(r.name);
    if (!prefix) return;
    if (!contentIndexFiles.has(prefix)) contentIndexFiles.set(prefix, []);
    contentIndexFiles.get(prefix).push(r.name);
  });
  contentIndexStale = false;
  console.log('[SEARCH] Index up to date:', answer.total, 'export files');
  return { success: true, total: answer.total };
}

function markContentIndexStale() {
  contentIndexStale = true;
}

// A finished sync or import may have written exports. Exports saved from claude.ai while this page was hidden
// are found by the update after the page is shown again.
chrome.storage.onChanged.addListener((changes, area) => {
  const state = area === 'local' && changes[RUN_STATE_KEY] && changes[RUN_STATE_KEY].newValue;
  if (state && state.done) markContentIndexStale();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') markContentIndexStale();
});
