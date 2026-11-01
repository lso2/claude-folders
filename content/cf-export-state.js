// content/cf-export-state.js
// Decides whether the conversation open in this tab shows Export, Show in folder or Export Update.
// Globals: CF_EXPORT_VIEWS, cfExportStateRead, cfReplyWasRunning, cfExportKey, cfCurrentTurn, cfReadTurn,
//          cfFindExportOnDisk, cfExportStatus, cfExportFileStatus, cfExportUpdateTip, cfApplyExportState,
//          cfApplyKnownExportState, cfRefreshPageExportButton, cfOnExportRecorded, cfWatchExportFreshness
// Depends on: lib/export-state.js, lib/cowork-api.js (fetchCoworkNewestTurn), lib/chat-exporter.js,
//             content/cf-routes.js, content/cf-chat.js (icons), content/cf-tooltip.js, content/cf-reveal.js
//             (cfHelperReady), content/cf-composer.js (CF_COMPOSER), inject.css (.cf-state-show)
// Notes: docs/notes/content/cf-export-state.js.md

// Label, icon and look of the page's export button in each state. current is an export that is up to
// date while the helper is missing: it reads Export and writes over the same file.
const CF_EXPORT_VIEWS = {
  export: { label: 'Export', icon: () => CF_EXPORT_ICON },
  current: { label: 'Export', icon: () => CF_EXPORT_ICON },
  show: { label: 'Show in folder', icon: () => CF_FOLDER_OPEN_ICON },
  update: { label: 'Export Update', icon: () => CF_EXPORT_UPDATE_ICON }
};

// The newest state read for a conversation: { key, promise, status }. The header is rendered
// several times while a page loads, and every placement of the button reuses this read.
let cfExportStateRead = null;
let cfReplyWasRunning = false;

function cfExportKey(ref) {
  return `${ref.kind}:${ref.id}`;
}

// The conversation's newest turn now: { mark, at }. A chat's mark is its current leaf message id,
// a Cowork session's mark its newest turn event number. at is that message's created_at.
async function cfCurrentTurn(ref) {
  const orgId = await window.chatExporter.getActiveOrganizationId();
  if (ref.kind === 'cowork') return (await fetchCoworkNewestTurn(ref.id, orgId)) || { mark: null, at: null };
  const res = await fetch(`/api/organizations/${orgId}/chat_conversations/${ref.id}`);
  if (!res.ok) throw new Error(`the conversation request returned ${res.status}`);
  const data = await res.json();
  const messages = Array.isArray(data.chat_messages) ? data.chat_messages : [];
  const leaf = messages.find(m => m.uuid === data.current_leaf_message_uuid);
  const at = leaf ? leaf.created_at : messages.map(m => m.created_at).filter(Boolean).sort().pop();
  return { mark: data.current_leaf_message_uuid || null, at: at || null };
}

// The current turn as { now }, or { error } when it could not be read
function cfReadTurn(ref) {
  return cfCurrentTurn(ref).then(now => ({ now }), error => ({ error }));
}

// The export's file in chats/. readable is false when the data folder cannot be read now.
// filename is the name in the export record, opened before the folder is listed.
async function cfFindExportOnDisk(chatId, filename) {
  const res = await chrome.runtime.sendMessage({ action: 'findExport', chatId, filename: filename || null });
  if (!res || !res.success) return { readable: false };
  return { readable: true, filename: res.filename || null, lastModified: res.lastModified || null };
}

// state: 'export', 'show', 'current' or 'update'. Show in folder needs the helper; without it an
// up-to-date export is 'current'.
async function cfExportStatus(ref) {
  const helperRead = cfHelperReady();
  const status = await cfExportFileStatus(ref);
  if (status.state === 'show' && !(await helperRead)) return { ...status, state: 'current' };
  return status;
}

// 'export', 'show' or 'update' from the files and the conversation. An export with a mark is up to date
// while the mark is the same. An export without one is up to date while no message is newer than its file.
async function cfExportFileStatus(ref) {
  const record = await loadExportRecord(ref.id);
  // A record means the turn is needed unless the file is missing. It is read during the folder check.
  const turnRead = record ? cfReadTurn(ref) : null;
  const disk = await cfFindExportOnDisk(ref.id, record && record.filename);
  if (disk.readable && !disk.filename) return { state: 'export' };
  if (!record && !disk.filename) return { state: 'export' };
  const filename = disk.filename || (record && record.filename) || null;
  // The name of a file found by listing the folder is stored. The next read opens that file directly.
  if (disk.filename && !(record && record.filename)) {
    rememberExportFile(ref.id, disk.filename).catch(e => console.log('[EXPORT] File name of', ref.id, 'not stored:', e.message));
  }
  const turn = await (turnRead || cfReadTurn(ref));
  if (turn.error) {
    console.log('[EXPORT] Current state of', ref.id, 'not read:', turn.error.message);
    return { state: 'show', filename };
  }
  const now = turn.now;
  if (record && record.mark) return { state: now.mark && now.mark !== record.mark ? 'update' : 'show', filename };
  // A file found by a sync has the time of that sync in its record. The file's own time is checked first.
  const exportedAt = disk.lastModified || (record && record.exportedAt);
  const newer = !!(now.at && exportedAt && Date.parse(now.at) > Date.parse(exportedAt));
  return { state: newer ? 'update' : 'show', filename };
}

function cfExportUpdateTip(status) {
  const target = status.filename ? `replaces ${status.filename}` : 'replaces its file';
  return `This chat has messages that are not in its export. Clicking Export Update exports it again and ${target} in the data folder.`;
}

function cfApplyExportState(btn, status) {
  const view = CF_EXPORT_VIEWS[status.state];
  btn.dataset.cfState = status.state;
  btn.dataset.cfFilename = status.filename || '';
  btn.innerHTML = `${view.icon()}<span>${cfEscapeHtml(view.label)}</span>`;
  btn.classList.toggle('cf-state-show', status.state === 'show');
  cfSetTooltip(btn, status.state === 'update' ? cfExportUpdateTip(status) : '');
}

// A button placed again for the same conversation gets the state already read before it is on the page
function cfApplyKnownExportState(btn, ref) {
  const read = cfExportStateRead;
  if (read && read.status && read.key === cfExportKey(ref)) cfApplyExportState(btn, read.status);
}

// fresh starts a new read. Without it, a placement of the button reuses the read for this
// conversation, in progress or done. A disabled button is exporting and is left with its busy label.
async function cfRefreshPageExportButton(fresh) {
  const ref = cfConversationRef();
  if (!ref || ref.kind === 'share') return;
  const key = cfExportKey(ref);
  if (fresh || !cfExportStateRead || cfExportStateRead.key !== key) {
    const started = { key, status: null };
    started.promise = cfExportStatus(ref).then(status => {
      started.status = status;
      return status;
    });
    cfExportStateRead = started;
  }
  const read = cfExportStateRead;
  let status;
  try {
    status = await read.promise;
  } catch (e) {
    console.log('[EXPORT] Export state not read:', e.message);
    if (cfExportStateRead === read) cfExportStateRead = null;
    return;
  }
  // Skipped when a newer read started while this one ran, or when the tab shows another conversation now
  const current = cfConversationRef();
  if (cfExportStateRead !== read || !current || cfExportKey(current) !== key) return;
  const btn = document.querySelector('[data-cf-page-export]');
  if (btn && !btn.disabled) cfApplyExportState(btn, status);
}

// An export recorded in this tab for the conversation open here changes the button's state
function cfOnExportRecorded(chatId) {
  const ref = cfConversationRef();
  if (ref && ref.kind !== 'share' && ref.id === chatId) cfRefreshPageExportButton(true);
}

// Called on every burst of page mutations. A reply that just ended made the chat longer.
function cfWatchExportFreshness() {
  const running = !!document.querySelector(CF_COMPOSER.stop);
  if (cfReplyWasRunning && !running) setTimeout(() => cfRefreshPageExportButton(true), 2000);
  cfReplyWasRunning = running;
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') cfRefreshPageExportButton(true);
});
