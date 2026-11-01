// content/cf-shell-address.js
// Records the address a Claude sidebar button or account menu item opens, for the organizer to link to.
// Globals: CF_SHELL_ADDRESS_WAIT_MS, cfLearnShellAddress, cfShellClickRequest, cfWatchShellClicks
// Depends on: lib/shell-address.js (cfShellItemKey), content/cf-shell-capture.js (cfShellRow, cfSaveShell),
//             content/cf-account.js (cfShellKey, cfAccountReady)
// Notes: docs/notes/content/cf-shell-address.js.md

// Settings changed the address 147 ms after the click in the measurement; an item opening only a dialog changes nothing
const CF_SHELL_ADDRESS_WAIT_MS = 2000;

// Compares the address before the click with the address up to 2 seconds later and stores the change
async function cfLearnShellAddress(request, before) {
  const deadline = Date.now() + CF_SHELL_ADDRESS_WAIT_MS;
  while (location.href === before && Date.now() < deadline) await new Promise(r => setTimeout(r, 100));
  if (location.href === before) return null;
  const was = new URL(before);
  const now = new URL(location.href);
  const samePage = now.pathname === was.pathname && now.search === was.search;
  if (samePage && !now.hash) return null;
  const address = samePage ? { hash: now.hash } : { path: now.pathname + now.search + now.hash };
  const key = cfShellItemKey(request);
  try {
    await cfAccountReady;
    const stored = (await chrome.storage.local.get(cfShellKey()))[cfShellKey()] || {};
    await cfSaveShell({ addresses: { ...(stored.addresses || {}), [key]: address } });
    console.log('[SHELL] Address of', key, 'recorded:', address.hash || address.path);
  } catch (e) {
    console.log('[SHELL] Address of', key, 'not recorded:', e.message);
  }
  return address;
}

// The request naming a clicked sidebar button or account menu item, or null for anything else.
// A submenu item names the item it opened from.
function cfShellClickRequest(target) {
  const row = target.closest('aside [data-row-main-button]');
  if (row) return row.tagName === 'A' ? null : { kind: 'nav', label: cfShellRow(row).label };
  const item = target.closest('[role="menuitem"]');
  if (!item || item.tagName === 'A' || item.getAttribute('aria-haspopup') === 'menu') return null;
  const menus = Array.from(document.querySelectorAll('[role="menu"]'));
  const main = menus.find(m => m.querySelector('[data-testid="user-menu-settings"]'));
  if (!main) return null;
  const read = cfShellRow(item);
  if (item.closest('[role="menu"]') === main) return { kind: 'menu', label: read.label, testid: read.testid, parent: null };
  const opener = main.querySelector('[aria-haspopup="menu"][aria-expanded="true"]');
  return opener ? { kind: 'menu', label: read.label, testid: read.testid, parent: cfShellRow(opener).label } : null;
}

// The person's own clicks on claude.ai record addresses too
function cfWatchShellClicks() {
  document.addEventListener('click', (e) => {
    if (!e.isTrusted || !(e.target instanceof Element)) return;
    const request = cfShellClickRequest(e.target);
    if (request && request.label) cfLearnShellAddress(request, location.href);
  }, true);
}
