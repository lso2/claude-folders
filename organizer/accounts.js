// organizer/accounts.js
// The organizer's account dropdown and the folders of the accounts it shows.
// Globals: organizerOtherAccounts, organizerAccountView, organizerCurrentKey, viewFolders, ownAccountEntry,
//          loadOrganizerAccounts, buildViewFolders, renderAccountSelect, applyOrganizerAccountView
// Shared with the offline library.
// Depends on: organizer/home-views.js (renderHomeView), lib/account-view.js, the page's state (folders, metadata),
//             lib/html-escape.js (esc), organizer/folders.js, organizer/content-search.js (refreshContentSearchRows), the page's
//             host file (cfHostListAccounts, cfHostReadAccountView, cfHostStoreAccountView, cfHostImportAccount)
// Notes: docs/notes/organizer/accounts.js.md

// Other logins' and data files' accounts from the background's listAccounts answer, with their folders
let organizerOtherAccounts = [];
// 'all', 'acct:<key>' or 'org:<key>:<org id>', shared with the Folders panel of the same login
let organizerAccountView = null;
let organizerCurrentKey = null;
// The folders the page draws: this login's folders, or the view's mix with other accounts' chats
let viewFolders = [];

function ownAccountEntry() {
  const recorded = (metadata && metadata.account) || {};
  return {
    key: organizerCurrentKey,
    current: true,
    email: recorded.email || null,
    name: recorded.name || metadata.userName || null,
    chatCount: folders.reduce((n, f) => n + (f.chats || []).length, 0),
    orgs: cfOrgsOfFolders(folders),
    folders
  };
}

// The accounts and the view chosen for this login (cfHostListAccounts, cfHostReadAccountView)
async function loadOrganizerAccounts() {
  const answer = await cfHostListAccounts();
  organizerCurrentKey = answer.current || null;
  organizerOtherAccounts = (answer.accounts || []).filter(a => !a.current && Array.isArray(a.folders));
  if (answer.folderError) console.log('[ORGANIZER] Account files were not read:', answer.folderError);
  organizerAccountView = await cfHostReadAccountView(organizerCurrentKey);
}

// Folder objects in the shape of this login's own: { id, name, category, chats, own, lastActivity }.
// A chat of another account carries cfAccountLabel, and only own folders can be changed here.
function buildViewFolders() {
  const accounts = [ownAccountEntry(), ...organizerOtherAccounts];
  viewFolders = cfFoldersForView(accounts, organizerAccountView, organizerCurrentKey).map(f => {
    const chats = f.rows.map(r => r.account.current ? r.chat : { ...r.chat, cfAccountLabel: cfAccountLabel(r.account) });
    return {
      id: f.id,
      name: f.name,
      category: f.category,
      own: !!f.exportId,
      chats,
      lastActivity: chats.length ? Math.max(...chats.map(c => new Date(c.date || 0).getTime())) : 0
    };
  });
  return viewFolders;
}

// The import button is shown while another account has chats, on a page that can import (cfHostImportAccount)
function renderAccountSelect() {
  const select = document.getElementById('accountSelect');
  const importBtn = document.getElementById('importAccountBtn');
  importBtn.hidden = !cfHostImportAccount || !organizerOtherAccounts.some(a => a.chatCount > 0);
  importBtn.onclick = cfHostImportAccount;
  const choices = cfAccountViewChoices([ownAccountEntry(), ...organizerOtherAccounts], organizerAccountView, organizerCurrentKey);
  select.hidden = !choices.length;
  select.innerHTML = choices.map(c => `<option value="${esc(c.value)}"${c.selected ? ' selected' : ''}>${c.indent ? '&nbsp;&nbsp;&nbsp;&nbsp;' : ''}${esc(c.label)}</option>`).join('');
  select.onchange = async () => {
    organizerAccountView = select.value;
    await cfHostStoreAccountView(organizerCurrentKey, organizerAccountView);
    applyOrganizerAccountView();
  };
}

// The Chats list under the search box and the List or Cards view show the chats of the accounts chosen
function applyOrganizerAccountView() {
  buildViewFolders();
  renderCategoryFilters();
  renderFolderList();
  refreshContentSearchRows();
  renderHomeView();
}

