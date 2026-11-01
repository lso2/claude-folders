// popup/popup-sync-check.js
// Colors the popup's sync icon orange while a sync has work, and on click runs the sync or offers a forced resync.
// Globals: POPUP_SYNC_LIST_SIZE, popupSyncWork, readPopupSyncWork, popupSyncWorkText, renderPopupSyncIcon,
//          onPopupSyncIconClick
// Depends on: lib/storage-keys.js (EXPORT_STATE_KEY, EXPORTED_CHATS_KEY, MONITORED_NEW_CHATS_KEY_PREFIX),
//             lib/chat-markdown.js (EXPORT_FORMAT), popup/popup.js (allChats), popup/popup-run.js (startPopupSync),
//             lib/page-dialog.js (cfPageConfirm)
// Notes: docs/notes/popup/popup-sync-check.js.md

// The newest chats read from claude.ai on each popup open
const POPUP_SYNC_LIST_SIZE = 30;
// The last check: { newChats, changedChats, oldExports, listError }
let popupSyncWork = null;

// New chats: ids the claude.ai sidebar monitor found, and ids in the newest chats that no folder holds.
// Changed chats: newest chats whose updated_at is later than their export. Old exports: exports recorded
// in another format than EXPORT_FORMAT. listError: why the newest chats were not read.
async function readPopupSyncWork() {
  const stored = await chrome.storage.local.get(['activeAccountKey', 'activeOrgId', EXPORT_STATE_KEY, EXPORTED_CHATS_KEY]);
  const monitorKey = MONITORED_NEW_CHATS_KEY_PREFIX + stored.activeAccountKey;
  const seen = (await chrome.storage.local.get(monitorKey))[monitorKey] || [];
  const records = stored[EXPORT_STATE_KEY] || {};
  const stamps = stored[EXPORTED_CHATS_KEY] || {};
  const held = new Set(allChats.map(c => c.id));
  const newIds = new Set(seen);
  let changedChats = 0;
  let listError = null;
  const oldExports = allChats.filter(c => records[c.id] && records[c.id].filename && records[c.id].format !== EXPORT_FORMAT).length;
  if (stored.activeOrgId) {
    try {
      const res = await fetch(`https://claude.ai/api/organizations/${stored.activeOrgId}/chat_conversations?limit=${POPUP_SYNC_LIST_SIZE}&offset=0`, { credentials: 'include' });
      if (!res.ok) throw new Error(`the conversation list returned ${res.status}`);
      const list = await res.json();
      if (!Array.isArray(list)) throw new Error('the conversation list was not an array');
      for (const convo of list) {
        if (!convo || !convo.uuid) continue;
        if (!held.has(convo.uuid)) {
          newIds.add(convo.uuid);
          continue;
        }
        const exportedAt = Date.parse((records[convo.uuid] && records[convo.uuid].exportedAt) || stamps[convo.uuid] || '');
        const updatedAt = Date.parse(convo.updated_at || '');
        if (!Number.isFinite(exportedAt) || (Number.isFinite(updatedAt) && updatedAt > exportedAt)) changedChats++;
      }
    } catch (e) {
      listError = e.message;
    }
  } else {
    listError = 'no organization is recorded yet, and a sync on claude.ai records it';
  }
  return { newChats: newIds.size, changedChats, oldExports, listError };
}

function popupSyncWorkText(work) {
  const parts = [];
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  if (work.newChats) parts.push(plural(work.newChats, 'new chat'));
  if (work.changedChats) parts.push(plural(work.changedChats, 'changed chat'));
  if (work.oldExports) parts.push(`${plural(work.oldExports, 'export')} without message timestamps`);
  return parts.join(', ');
}

async function renderPopupSyncIcon() {
  const btn = document.getElementById('popupSyncBtn');
  if (!btn) return;
  try {
    popupSyncWork = await readPopupSyncWork();
  } catch (e) {
    popupSyncWork = { newChats: 0, changedChats: 0, oldExports: 0, listError: e.message };
  }
  const work = popupSyncWorkText(popupSyncWork);
  btn.classList.toggle('sync-available', !!work);
  const checked = popupSyncWork.listError ? ` The newest chats on claude.ai were not read: ${popupSyncWork.listError}.` : '';
  btn.title = (work ? `Sync: ${work}.` : 'Sync: the folders and exports are up to date.') + checked;
  btn.setAttribute('aria-label', btn.title);
}

// With work the sync starts. Without it, a forced resync is offered: every page of the conversation
// list is read, and every export is written again over its file.
async function onPopupSyncIconClick() {
  if (popupSyncWork && popupSyncWorkText(popupSyncWork)) {
    startPopupSync(false);
    return;
  }
  const checked = popupSyncWork && popupSyncWork.listError
    ? `The newest chats on claude.ai were not read: ${popupSyncWork.listError}.`
    : `The newest ${POPUP_SYNC_LIST_SIZE} chats on claude.ai match the folders and their exports.`;
  const force = await cfPageConfirm('Everything is up to date',
    `${checked} A forced resync reads the whole conversation list and writes every export again, over the same files.`,
    'Force resync');
  if (force) startPopupSync(true);
}

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('popupSyncBtn')?.addEventListener('click', onPopupSyncIconClick);
});
