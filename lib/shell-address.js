// lib/shell-address.js
// Names a Claude sidebar row or account menu item, and turns the address recorded for it into a link.
// Globals: CF_SHELL_ADDRESS_PAGE, cfShellItemKey, cfShellAddressUrl
// Notes: docs/notes/lib/shell-address.js.md

// The page a row or item without a link is run on, and the page an address of a hash alone is opened on.
// Measured 2026-10-31: loading /recents#settings/general opens Claude's Settings.
const CF_SHELL_ADDRESS_PAGE = 'https://claude.ai/recents';

// request: { kind: 'nav', label } for a sidebar button, { kind: 'menu', label, testid, parent } for a menu item
function cfShellItemKey(request) {
  if (request.kind === 'nav') return 'nav:' + request.label;
  return 'menu:' + (request.testid || ((request.parent ? request.parent + ' > ' : '') + request.label));
}

// address: { hash } when the item changed only the hash of the page it was clicked on, { path } for a new page
function cfShellAddressUrl(address) {
  if (!address) return null;
  if (address.path) return 'https://claude.ai' + address.path;
  if (address.hash) return CF_SHELL_ADDRESS_PAGE + address.hash;
  return null;
}
