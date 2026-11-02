// lib/account-view-store.js
// Reads, stores and watches the account view each login keeps, shared by the Folders panel, the organizer and the popup.
// Globals: cfReadAccountView, cfStoreAccountView, cfWatchAccountView
// Depends on: lib/storage-keys.js (ACCOUNT_VIEW_KEY_PREFIX, ACCOUNT_VIEW_DEFAULT_KEY), lib/account-view.js (cfParseAccountView)
// Notes: docs/notes/lib/account-view-store.js.md

// The view stored for the login, else the settings page's default: all accounts or this login
async function cfReadAccountView(accountKey) {
  const key = ACCOUNT_VIEW_KEY_PREFIX + accountKey;
  let stored = {};
  try {
    stored = await chrome.storage.local.get([key, ACCOUNT_VIEW_DEFAULT_KEY]);
  } catch (e) {
    console.log('[ACCOUNTS] The account view was not read:', e.message);
  }
  if (cfParseAccountView(stored[key])) return stored[key];
  return stored[ACCOUNT_VIEW_DEFAULT_KEY] === 'all' ? 'all' : 'acct:' + accountKey;
}

async function cfStoreAccountView(accountKey, view) {
  try {
    await chrome.storage.local.set({ [ACCOUNT_VIEW_KEY_PREFIX + accountKey]: view });
  } catch (e) {
    console.log('[ACCOUNTS] The account view was not stored:', e.message);
  }
}

// onChange(view) runs when another page stores a new view for the login getKey() names
function cfWatchAccountView(getKey, onChange) {
  chrome.storage.onChanged.addListener((changes, area) => {
    const key = getKey();
    if (area !== 'local' || !key) return;
    const change = changes[ACCOUNT_VIEW_KEY_PREFIX + key];
    if (change && cfParseAccountView(change.newValue)) onChange(change.newValue);
  });
}
