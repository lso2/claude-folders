// content/cf-shell-replay.js
// Runs a sidebar row or account menu item the organizer page asked for in the tab it opened.
// Globals: cfFindByLabel, cfRunShellRequest
// Depends on: content/cf-shell-capture.js (cfShellRow), content/cf-shell-address.js (cfLearnShellAddress),
//             content/cf-composer.js (cfWaitFor)
// Notes: docs/notes/content/cf-shell-replay.js.md

function cfFindByLabel(elements, label) {
  return Array.from(elements).find(el => cfShellRow(el).label === label) || null;
}

// request: the tab's request of kind 'shell' (content/cf-tab-request.js). It is { kind: 'nav', label }
// for a sidebar button, or { kind: 'menu', label, testid, parent } for an account menu item.
async function cfRunShellRequest(request) {
  const ready = await cfWaitFor(() => document.querySelector('[data-testid="user-menu-button"]'), 20000, 250);
  if (!ready) {
    console.log('[SHELL] The sidebar did not appear within 20 seconds; nothing was run');
    return;
  }
  if (request.kind === 'nav') {
    const row = cfFindByLabel(document.querySelectorAll('aside [data-row-main-button]'), request.label);
    if (!row) {
      console.log('[SHELL] No sidebar row is labelled', request.label);
      return;
    }
    const before = location.href;
    row.click();
    await cfLearnShellAddress(request, before);
    return;
  }
  if (request.kind !== 'menu') return;
  const button = document.querySelector('[data-testid="user-menu-button"]');
  const r = button.getBoundingClientRect();
  button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, clientX: r.left + 10, clientY: r.top + 10 }));
  const main = await cfWaitFor(() => document.querySelector('[role="menu"]'), 3000, 100);
  if (!main) {
    console.log('[SHELL] The account menu did not open');
    return;
  }
  let scope = main;
  if (request.parent) {
    const parent = cfFindByLabel(main.querySelectorAll('[aria-haspopup="menu"]'), request.parent);
    if (!parent) {
      console.log('[SHELL] No account menu item is labelled', request.parent);
      return;
    }
    parent.focus();
    parent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));
    scope = await cfWaitFor(() => Array.from(document.querySelectorAll('[role="menu"]')).find(m => m !== main), 3000, 100);
    if (!scope) {
      console.log('[SHELL] The', request.parent, 'submenu did not open');
      return;
    }
  }
  const items = scope.querySelectorAll('[role="menuitem"], [role="menuitemradio"]');
  const item = (request.testid && scope.querySelector(`[data-testid="${CSS.escape(request.testid)}"]`)) || cfFindByLabel(items, request.label);
  if (!item) {
    console.log('[SHELL] No account menu item is labelled', request.label);
    return;
  }
  const before = location.href;
  item.click();
  await cfLearnShellAddress(request, before);
}
