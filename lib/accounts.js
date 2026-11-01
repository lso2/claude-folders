// lib/accounts.js
// Lists every account with folder data: this login, other logins stored in this browser profile,
// and the account data files in the data folder.
// Globals: CF_LEGACY_ACCOUNT_KEYS, cfAccountFiles, cfSlimFolders, cfAccountEntry, cfIsLegacyCopy,
//          cfOneEntryPerLogin, releaseForeignChats, listAccounts
// Depends on: background.js (cachedData, currentAccountKey, loadCachedData, askFolderWorker, persist,
//             syncDataToDisk, broadcastDataUpdated)
// Notes: docs/notes/lib/accounts.js.md

// Keys of the folders saved before each login had its own slot (background.js setAccount)
const CF_LEGACY_ACCOUNT_KEYS = ['default', 'acct_default'];

// The data files read from the data folder, by file name: { lastModified, data }
let cfAccountFiles = {};

// The fields the folders panel shows. Snippets and dates stay out of the message.
function cfSlimFolders(folders) {
  return (folders || []).map(f => ({
    id: f.id,
    name: f.name,
    category: f.category,
    chats: (f.chats || []).map(c => ({ id: c.id, title: c.title, url: c.url, orgId: c.orgId || null, orgName: c.orgName || null, tags: c.tags || [] }))
  }));
}

// orgs lists each organization of the account's chats with a count. id null groups the chats
// stored before chats carried their organization.
function cfAccountEntry(key, data, source, file, currentKey) {
  const meta = (data && data.metadata) || {};
  const account = meta.account || {};
  const orgs = new Map();
  let chatCount = 0;
  const folders = (data && Array.isArray(data.folders)) ? data.folders : [];
  folders.forEach(f => (f.chats || []).forEach(c => {
    chatCount++;
    const id = c.orgId || null;
    const org = orgs.get(id) || { id, name: null, count: 0 };
    if (!org.name && c.orgName) org.name = c.orgName;
    org.count++;
    orgs.set(id, org);
  }));
  return {
    key,
    current: key === currentKey,
    source,
    file: file || null,
    uuid: account.uuid || null,
    email: account.email || null,
    name: account.name || meta.userName || null,
    team: meta.userTeam || null,
    folderCount: folders.length,
    chatCount,
    orgs: Array.from(orgs.values()).sort((a, b) => b.count - a.count)
  };
}

// A legacy entry whose chats all appear in another listed account is that account's older copy
function cfIsLegacyCopy(entry, idsByKey, entries) {
  if (entry.current || !CF_LEGACY_ACCOUNT_KEYS.includes(entry.key)) return false;
  const ids = idsByKey.get(entry.key);
  return entries.some(other => {
    if (other.key === entry.key || CF_LEGACY_ACCOUNT_KEYS.includes(other.key)) return false;
    const otherIds = idsByKey.get(other.key);
    for (const id of ids) if (!otherIds.has(id)) return false;
    return true;
  });
}

// Keys made from an organization (before 1.4.0) and from the login itself can both hold one login's
// data. Entries recording the same login are one account: this login's own, else the newest file.
function cfOneEntryPerLogin(entries) {
  const kept = new Map();
  const out = [];
  for (const entry of entries) {
    if (!entry.uuid) { out.push(entry); continue; }
    const other = kept.get(entry.uuid);
    if (!other) { kept.set(entry.uuid, entry); out.push(entry); continue; }
    const better = entry.current || (!other.current && (entry.lastModified || 0) > (other.lastModified || 0));
    if (better) {
      out[out.indexOf(other)] = entry;
      kept.set(entry.uuid, entry);
    }
  }
  return out;
}

// Chats this login could not read leave its folders when another account's data holds them.
// ids are the chats the export pass could not read. Returns { success, released, ids, accounts }.
async function releaseForeignChats(ids) {
  if (!cachedData) await loadCachedData();
  const wanted = new Set((ids || []).map(String));
  if (!wanted.size || !currentAccountKey) return { success: true, released: 0, ids: [], accounts: [] };
  const listing = await listAccounts(true);
  const holder = new Map();
  for (const account of listing.accounts) {
    if (account.current || account.key === currentAccountKey) continue;
    for (const f of account.folders || []) {
      for (const c of f.chats || []) if (wanted.has(c.id) && !holder.has(c.id)) holder.set(c.id, account);
    }
  }
  if (!holder.size) return { success: true, released: 0, ids: [], accounts: [] };
  const counts = new Map();
  (cachedData.folders || []).forEach(f => {
    f.chats = (f.chats || []).filter(c => {
      const account = holder.get(c.id);
      if (!account) return true;
      const label = account.email || account.name || account.key;
      counts.set(label, (counts.get(label) || 0) + 1);
      return false;
    });
  });
  const released = Array.from(counts.values()).reduce((n, c) => n + c, 0);
  console.log('[BG] Released', released, 'chats to the accounts that hold them:', Array.from(counts.entries()).map(([l, n]) => `${l} ${n}`).join(', '));
  await persist();
  await syncDataToDisk();
  await broadcastDataUpdated();
  return { success: true, released, ids: Array.from(holder.keys()), accounts: Array.from(counts.entries()).map(([label, count]) => ({ label, count })) };
}

// withFolders adds each other account's folders. The page holds this login's folders already.
async function listAccounts(withFolders) {
  if (!cachedData) await loadCachedData();
  const stored = await chrome.storage.local.get(null);
  // A restarted service worker learns the login from the next claude.ai page. The last one is stored.
  const currentKey = currentAccountKey || stored.activeAccountKey || null;
  const sources = new Map();
  if (currentKey) sources.set(currentKey, { data: currentAccountKey ? cachedData : (stored['cfData_' + currentKey] || cachedData), source: 'this login' });
  Object.keys(stored).filter(k => k.startsWith('cfData_')).forEach(k => {
    const key = k.slice('cfData_'.length);
    if (!sources.has(key) && stored[k] && Array.isArray(stored[k].folders)) sources.set(key, { data: stored[k], source: 'browser storage' });
  });

  const known = {};
  Object.entries(cfAccountFiles).forEach(([name, copy]) => { known[name] = copy.lastModified; });
  const read = await askFolderWorker({ action: 'folderReadAccountFiles', known }, { success: false, error: 'The folder worker returned no result' });
  const files = [];
  if (read.success) {
    const listed = new Set();
    for (const f of read.files) {
      listed.add(f.name);
      if (f.data) cfAccountFiles[f.name] = { lastModified: f.lastModified, data: f.data };
      files.push({ name: f.name, key: f.key, lastModified: f.lastModified, size: f.size, error: f.error || null });
      const copy = cfAccountFiles[f.name];
      if (!copy || f.error) continue;
      const existing = sources.get(f.key);
      if (existing && existing.source === 'this login') existing.file = f.name;
      else sources.set(f.key, { data: copy.data, source: 'data folder', file: f.name });
    }
    Object.keys(cfAccountFiles).forEach(name => { if (!listed.has(name)) delete cfAccountFiles[name]; });
  }

  const idsByKey = new Map();
  let entries = [];
  sources.forEach((s, key) => {
    const ids = new Set();
    ((s.data && s.data.folders) || []).forEach(f => (f.chats || []).forEach(c => ids.add(c.id)));
    idsByKey.set(key, ids);
    const entry = cfAccountEntry(key, s.data, s.source, s.file, currentKey);
    entry.lastModified = s.file && cfAccountFiles[s.file] ? cfAccountFiles[s.file].lastModified : 0;
    if (withFolders && !entry.current) entry.folders = cfSlimFolders(s.data && s.data.folders);
    entries.push(entry);
  });
  entries = entries.filter(e => !cfIsLegacyCopy(e, idsByKey, entries));
  entries = cfOneEntryPerLogin(entries);
  entries.sort((a, b) => (b.current - a.current) || (b.chatCount - a.chatCount));
  return {
    success: true,
    current: currentKey,
    accounts: entries,
    files,
    folderName: read.success ? read.folderName : null,
    folderError: read.success ? null : read.error
  };
}
