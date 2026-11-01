// settings/settings-accounts.js
// The settings page's accounts section: each account with folder data, the account data files, and
// what the Folders panel shows for a login without a choice of its own.
// Globals: settingsAccountLabel, settingsOrgList, renderAccountsSection, renderAccountViewChoice, onAccountViewChange
// Depends on: lib/storage-keys.js (ACCOUNT_VIEW_DEFAULT_KEY, ACCOUNT_VIEW_KEY_PREFIX), settings/settings-format.js,
//             lib/accounts.js (the listAccounts answer)
// Notes: docs/notes/settings/settings-accounts.js.md

function settingsAccountLabel(account) {
  if (!account) return '';
  const label = account.email || account.name || account.key;
  return account.email && account.name ? `${label} (${account.name})` : label;
}

// "admin@example.com (78), Team 2 (8), none recorded (12)". A chat stored without its organization's
// name shows the first 8 characters of the organization's id.
function settingsOrgList(orgs) {
  return (orgs || []).map(o => {
    const name = o.id ? String(o.name || `Organization ${o.id.slice(0, 8)}`).replace(/'s Organization$/i, '') : 'none recorded';
    return `${name} (${o.count})`;
  }).join(', ');
}

async function renderAccountsSection() {
  const status = document.getElementById('accountsStatus');
  const table = document.getElementById('accountsTable');
  const filesTable = document.getElementById('filesTable');
  const filesStatus = document.getElementById('filesStatus');
  let answer;
  try {
    answer = await chrome.runtime.sendMessage({ action: 'listAccounts', withFolders: false });
  } catch (e) {
    status.textContent = `The accounts were not listed: ${e.message}`;
    return;
  }
  if (!answer || !answer.success) {
    status.textContent = `The accounts were not listed: ${(answer && answer.error) || 'the background answered nothing'}`;
    return;
  }

  const accounts = answer.accounts || [];
  status.textContent = accounts.length
    ? `${accounts.length} account${accounts.length === 1 ? '' : 's'} with folder data.`
    : 'No account has folder data yet. Opening claude.ai signed in to an account adds it.';
  const body = table.querySelector('tbody');
  body.replaceChildren(...accounts.map(a => settingsRow([
    { text: settingsAccountLabel(a), badge: a.current ? 'Signed in' : '' },
    { text: a.chatCount, className: 'num' },
    { text: a.folderCount, className: 'num' },
    settingsOrgList(a.orgs),
    a.file ? `${a.source}, ${a.file}` : a.source
  ])));
  table.hidden = !accounts.length;

  const files = answer.files || [];
  if (answer.folderError) {
    filesStatus.textContent = `The data files were not read: ${answer.folderError}`;
  } else {
    const where = answer.folderName ? `"${answer.folderName}"` : 'the data folder';
    filesStatus.textContent = `${files.length} account data file${files.length === 1 ? '' : 's'} in ${where}.`;
  }
  const filesBody = filesTable.querySelector('tbody');
  filesBody.replaceChildren(...files.map(f => {
    const account = accounts.find(a => a.key === f.key);
    let owner = account ? settingsAccountLabel(account) : 'Folders saved before account slots. Every chat in it is also in another account listed above.';
    if (f.error) owner = `Not read: ${f.error}`;
    return settingsRow([f.name, owner, { text: settingsBytes(f.size), className: 'num' }, settingsTime(f.lastModified)]);
  }));
  filesTable.hidden = !files.length;
}

async function renderAccountViewChoice() {
  let value = 'this';
  try {
    const stored = await chrome.storage.local.get(ACCOUNT_VIEW_DEFAULT_KEY);
    if (stored[ACCOUNT_VIEW_DEFAULT_KEY] === 'all') value = 'all';
  } catch (e) {
    console.log('[SETTINGS] The account view default was not read:', e.message);
  }
  document.querySelectorAll('input[name="accountView"]').forEach(input => { input.checked = input.value === value; });
}

// The stored choices of every login are removed, and each panel opens on the new default
async function onAccountViewChange(e) {
  const result = document.getElementById('viewResult');
  try {
    const all = await chrome.storage.local.get(null);
    const choices = Object.keys(all).filter(k => k.startsWith(ACCOUNT_VIEW_KEY_PREFIX));
    await chrome.storage.local.remove(choices);
    await chrome.storage.local.set({ [ACCOUNT_VIEW_DEFAULT_KEY]: e.target.value });
    settingsShowResult(result, e.target.value === 'all'
      ? "Saved. The Folders panel opens on all accounts' folders."
      : "Saved. The Folders panel opens on the signed-in login's folders.", false);
  } catch (err) {
    settingsShowResult(result, `${err.name}: ${err.message}`, true);
  }
}
