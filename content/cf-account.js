// content/cf-account.js
// Resolves the signed-in account and names the per-account storage keys.
// Globals: cfAccountKey, cfAccountReady, cfAccountInfo, cfResolveOrgKey, cfLoginKey, cfReadAccountInfo, cfKnownKey,
//          cfPendingKey, cfMonitorKey, cfAccountViewKey, cfWatermarkKey, cfImportedKey, cfImportQueueKey,
//          cfShellKey, cfOrganizeIndexKey, cfInitAccount
// Depends on: content/cf-text.js (cfHash), lib/storage-keys.js (ACCOUNT_VIEW_KEY_PREFIX, CLAUDE_SHELL_KEY_PREFIX,
//             ORGANIZE_INDEX_KEY_PREFIX)
// Notes: docs/notes/content/cf-account.js.md

// Folders, known ids and queues are stored per login, keyed by the login's account id
let cfAccountKey = 'acct_default';
let cfAccountReady = null;
// { uuid, email, name } from Claude's account endpoint, or null when it did not answer
let cfAccountInfo = null;

// Every member of an organization shares its ids, so this key is used only when the account
// endpoint gives no id, and as the key the login's data had before 1.4.0
async function cfResolveOrgKey() {
  try {
    const res = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
    if (res.ok) {
      const orgs = await res.json();
      if (Array.isArray(orgs) && orgs.length) {
        const ids = orgs.map(o => o && (o.uuid || o.id)).filter(Boolean).sort();
        if (ids.length) return 'acct_' + cfHash(ids.join('|'));
      }
    }
  } catch (e) {
    console.log('[CONTENT] account resolve failed:', e.message);
  }
  try {
    const btn = document.querySelector('[data-testid="user-menu-button"]');
    const txt = btn?.textContent?.trim();
    if (txt) return 'acct_' + cfHash(txt);
  } catch (e) {}
  return 'acct_default';
}

// The account's email labels it in the account view and on the settings page
async function cfReadAccountInfo() {
  try {
    const res = await fetch('https://claude.ai/api/account', { credentials: 'include' });
    if (!res.ok) {
      console.log('[CONTENT] The account endpoint returned', res.status);
      return null;
    }
    const account = await res.json();
    return {
      uuid: account.uuid || null,
      email: account.email_address || null,
      name: account.full_name || account.display_name || null
    };
  } catch (e) {
    console.log('[CONTENT] The account endpoint failed:', e.message);
    return null;
  }
}

function cfLoginKey(uuid) {
  return 'acct_' + cfHash('login|' + uuid);
}

function cfKnownKey() { return 'knownChatIds__' + cfAccountKey; }
function cfPendingKey() { return 'pendingNewChats__' + cfAccountKey; }
function cfMonitorKey() { return 'monitoredNewChats__' + cfAccountKey; }
function cfAccountViewKey() { return ACCOUNT_VIEW_KEY_PREFIX + cfAccountKey; }
function cfWatermarkKey(orgId) { return 'syncWatermark__' + cfAccountKey + '__' + String(orgId || 'active'); }
function cfImportedKey() { return 'importedShares__' + cfAccountKey; }
function cfImportQueueKey() { return 'importQueue__' + cfAccountKey; }
function cfShellKey() { return CLAUDE_SHELL_KEY_PREFIX + cfAccountKey; }
function cfOrganizeIndexKey() { return ORGANIZE_INDEX_KEY_PREFIX + cfAccountKey; }

// The background moves data stored under the organization key to the login key (lib/account-migrate.js)
async function cfInitAccount() {
  let orgKey;
  [orgKey, cfAccountInfo] = await Promise.all([cfResolveOrgKey(), cfReadAccountInfo()]);
  cfAccountKey = cfAccountInfo && cfAccountInfo.uuid ? cfLoginKey(cfAccountInfo.uuid) : orgKey;
  const legacyKey = orgKey !== cfAccountKey ? orgKey : null;
  console.log('[CONTENT] account key:', cfAccountKey, cfAccountInfo && cfAccountInfo.email ? 'email found' : 'no email');
  try {
    await chrome.runtime.sendMessage({ action: 'setAccount', accountKey: cfAccountKey, legacyKey, account: cfAccountInfo });
  } catch (e) {
    console.log('[CONTENT] setAccount failed:', e.message);
  }
}
