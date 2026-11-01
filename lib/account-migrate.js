// lib/account-migrate.js
// Moves a login's stored data from its organization key (before 1.4.0) to its own login key.
// Globals: CF_ACCOUNT_KEY_PREFIXES, cfRekeyAccountView, cfAdoptLegacySlot, cfRetireLegacyFile
// Depends on: lib/storage-keys.js (ACCOUNT_VIEW_KEY_PREFIX, CLAUDE_SHELL_KEY_PREFIX, ORGANIZE_INDEX_KEY_PREFIX),
//             background.js (askFolderWorker)
// Notes: docs/notes/lib/account-migrate.js.md

// Per-login storage keys end in the account key. Sync watermarks add "__<organization id>" after it.
const CF_ACCOUNT_KEY_PREFIXES = ['knownChatIds__', 'pendingNewChats__', MONITORED_NEW_CHATS_KEY_PREFIX, 'importedShares__',
  'importQueue__', ORGANIZE_INDEX_KEY_PREFIX, CLAUDE_SHELL_KEY_PREFIX, ACCOUNT_VIEW_KEY_PREFIX];

// A stored account view names the account key it shows: 'acct:<key>' or 'org:<key>:<org id>'
function cfRekeyAccountView(view, fromKey, toKey) {
  const text = String(view || '');
  if (text === 'acct:' + fromKey) return 'acct:' + toKey;
  if (text.startsWith('org:' + fromKey + ':')) return 'org:' + toKey + text.slice(('org:' + fromKey).length);
  return text;
}

// The data stored under the organization key moves to the login key when it records this login,
// or records no login at all. Data recording another login stays where it is. Returns the data
// moved, or null when nothing moved.
async function cfAdoptLegacySlot(newKey, legacyKey, account) {
  if (!legacyKey || legacyKey === newKey) return null;
  const all = await chrome.storage.local.get(null);
  const slot = all['cfData_' + legacyKey];
  if (!slot || !Array.isArray(slot.folders)) return null;
  const recorded = (slot.metadata && slot.metadata.account) || {};
  const uuid = account && account.uuid;
  if (recorded.uuid && uuid && recorded.uuid !== uuid) {
    console.log('[BG] Data under', legacyKey, 'records', recorded.email || recorded.uuid, 'and stays there');
    return null;
  }

  slot.folders.forEach(f => (f.chats || []).forEach(c => { if (c.accountId === legacyKey) c.accountId = newKey; }));
  slot.metadata = slot.metadata || {};
  if (slot.metadata.account) slot.metadata.account.key = newKey;

  const moved = { ['cfData_' + newKey]: slot };
  const removed = ['cfData_' + legacyKey];
  const watermark = 'syncWatermark__' + legacyKey + '__';
  for (const key of Object.keys(all)) {
    if (key.startsWith(watermark)) {
      moved['syncWatermark__' + newKey + '__' + key.slice(watermark.length)] = all[key];
      removed.push(key);
      continue;
    }
    const prefix = CF_ACCOUNT_KEY_PREFIXES.find(p => key === p + legacyKey);
    if (!prefix) continue;
    moved[prefix + newKey] = prefix === ACCOUNT_VIEW_KEY_PREFIX ? cfRekeyAccountView(all[key], legacyKey, newKey) : all[key];
    removed.push(key);
  }
  await chrome.storage.local.set(moved);
  await chrome.storage.local.remove(removed);
  console.log('[BG] Moved', Object.keys(moved).length, 'stored entries from', legacyKey, 'to', newKey);
  return slot;
}

// The data file named for the organization key is removed once the login key's file is written,
// and only when it records this same login
async function cfRetireLegacyFile(legacyKey, uuid) {
  if (!legacyKey || !uuid) return;
  const result = await askFolderWorker({ action: 'folderRetireAccountFile', key: legacyKey, uuid }, { success: false });
  console.log('[BG] Data file of', legacyKey + ':', result && result.success ? (result.removed ? 'removed' : result.reason) : (result && result.error) || 'no answer');
}
