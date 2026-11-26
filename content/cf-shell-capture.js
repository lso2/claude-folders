// content/cf-shell-capture.js
// Records Claude's sidebar rows, sections and account menu for the organizer page to draw.
// Globals: CF_SHELL_MENU_MAX_AGE_MS, cfShellSaved, cfShellLastInput, cfGlyphImage, cfShellLabel, cfShellRow, cfShellBadge,
//          cfShellSectionKind, cfShellSectionClosed, cfShellSectionRow, cfShellSectionRows, cfShellAppsLink, cfReadSidebarShell,
//          cfReadMenuItems, cfSaveShell, cfCaptureSidebar, cfCaptureOpenMenu, cfSilentMenuCapture, cfStartShellCapture
// Depends on: content/cf-text.js (cfStripGlyphs, cfIsGlyphOnly), content/cf-account.js (cfShellKey, cfAccountReady)
// Notes: docs/notes/content/cf-shell-capture.js.md

// A stored account menu older than this is read again on the next page load
const CF_SHELL_MENU_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
// The record as last stored, so an unchanged sidebar is not written again
let cfShellSaved = null;
// Time of the person's last key or pointer press on the page
let cfShellLastInput = 0;

// The icon glyph drawn in white on a transparent 40px square, so the organizer can tint it.
// Claude's icons are private-use characters of its icon font.
function cfGlyphImage(iconEl) {
  if (!iconEl) return null;
  const glyph = Array.from(iconEl.textContent || '').filter(ch => {
    const code = ch.codePointAt(0);
    return (code >= 0xe000 && code <= 0xf8ff) || code >= 0xf0000;
  }).join('');
  if (!glyph) return null;
  try {
    const style = getComputedStyle(iconEl);
    const canvas = document.createElement('canvas');
    canvas.width = 40;
    canvas.height = 40;
    const ctx = canvas.getContext('2d');
    ctx.font = `${style.fontWeight} 32px ${style.fontFamily}`;
    const m = ctx.measureText(glyph);
    const w = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const h = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (!(w > 0 && h > 0)) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillText(glyph, 20 - w / 2 + m.actualBoundingBoxLeft, 20 - h / 2 + m.actualBoundingBoxAscent);
    return canvas.toDataURL('image/png');
  } catch (e) {
    console.log('[SHELL] Icon not drawn:', e.message);
    return null;
  }
}

// The label is the own text of the first element in the row that holds text, without the text of its child
// elements. A badge drawn after the label in an element of its own, such as Upgrade beside Code on a free
// plan, is left out whether it follows the label's element or sits inside it.
function cfShellLabel(copy) {
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode();
  while (node && cfIsGlyphOnly(node.textContent)) node = walker.nextNode();
  if (!node) return '';
  const holder = node.parentElement || copy;
  return cfStripGlyphs(Array.from(holder.childNodes).filter(n => n.nodeType === Node.TEXT_NODE).map(n => n.textContent).join(' '));
}

// label, href and icon of one sidebar row or menu item. Keyboard hints are left out of the label.
// iconAfter is true for an icon placed after the label, such as the external link arrow in Learn more.
function cfShellRow(el) {
  const copy = el.cloneNode(true);
  copy.querySelectorAll('kbd, [data-cds="Icon"]').forEach(k => k.remove());
  const href = el.getAttribute('href');
  const iconEl = el.querySelector('[data-cds="Icon"]');
  let iconAfter = false;
  if (iconEl) {
    const before = document.createRange();
    before.setStart(el, 0);
    before.setEndBefore(iconEl);
    iconAfter = cfStripGlyphs(before.toString()).trim() !== '';
  }
  return {
    label: cfShellLabel(copy).replace(/(\s*\+\s*)+$/, '').trim(),
    href: href && href !== '#' ? href : null,
    target: el.getAttribute('target') || null,
    testid: el.getAttribute('data-testid') || null,
    icon: cfGlyphImage(iconEl),
    iconAfter
  };
}

// A short word drawn beside a row's label in an element of its own, such as Beta beside Meetings. Keyboard hints
// (kbd) are not badges.
function cfShellBadge(el, label) {
  const words = Array.from(el.querySelectorAll('span'))
    .filter(span => !span.querySelector('*') && !span.closest('kbd'))
    .map(span => cfStripGlyphs(span.textContent).trim())
    .filter(text => /^[A-Za-z]{2,12}$/.test(text) && text !== label);
  return words[0] || null;
}

// The kind of section a heading starts (measured 2026-11-26): Pinned is in [data-pinned-list], each group in
// [data-group-list="<group id>"], and Ungrouped in [data-group-list=""]. A heading in neither starts a list of recent
// chats.
function cfShellSectionKind(h3) {
  const box = h3.closest('[data-pinned-list], [data-group-list]');
  if (!box) return 'recents';
  if (box.hasAttribute('data-pinned-list')) return 'pinned';
  return box.getAttribute('data-group-list') ? 'group' : 'ungrouped';
}

// True when the toggle beside the heading (measured: button[data-group-toggle] in [data-sidebar-group-label]) is closed
function cfShellSectionClosed(h3) {
  const label = h3.closest('[data-sidebar-group-label]') || h3.parentElement;
  const toggle = label && label.querySelector('[aria-expanded]');
  return !!toggle && toggle.getAttribute('aria-expanded') === 'false';
}

// One row of a section: the row's fields with its label from span[data-row-label], depth 1 for a row inside a
// project's block after the project's own row (its sessions and its View all), and viewAll for View all. View all
// has no link of its own and opens the project.
function cfShellSectionRow(el) {
  const row = cfShellRow(el);
  const label = el.querySelector('[data-row-label]');
  if (label) row.label = cfStripGlyphs(label.textContent).trim();
  const block = el.closest('[data-row-key]');
  const own = block && block.querySelector('[data-row-main-button]');
  row.depth = own && own !== el ? 1 : 0;
  row.viewAll = /^view all$/i.test(row.label);
  if (row.viewAll && !row.href && own) row.href = own.getAttribute('href');
  return row;
}

// The rows of a section's box, collapsed ones too. A View all button of the whole section (Ungrouped's) opens the
// Chats page (measured: claude.ai/chats).
function cfShellSectionRows(box) {
  const rows = Array.from(box.querySelectorAll('[data-row-main-button]')).map(cfShellSectionRow).filter(row => row.label);
  const more = Array.from(box.querySelectorAll('button:not([data-row-main-button])')).find(b => /^view all$/i.test(cfStripGlyphs(b.textContent).trim()));
  if (more) rows.push({ label: 'View all', href: '/chats', icon: null, iconAfter: false, depth: 0, viewAll: true });
  return rows;
}

// The link beside the account button (measured 2026-11-26: Get apps and extensions, /downloads, in the footer that
// holds the button's wrapper): the first link in the nearest ancestor of the button holding one. An ancestor holding
// the sidebar's rows is past the footer, and the search stops there.
function cfShellAppsLink(button) {
  for (let node = button && button.parentElement; node && node.tagName !== 'ASIDE'; node = node.parentElement) {
    if (node.querySelector('[data-row-main-button]')) return null;
    const link = Array.from(node.querySelectorAll('a[href]')).find(a => !button.contains(a));
    if (link) return link;
  }
  return null;
}

// Rows marked data-row-nav are the navigation. Each h3 starts a section with its kind and closed state. A trailing
// section of recent chats is drawn by the organizer from its own data under the same label.
function cfReadSidebarShell() {
  const aside = document.querySelector('aside[aria-label="Sidebar"]') ||
    (document.querySelector('[data-testid="user-menu-button"]') || document.body).closest('aside');
  if (!aside) return null;
  // A navigation row, or the row element inside its wrapper, carries data-row-nav (measured 2026-11-01)
  const isNav = (el) => el.hasAttribute('data-row-nav') || !!(el.parentElement && el.parentElement.hasAttribute('data-row-nav'));
  const rows = Array.from(aside.querySelectorAll('[data-row-main-button]'));
  const nav = [];
  rows.filter(isNav).forEach(el => {
    if (el.hasAttribute('data-folders-link')) {
      nav.push({ ours: true, label: 'Folders' });
      return;
    }
    if (el.hasAttribute('data-groups-link')) {
      nav.push({ ours: 'groups', label: 'Groups' });
      return;
    }
    const row = cfShellRow(el);
    if (row.label) nav.push({ ...row, badge: cfShellBadge(el, row.label), kind: el.tagName === 'A' ? 'link' : 'button' });
  });
  if (!nav.length) return null;
  // A section in a box takes the box's rows. A section with no box takes the rows after its heading.
  const headings = Array.from(aside.querySelectorAll('h3'));
  const sections = headings.map(h3 => ({ label: cfStripGlyphs(h3.textContent).trim(), kind: cfShellSectionKind(h3), closed: cfShellSectionClosed(h3), rows: [] }));
  headings.forEach((h3, i) => {
    const box = h3.closest('[data-pinned-list], [data-group-list]');
    if (box) sections[i].rows = cfShellSectionRows(box);
  });
  rows.filter(el => !isNav(el) && el.tagName === 'A' && !el.closest('[data-pinned-list], [data-group-list]')).forEach(el => {
    let index = -1;
    headings.forEach((h3, i) => { if (h3.compareDocumentPosition(el) & Node.DOCUMENT_POSITION_FOLLOWING) index = i; });
    if (index < 0 || sections[index].kind !== 'recents') return;
    const row = cfShellSectionRow(el);
    if (row.label) sections[index].rows.push(row);
  });
  const last = sections[sections.length - 1];
  const recents = last && last.kind === 'recents' ? last : null;
  const home = aside.querySelector('a[data-sidebar-home-link]') || aside.querySelector('a[href="/new"]:not([data-row-main-button])');
  const button = document.querySelector('[data-testid="user-menu-button"]');
  const leaves = button ? Array.from(button.querySelectorAll('span')).filter(span => !span.querySelector('span')) : [];
  const parts = leaves
    .map(span => cfStripGlyphs(span.textContent))
    .filter(text => text && !/^[·•|,\-–—/]+$/.test(text));
  const initial = parts.length && Array.from(parts[0]).length === 1 ? parts.shift() : '';
  // The initial is drawn in a colored circle (measured 2026-11-26: the initial's own span has the color)
  const circle = initial ? leaves.find(span => cfStripGlyphs(span.textContent) === initial) : null;
  const color = circle ? getComputedStyle(circle).backgroundColor : '';
  const apps = cfShellAppsLink(button);
  return {
    brand: home ? cfStripGlyphs(home.textContent) : null,
    nav,
    sections: sections.filter(section => section.label && section !== recents),
    recentsLabel: recents ? recents.label : null,
    account: {
      initial: initial || (parts[0] ? Array.from(parts[0])[0].toUpperCase() : ''),
      name: parts[0] || null,
      team: parts[1] || null,
      color: color && color !== 'rgba(0, 0, 0, 0)' ? color : null
    },
    apps: apps ? { label: apps.getAttribute('aria-label') || cfStripGlyphs(apps.textContent).trim(), href: apps.getAttribute('href'), icon: cfGlyphImage(apps.querySelector('[data-cds="Icon"]')) } : null
  };
}

// Items of one open menu, in order, with separators. Items opening a submenu are marked.
function cfReadMenuItems(menu) {
  const items = [];
  let header = null;
  menu.querySelectorAll('[role="menuitem"], [role="menuitemradio"], [role="separator"]').forEach(el => {
    if (el.parentElement.closest('[role="menuitem"]')) return;
    if (el.getAttribute('role') === 'separator') {
      if (items.length && items[items.length - 1].kind !== 'separator') items.push({ kind: 'separator' });
      return;
    }
    const row = cfShellRow(el);
    if (row.label) items.push({ kind: 'item', ...row, submenu: el.getAttribute('aria-haspopup') === 'menu' ? [] : null });
  });
  const first = menu.firstElementChild;
  if (first && !first.matches('[role="menuitem"], [role="separator"]') && !first.querySelector('[role="menuitem"]')) {
    header = cfStripGlyphs(first.textContent) || null;
  }
  return { header, items };
}

async function cfSaveShell(patch) {
  try {
    await cfAccountReady;
    const key = cfShellKey();
    const stored = (await chrome.storage.local.get(key))[key] || {};
    const next = { ...stored, ...patch };
    const same = JSON.stringify({ ...next, capturedAt: 0, menuCapturedAt: 0 }) === JSON.stringify({ ...stored, capturedAt: 0, menuCapturedAt: 0 });
    cfShellSaved = next;
    if (same) return;
    await chrome.storage.local.set({ [key]: { ...next, capturedAt: new Date().toISOString() } });
  } catch (e) {
    console.log('[SHELL] Not stored:', e.message);
  }
}

async function cfCaptureSidebar() {
  const shell = cfReadSidebarShell();
  if (shell) await cfSaveShell(shell);
}

// The account menu is read whenever it is open: when the person opens it, and in cfSilentMenuCapture
async function cfCaptureOpenMenu() {
  const button = document.querySelector('[data-testid="user-menu-button"]');
  if (!button || button.getAttribute('aria-expanded') !== 'true') return null;
  const menus = Array.from(document.querySelectorAll('[role="menu"]'));
  const main = menus.find(m => m.querySelector('[data-testid="user-menu-settings"]')) || menus[0];
  if (!main) return null;
  const read = cfReadMenuItems(main);
  const previous = (cfShellSaved && cfShellSaved.menu) || { items: [] };
  const openSub = menus.find(m => m !== main);
  read.items.forEach(item => {
    if (!item.submenu) return;
    const parent = Array.from(main.querySelectorAll('[aria-haspopup="menu"]')).find(el => cfShellRow(el).label === item.label);
    if (openSub && parent && parent.getAttribute('aria-expanded') === 'true') item.submenu = cfReadMenuItems(openSub).items;
    else item.submenu = ((previous.items || []).find(p => p.label === item.label) || {}).submenu || [];
  });
  await cfSaveShell({ menu: read, menuCapturedAt: new Date().toISOString() });
  return read;
}

// Opens the account menu once, hidden, to read it when no recent copy is stored. It runs only while the
// person is not typing or clicking, and focus goes back where it was.
async function cfSilentMenuCapture() {
  const stored = cfShellSaved && cfShellSaved.menu && cfShellSaved.menuCapturedAt;
  if (stored && Date.now() - Date.parse(cfShellSaved.menuCapturedAt) < CF_SHELL_MENU_MAX_AGE_MS) return 'stored';
  const button = document.querySelector('[data-testid="user-menu-button"]');
  const active = document.activeElement;
  const editing = active && (active.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName));
  if (!button || editing || document.visibilityState !== 'visible' || document.querySelector('[role="menu"]') ||
      Date.now() - cfShellLastInput < 3000) return 'busy';
  const wait = (ms) => new Promise(r => setTimeout(r, ms));
  document.documentElement.classList.add('cf-shell-capturing');
  try {
    const r = button.getBoundingClientRect();
    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0, buttons: 1, clientX: r.left + 10, clientY: r.top + 10 }));
    await wait(350);
    const main = document.querySelector('[role="menu"]');
    if (!main) return 'not opened';
    for (const parent of Array.from(main.querySelectorAll('[aria-haspopup="menu"]'))) {
      parent.focus();
      parent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', code: 'ArrowRight', bubbles: true, cancelable: true }));
      await wait(350);
      await cfCaptureOpenMenu();
      parent.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', code: 'ArrowLeft', bubbles: true, cancelable: true }));
      await wait(200);
    }
    await cfCaptureOpenMenu();
    return 'read';
  } finally {
    for (let i = 0; i < 4 && document.querySelector('[role="menu"]'); i++) {
      const open = document.querySelectorAll('[role="menu"]');
      open[open.length - 1].dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', bubbles: true, cancelable: true }));
      await wait(250);
    }
    document.documentElement.classList.remove('cf-shell-capturing');
    if (active && active !== document.body && document.contains(active)) active.focus();
    else if (document.activeElement === button) button.blur();
  }
}

// The sidebar is read after each burst of changes to it. The menu is read whenever it opens.
function cfStartShellCapture() {
  const style = document.createElement('style');
  style.textContent = 'html.cf-shell-capturing [role="menu"]{opacity:0 !important;pointer-events:none !important}';
  document.documentElement.appendChild(style);
  ['keydown', 'pointerdown'].forEach(type => document.addEventListener(type, (e) => { if (e.isTrusted) cfShellLastInput = Date.now(); }, true));

  let sidebarTimer = null;
  let menuTimer = null;
  new MutationObserver((mutations) => {
    if (mutations.some(m => m.target.closest && m.target.closest('[role="menu"]')) || document.querySelector('[role="menu"]')) {
      clearTimeout(menuTimer);
      menuTimer = setTimeout(() => cfCaptureOpenMenu().catch(e => console.log('[SHELL] Menu not read:', e.message)), 150);
    }
    clearTimeout(sidebarTimer);
    sidebarTimer = setTimeout(() => cfCaptureSidebar(), 2000);
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded'] });

  cfAccountReady.then(async () => {
    const key = cfShellKey();
    cfShellSaved = (await chrome.storage.local.get(key))[key] || null;
    await cfCaptureSidebar();
    for (let attempt = 0; attempt < 6; attempt++) {
      await new Promise(r => setTimeout(r, attempt ? 10000 : 4000));
      const outcome = await cfSilentMenuCapture().catch(e => `failed: ${e.message}`);
      if (outcome !== 'busy') {
        if (outcome !== 'stored') console.log('[SHELL] Account menu:', outcome);
        return;
      }
    }
  });
}
