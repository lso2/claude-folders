// lib/account-view.js
// Lists the choices of the account dropdown and the folders each choice shows.
// Loaded by the content scripts (Folders panel) and the organizer page.
// Globals: cfShortOrgName, cfAccountLabel, cfOrgsOfFolders, cfParseAccountView, cfAccountViewChoices,
//          cfFoldersForView
// Notes: docs/notes/lib/account-view.js.md

function cfShortOrgName(name) {
  return String(name || 'Account').replace(/'s Organization$/i, '').trim();
}

// The email, else the name, else the account key
function cfAccountLabel(account) {
  return (account && (account.email || account.name || account.key)) || 'Account';
}

// Each organization of the chats with a count. id null groups chats stored before chats carried it.
function cfOrgsOfFolders(list) {
  const byId = new Map();
  (list || []).forEach(f => (f.chats || []).forEach(c => {
    const id = c.orgId || null;
    const org = byId.get(id) || { id, name: null, count: 0 };
    if (!org.name && c.orgName) org.name = c.orgName;
    org.count++;
    byId.set(id, org);
  }));
  return Array.from(byId.values()).sort((a, b) => b.count - a.count);
}

// 'all', 'acct:<key>' or 'org:<key>:<org id>'. An empty org id is the group without an organization.
function cfParseAccountView(view) {
  const text = String(view || '');
  if (text === 'all') return { kind: 'all' };
  const org = /^org:([^:]+):(.*)$/.exec(text);
  if (org) return { kind: 'org', key: org[1], orgId: org[2] || null };
  const acct = /^acct:(.+)$/.exec(text);
  if (acct) return { kind: 'acct', key: acct[1] };
  return null;
}

// accounts: [{ key, current, email, name, chatCount, orgs, folders }], this login first.
// Returns [{ value, label, indent, selected }], or [] when one account with one organization leaves no choice.
function cfAccountViewChoices(accounts, view, currentKey) {
  if (!accounts.length || (accounts.length < 2 && accounts[0].orgs.length < 2)) return [];
  const parsed = cfParseAccountView(view);
  const known = parsed && (parsed.kind === 'all' || accounts.some(a => a.key === parsed.key));
  const selected = known ? view : 'acct:' + currentKey;
  const choices = [];
  const add = (value, label, indent) => choices.push({ value, label, indent: !!indent, selected: value === selected });
  if (accounts.length > 1) add('all', `All accounts (${accounts.reduce((n, a) => n + a.chatCount, 0)})`);
  accounts.forEach(a => {
    add('acct:' + a.key, `${cfAccountLabel(a)}${a.current ? ', signed in' : ''} (${a.chatCount})`);
    if (a.orgs.length > 1) {
      a.orgs.forEach(o => {
        const name = o.id ? cfShortOrgName(o.name || `Organization ${o.id.slice(0, 8)}`) : 'No organization recorded';
        add(`org:${a.key}:${o.id || ''}`, `${name} (${o.count})`, true);
      });
    }
  });
  return choices;
}

// The folders the view shows: [{ id, name, category, exportId, rows: [{ chat, account }] }].
// exportId is this login's folder id. Other accounts' chats cannot be read from this login.
// All accounts merges folders with the same category and name, this login's first.
function cfFoldersForView(accounts, view, currentKey) {
  let parsed = cfParseAccountView(view);
  if (!parsed || (parsed.kind !== 'all' && !accounts.some(a => a.key === parsed.key))) parsed = { kind: 'acct', key: currentKey };
  const shown = parsed.kind === 'all' ? accounts : accounts.filter(a => a.key === parsed.key);
  const merged = new Map();
  const seen = new Set();
  const list = [];
  shown.forEach(account => (account.folders || []).forEach(f => {
    const mergeKey = parsed.kind === 'all' ? `${String(f.category || '').toLowerCase()}\n${String(f.name || '').toLowerCase()}` : `${account.key}\n${f.id}`;
    let entry = merged.get(mergeKey);
    if (!entry) {
      entry = { id: account.current ? f.id : `${account.key}:${f.id}`, name: f.name, category: f.category, exportId: account.current ? f.id : null, rows: [] };
      merged.set(mergeKey, entry);
      list.push(entry);
    }
    (f.chats || []).forEach(chat => {
      if (parsed.kind === 'org' && (chat.orgId || null) !== parsed.orgId) return;
      if (seen.has(chat.id)) return;
      seen.add(chat.id);
      entry.rows.push({ chat, account });
    });
  }));
  return parsed.kind === 'org' ? list.filter(f => f.rows.length) : list;
}
