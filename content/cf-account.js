// content/cf-account.js
// Resolves the signed-in account and names the per-account storage keys.
// Globals: cfAccountKey, cfAccountReady, cfResolveAccountKey, cfKnownKey, cfPendingKey,
//          cfMonitorKey, cfOrgFilterKey, cfWatermarkKey, cfImportedKey, cfImportQueueKey,
//          cfInitAccount
// Depends on: content/cf-text.js (cfHash)
// Notes: docs/notes/content/cf-account.js.md

// Folders, known ids and queues are stored per account, keyed by its organization ids
let cfAccountKey = 'acct_default';
let cfAccountReady = null;

async function cfResolveAccountKey() {
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

function cfKnownKey() { return 'knownChatIds__' + cfAccountKey; }
function cfPendingKey() { return 'pendingNewChats__' + cfAccountKey; }
function cfMonitorKey() { return 'monitoredNewChats__' + cfAccountKey; }
function cfOrgFilterKey() { return 'orgFilter__' + cfAccountKey; }
function cfWatermarkKey(orgId) { return 'syncWatermark__' + cfAccountKey + '__' + String(orgId || 'active'); }
function cfImportedKey() { return 'importedShares__' + cfAccountKey; }
function cfImportQueueKey() { return 'importQueue__' + cfAccountKey; }

async function cfInitAccount() {
  cfAccountKey = await cfResolveAccountKey();
  console.log('[CONTENT] account key:', cfAccountKey);
  try {
    await chrome.runtime.sendMessage({ action: 'setAccount', accountKey: cfAccountKey });
  } catch (e) {
    console.log('[CONTENT] setAccount failed:', e.message);
  }
}
