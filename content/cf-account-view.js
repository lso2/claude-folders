// content/cf-account-view.js
// The folders panel's account view: the account dropdown and the folders and chats it shows.
// Globals: cfOwnAccount, cfViewAccounts, cfLoadAccountView, cfSaveAccountView,
//          cfLoadAccountList, cfRenderAccountSelect, cfViewFolders, cfOrgTag, cfAccountTag
// Depends on: lib/account-view.js, lib/account-view-store.js, content/cf-state.js, content/cf-account.js, content/cf-text.js,
//             lib/storage-keys.js, lib/accounts.js (the listAccounts answer)
// Notes: docs/notes/content/cf-account-view.js.md

// This login, from the folders this page holds. They change with every edit made here.
function cfOwnAccount() {
  const listed = cfAccountList && Array.isArray(cfAccountList.accounts) ? cfAccountList.accounts.find(a => a.key === cfAccountKey) : null;
  return {
    key: cfAccountKey,
    current: true,
    email: (cfAccountInfo && cfAccountInfo.email) || (listed && listed.email) || null,
    name: (cfAccountInfo && cfAccountInfo.name) || (listed && listed.name) || metadata.userName || null,
    chatCount: folders.reduce((n, f) => n + (f.chats || []).length, 0),
    orgs: cfOrgsOfFolders(folders),
    folders
  };
}

// This login first, then the other accounts the background listed with their folders
function cfViewAccounts() {
  const others = cfAccountList && Array.isArray(cfAccountList.accounts)
    ? cfAccountList.accounts.filter(a => a.key !== cfAccountKey && Array.isArray(a.folders))
    : [];
  return [cfOwnAccount(), ...others];
}

// The choice stored for this login, else the settings page's default (lib/account-view-store.js)
async function cfLoadAccountView() {
  cfAccountView = await cfReadAccountView(cfAccountKey);
}

async function cfSaveAccountView() {
  await cfStoreAccountView(cfAccountKey, cfAccountView);
}

// A choice made in the organizer or the popup redraws the open panel
cfWatchAccountView(() => cfAccountKey, (view) => {
  if (view === cfAccountView) return;
  cfAccountView = view;
  const panel = document.querySelector('.claude-folders-panel');
  if (panel) renderPanelContent(panel);
});

// Other accounts come from other logins of this browser profile and from their data files
async function cfLoadAccountList() {
  try {
    const answer = await chrome.runtime.sendMessage({ action: 'listAccounts', withFolders: true });
    if (!answer || !answer.success) {
      console.log('[CONTENT] Accounts were not listed:', (answer && answer.error) || 'the background answered nothing');
      return;
    }
    if (answer.folderError) console.log('[CONTENT] Account files in the data folder were not read:', answer.folderError);
    cfAccountList = answer;
  } catch (e) {
    console.log('[CONTENT] Accounts were not listed:', e.message);
  }
}

// One account and one organization need no dropdown. Organizations are listed under an account
// that has more than one (lib/account-view.js).
function cfRenderAccountSelect() {
  const choices = cfAccountViewChoices(cfViewAccounts(), cfAccountView, cfAccountKey);
  if (!choices.length) return '';
  const html = choices.map(c => `<option value="${cfEscapeHtml(c.value)}"${c.selected ? ' selected' : ''}>${c.indent ? '&nbsp;&nbsp;&nbsp;&nbsp;' : ''}${cfEscapeHtml(c.label)}</option>`).join('');
  return `<div class="cf-account-view"><select class="cf-account-select" aria-label="Accounts shown">${html}</select></div>`;
}

// The folders the view shows (lib/account-view.js cfFoldersForView)
function cfViewFolders() {
  return cfFoldersForView(cfViewAccounts(), cfAccountView, cfAccountKey);
}

// A short label for chats from another organization of this login. Chats from the organization this
// tab is signed into carry none.
function cfOrgTag(chat) {
  if (!chat || !chat.orgId || !chat.orgName) return '';
  if (cfActiveOrgId && chat.orgId === cfActiveOrgId) return '';
  const short = cfShortOrgName(chat.orgName).slice(0, 18);
  return `<span class="folder-chat-org" title="${cfEscapeHtml(chat.orgName)}">${cfEscapeHtml(short)}</span>`;
}

// The account label on a chat of another account
function cfAccountTag(account) {
  const label = cfAccountLabel(account);
  return `<span class="folder-chat-org" title="${cfEscapeHtml(label)}">${cfEscapeHtml(label.slice(0, 18))}</span>`;
}
