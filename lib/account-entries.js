// lib/account-entries.js
// Turns each account's folder data into the entries of the account dropdown: chat counts, organizations and one entry per login.
// Loaded by the service worker (before lib/accounts.js) and by the offline library (copied by lib/data-file.js).
// Globals: CF_LEGACY_ACCOUNT_KEYS, cfSlimFolders, cfAccountEntry, cfIsLegacyCopy, cfOneEntryPerLogin
// Notes: docs/notes/lib/account-entries.js.md

// Keys of the folders saved before each login had its own slot (background.js setAccount)
const CF_LEGACY_ACCOUNT_KEYS = ['default', 'acct_default'];

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
