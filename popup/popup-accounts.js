// popup/popup-accounts.js
// The popup's account dropdown and the folders of the accounts it shows, the same choice as the panel and organizer.
// Globals: popupAccountKey, popupOtherAccounts, popupAccountView, popupOwnAccount, popupShownFolders,
//          loadPopupAccounts, renderPopupAccountSelect, applyPopupAccountView
// Depends on: lib/account-view.js (cfFoldersForView, cfAccountViewChoices, cfOrgsOfFolders), lib/account-view-store.js,
//             popup/popup.js (folders, metadata), popup/popup-folders.js (renderCategoryFilters, renderFolders,
//             updateStats, popupEsc), background.js (listAccounts)
// Notes: docs/notes/popup/popup-accounts.js.md

let popupAccountKey = null;
// Other logins' and data files' accounts from the background's listAccounts answer, with their folders
let popupOtherAccounts = [];
let popupListedSelf = null;
// 'all', 'acct:<key>' or 'org:<key>:<org id>', stored per login (lib/account-view-store.js)
let popupAccountView = null;

function popupOwnAccount() {
  const recorded = (metadata && metadata.account) || {};
  return {
    key: popupAccountKey,
    current: true,
    email: recorded.email || (popupListedSelf && popupListedSelf.email) || null,
    name: recorded.name || (popupListedSelf && popupListedSelf.name) || null,
    chatCount: folders.reduce((n, f) => n + (f.chats || []).length, 0),
    orgs: cfOrgsOfFolders(folders),
    folders
  };
}

// The folders the view shows, in this login's folder shape. own is false for another account's folder.
// Before the accounts are read, this login's folders.
function popupShownFolders() {
  if (!popupAccountKey) return folders.map(f => ({ ...f, own: true }));
  return cfFoldersForView([popupOwnAccount(), ...popupOtherAccounts], popupAccountView, popupAccountKey).map(f => ({
    id: f.id,
    name: f.name,
    category: f.category,
    own: !!f.exportId,
    chats: f.rows.map(r => r.chat)
  }));
}

async function loadPopupAccounts() {
  try {
    const answer = await chrome.runtime.sendMessage({ action: 'listAccounts', withFolders: true });
    if (answer && answer.success) {
      popupAccountKey = answer.current || null;
      popupListedSelf = (answer.accounts || []).find(a => a.current) || null;
      popupOtherAccounts = (answer.accounts || []).filter(a => !a.current && Array.isArray(a.folders));
    } else {
      console.log('[POPUP] Accounts were not listed:', (answer && answer.error) || 'the background answered nothing');
    }
  } catch (e) {
    console.log('[POPUP] Accounts were not listed:', e.message);
  }
  if (!popupAccountKey) {
    const stored = await chrome.storage.local.get('activeAccountKey');
    popupAccountKey = stored.activeAccountKey || null;
  }
  if (popupAccountKey) popupAccountView = await cfReadAccountView(popupAccountKey);
}

// One account with one organization leaves no choice, and the dropdown stays hidden (lib/account-view.js)
function renderPopupAccountSelect() {
  const select = document.getElementById('popupAccountSelect');
  if (!select) return;
  const choices = popupAccountKey ? cfAccountViewChoices([popupOwnAccount(), ...popupOtherAccounts], popupAccountView, popupAccountKey) : [];
  select.hidden = !choices.length;
  select.innerHTML = choices.map(c => `<option value="${popupEsc(c.value)}"${c.selected ? ' selected' : ''}>${c.indent ? '&nbsp;&nbsp;&nbsp;&nbsp;' : ''}${popupEsc(c.label)}</option>`).join('');
  select.onchange = async () => {
    popupAccountView = select.value;
    await cfStoreAccountView(popupAccountKey, popupAccountView);
    applyPopupAccountView();
  };
}

function applyPopupAccountView() {
  renderCategoryFilters();
  renderFolders();
  updateStats();
}

// A choice made in the Folders panel or the organizer while the popup is open
cfWatchAccountView(() => popupAccountKey, (view) => {
  if (view === popupAccountView) return;
  popupAccountView = view;
  renderPopupAccountSelect();
  applyPopupAccountView();
});
