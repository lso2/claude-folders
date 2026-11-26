// content/cf-sidebar.js
// Adds the Folders and Groups rows to Claude's sidebar by cloning one of Claude's own rows.
// Globals: CF_NAV_LABELS, CF_GROUPS_ICON, CF_SIDEBAR_ROWS, cfRowLabel, cfIsSidebarRow, findSidebarTemplateLink,
//          buildRowSvg, renderSidebarRowInner, cfSidebarRowsMissing, cfCloneSidebarRow, injectSidebar
// Depends on: content/cf-state.js (CF_FOLDER_ICON_PATH), content/cf-text.js, content/cf-panel.js (toggleFoldersPanel),
//             content/cf-groups-panel.js (toggleGroupsPanel, groupsPanelOpen), content/cf-row-hover.js (cfSetSidebarRowOpen)
// Notes: docs/notes/content/cf-sidebar.js.md

// Rows matched by label in this order; the clone inherits Claude's current row styling
const CF_NAV_LABELS = ['projects', 'artifacts', 'customize', 'scheduled', 'chats', 'recents', 'starred'];

// Layers icon: Feather Icons 4.29 (https://feathericons.com, MIT)
const CF_GROUPS_ICON = '<g stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/>' +
  '<polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></g>';

// The extension's rows, in their order after the template row. open tells whether the row's panel is open.
const CF_SIDEBAR_ROWS = [
  { attr: 'data-folders-link', label: 'Folders', icon: () => `<path d="${CF_FOLDER_ICON_PATH}"/>`, toggle: () => toggleFoldersPanel(), open: () => panelExpanded },
  { attr: 'data-groups-link', label: 'Groups', icon: () => CF_GROUPS_ICON, toggle: () => toggleGroupsPanel(), open: () => groupsPanelOpen }
];

function cfRowLabel(el) {
  return cfStripGlyphs(el && el.textContent).toLowerCase();
}

// A sidebar row is in the left column and spans the full row width
function cfIsSidebarRow(el) {
  const href = el.getAttribute('href') || '';
  if (/\/chat\//.test(href)) return false;
  if (CF_SIDEBAR_ROWS.some(row => el.hasAttribute(row.attr))) return false;
  const r = el.getBoundingClientRect();
  return r.width > 120 && r.left < 400;
}

function findSidebarTemplateLink() {
  const rows = Array.from(document.querySelectorAll('a[data-row][data-row-main-button], a[data-row]'))
    .filter(cfIsSidebarRow);

  // Prefer a row that carries an icon glyph, since the folder icon replaces it
  const withIcon = rows.filter(a => a.querySelector('[data-cds="Icon"]') || a.querySelector('svg'));
  const pool = withIcon.length ? withIcon : rows;

  for (const label of CF_NAV_LABELS) {
    const hit = pool.find(a => cfRowLabel(a) === label);
    if (hit) return hit;
  }
  if (pool.length) return pool[0];

  // Sidebar builds before the nav element was dropped
  const nav = document.querySelector('nav');
  if (!nav) return null;
  const links = Array.from(nav.querySelectorAll('a')).filter(cfIsSidebarRow);
  return links.find(a => a.querySelector('[data-cds="Icon"]') || a.querySelector('svg')) || links[0] || null;
}

// 17px with a 1.5px margin in Claude's 20px icon box. The folder and layers glyphs fill more of their box than
// Claude's icons, and at 17px they match the size of the icons around them. Also used by the header buttons.
function buildRowSvg(inner) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('width', '17');
  svg.setAttribute('height', '17');
  svg.style.cssText = 'width:17px;height:17px;margin:1.5px;flex:0 0 auto;';
  svg.innerHTML = inner;
  return svg;
}

// Keeps the clone's inner structure and swaps two things: the icon glyph becomes the row's SVG and the
// first label text node becomes the row's label
function renderSidebarRowInner(link, row) {
  const glyph = link.querySelector('[data-cds="Icon"]');
  if (glyph) {
    glyph.replaceWith(buildRowSvg(row.icon()));
  } else if (!link.querySelector('svg')) {
    link.insertBefore(buildRowSvg(row.icon()), link.firstChild);
  }

  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (!cfIsGlyphOnly(node.textContent)) textNodes.push(node);
  }
  if (textNodes.length > 0) {
    textNodes[0].textContent = row.label;
    for (let i = 1; i < textNodes.length; i++) textNodes[i].textContent = '';
  }
}

// True when React removed one of the extension's rows, or they were never added
function cfSidebarRowsMissing() {
  return CF_SIDEBAR_ROWS.some(row => !document.querySelector(`a[${row.attr}="true"]`));
}

function cfCloneSidebarRow(templateLink, row) {
  const link = templateLink.cloneNode(true);
  link.setAttribute(row.attr, 'true');
  link.setAttribute('aria-label', row.label);
  link.removeAttribute('aria-current');
  link.removeAttribute('aria-keyshortcuts');
  // Claude's keyboard navigation owns every data-roving-item, so the clone drops
  // that hook and carries its own tab stop instead of joining a list it is not
  // registered in.
  link.removeAttribute('data-roving-item');
  link.setAttribute('tabindex', '0');
  link.classList.remove('active');
  renderSidebarRowInner(link, row);
  link.href = '#';
  link.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    row.toggle();
  });
  return link;
}

function injectSidebar() {
  if (!cfSidebarRowsMissing()) return;

  const templateLink = findSidebarTemplateLink();

  if (!templateLink || !templateLink.parentNode) {
    // Keep trying while the sidebar mounts, and stop before the timers pile up.
    // The mutation observer in observeUrlChanges retries after this gives up, so
    // a slow sidebar still gets its rows without an unbounded timer chain.
    if (sidebarInjectRetries++ < 40) {
      setTimeout(injectSidebar, 500);
    } else {
      console.log('[CONTENT] No sidebar row found to clone yet');
    }
    return;
  }
  sidebarInjectRetries = 0;

  // Each row is placed after the one before it: Folders after the template, Groups after Folders
  let after = templateLink;
  for (const row of CF_SIDEBAR_ROWS) {
    let link = document.querySelector(`a[${row.attr}="true"]`);
    if (!link) {
      link = cfCloneSidebarRow(templateLink, row);
      after.parentNode.insertBefore(link, after.nextSibling);
      // Claude can redraw its sidebar while a panel is open, and the new row shows the open look too
      link.setAttribute('aria-expanded', 'false');
      if (row.open()) cfSetSidebarRowOpen(row.attr, true);
      console.log('[CONTENT] Sidebar row', row.label, 'injected after', cfRowLabel(after) || 'template');
    }
    after = link;
  }
  sidebarInjected = true;
}
