// lib/account-identity.js
// Records the signed-in account in its folder data and tags each of its chats with the account key.
// Globals: cfTagChats, cfApplyAccountIdentity
// Notes: docs/notes/lib/account-identity.js.md

// Gives every chat without an accountId the account key of the data it is stored in.
// Returns how many chats were tagged.
function cfTagChats(data, key) {
  if (!key || !data || !Array.isArray(data.folders)) return 0;
  let tagged = 0;
  data.folders.forEach(f => (f.chats || []).forEach(c => {
    if (!c.accountId) {
      c.accountId = key;
      tagged++;
    }
  }));
  return tagged;
}

// account is { uuid, email, name } from Claude's /api/account, read by the page. Values the page
// could not read keep what was recorded before. True when the data changed.
function cfApplyAccountIdentity(data, key, account) {
  if (!data) return false;
  data.metadata = data.metadata || {};
  let changed = false;
  if (account && (account.uuid || account.email || account.name)) {
    const before = data.metadata.account || {};
    const next = {
      key,
      uuid: account.uuid || before.uuid || null,
      email: account.email || before.email || null,
      name: account.name || before.name || null
    };
    if (before.key !== next.key || before.uuid !== next.uuid || before.email !== next.email || before.name !== next.name) {
      data.metadata.account = next;
      changed = true;
    }
  }
  if (cfTagChats(data, key) > 0) changed = true;
  return changed;
}
