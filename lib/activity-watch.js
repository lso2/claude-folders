// lib/activity-watch.js
// Turns stored changes and the extension's start into activity log entries: runs, settings, folders and exports.
// Loaded by the service worker (CF_BACKGROUND_FILES in background.js).
// Globals: CF_RUN_NAMES, CF_RUN_KINDS, cfDescribeAccountView, cfFolderSummary, cfDescribeStorageChange
// Depends on: lib/activity-log.js (cfLogActivity), lib/storage-keys.js
// Notes: docs/notes/lib/activity-watch.js.md

const CF_RUN_NAMES = { sync: 'Sync', export: 'Folder export', import: 'Import from another account' };
// The Log tab's category of each run
const CF_RUN_KINDS = { sync: 'Sync', export: 'Exports', import: 'Imports' };

function cfDescribeAccountView(view) {
  if (view === 'all') return 'all accounts';
  const org = /^org:([^:]+):(.*)$/.exec(String(view || ''));
  if (org) return `organization ${org[2] || '(none recorded)'} of login ${org[1]}`;
  const acct = /^acct:(.+)$/.exec(String(view || ''));
  return acct ? `login ${acct[1]}` : String(view);
}

// { folders, chats, names } of the stored folder data
function cfFolderSummary(data) {
  const folders = (data && Array.isArray(data.folders)) ? data.folders : [];
  return {
    folders: folders.length,
    chats: folders.reduce((n, f) => n + ((f && f.chats) || []).length, 0),
    names: new Map(folders.map(f => [f.id, `${f.category || ''} / ${f.name || ''}`]))
  };
}

// Returns [kind, text] for a change worth an entry, or null
function cfDescribeStorageChange(key, change) {
  const before = change.oldValue;
  const after = change.newValue;
  if (key === RUN_STATE_KEY && after) {
    const name = CF_RUN_NAMES[after.run] || after.run || 'Run';
    const kind = CF_RUN_KINDS[after.run] || 'Sync';
    const sameRun = before && before.startedAt === after.startedAt;
    if (!after.done) return sameRun ? null : [kind, `${name} started`];
    if (sameRun && before.done) return null;
    if (after.error) return [kind, `${name} did not finish: ${after.error}`];
    return [kind, `${name} finished${(after.lines || []).length ? ': ' + after.lines.join('; ') : ''}`];
  }
  if (key === AUTO_SYNC_KEY && after) {
    return ['Auto sync', after.enabled ? `Automatic sync on, every ${after.minutes} minutes` : 'Automatic sync off'];
  }
  if (key === AUTO_SYNC_LAST_KEY && after) return ['Auto sync', `Automatic sync: ${after.text}`];
  if (key === BUTTON_COLOR_KEY) return ['Colors', after ? `Button color set to ${after}` : 'Button color reset to the default orange'];
  if (key === BUTTON_COLOR_ORGANIZER_KEY) return ['Colors', after ? 'Button color applied to the organizer' : 'Organizer keeps its own oranges'];
  if (key === ACCOUNT_VIEW_DEFAULT_KEY) return ['Accounts', `Folders panel opens on ${after === 'all' ? 'all accounts' : 'this login'}`];
  if (key.startsWith(ACCOUNT_VIEW_KEY_PREFIX) && after) return ['Accounts', `Account dropdown set to ${cfDescribeAccountView(after)}`];
  if (key === MIGRATION_REQUEST_KEY && after) return ['Imports', `Request sent with imported chats: ${after === 'short' ? 'short' : 'reconstruct'}`];
  if (key === ORGANIZER_HOME_VIEW_KEY && after) return ['Organizer', `Organizer home view: ${after}`];
  if (key === CHAT_LIST_SORT_KEY && after) return ['Organizer', `Chat list sort: ${after.key}, ${after.dir === 'asc' ? 'ascending' : 'descending'}`];
  if (key === 'activeAccountKey' && after && after !== before) return ['Accounts', `Signed-in login is ${after}`];
  if (key === QUEUED_EXPORTS_KEY) {
    const was = Array.isArray(before) ? before.length : 0;
    const now = Array.isArray(after) ? after.length : 0;
    if (now === was) return null;
    return ['Exports', now ? `${now} export${now === 1 ? '' : 's'} waiting for folder access` : 'No exports waiting for folder access'];
  }
  if (key === EXPORT_STATE_KEY && after) {
    const written = Object.entries(after)
      .filter(([id, rec]) => rec && rec.filename && (!before || !before[id] || before[id].exportedAt !== rec.exportedAt))
      .map(([, rec]) => rec.filename);
    if (!written.length) return null;
    const shown = written.slice(0, 5).join(', ');
    return ['Exports', `Exported ${shown}${written.length > 5 ? ` and ${written.length - 5} more` : ''}`];
  }
  if (key === 'cachedData') {
    const a = cfFolderSummary(before);
    const b = cfFolderSummary(after);
    const added = [...b.names.keys()].filter(id => !a.names.has(id)).map(id => b.names.get(id));
    const removed = [...a.names.keys()].filter(id => !b.names.has(id)).map(id => a.names.get(id));
    const renamed = [...b.names.keys()].filter(id => a.names.has(id) && a.names.get(id) !== b.names.get(id))
      .map(id => `${a.names.get(id)} to ${b.names.get(id)}`);
    if (!added.length && !removed.length && !renamed.length && a.chats === b.chats) return null;
    const parts = [`${b.folders} folder${b.folders === 1 ? '' : 's'}, ${b.chats} chat${b.chats === 1 ? '' : 's'}`];
    if (b.chats !== a.chats) parts.push(`${b.chats > a.chats ? '+' : ''}${b.chats - a.chats} chats`);
    if (added.length) parts.push(`added ${added.join(', ')}`);
    if (removed.length) parts.push(`removed ${removed.join(', ')}`);
    if (renamed.length) parts.push(`renamed ${renamed.join(', ')}`);
    return ['Folders', `Folders saved: ${parts.join('; ')}`];
  }
  return null;
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  Object.entries(changes).forEach(([key, change]) => {
    if (key === ACTIVITY_LOG_KEY || key.startsWith(ACTIVITY_LOG_CHUNK_PREFIX)) return;
    const entry = cfDescribeStorageChange(key, change);
    if (entry) cfLogActivity(entry[0], entry[1]);
  });
});

chrome.runtime.onInstalled.addListener((details) => {
  const version = chrome.runtime.getManifest().version;
  if (details.reason === 'install') cfLogActivity('Extension', `Installed, version ${version}`);
  else if (details.reason === 'update') {
    cfLogActivity('Extension', details.previousVersion && details.previousVersion !== version
      ? `Updated from ${details.previousVersion} to ${version}` : `Reloaded, version ${version}`);
  }
});

chrome.runtime.onStartup.addListener(() => cfLogActivity('Extension', `Started with the browser, version ${chrome.runtime.getManifest().version}`));
