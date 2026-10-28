// content/cf-sidebar.js
// Adds the Folders row to Claude's sidebar by cloning one of Claude's own rows.
// Globals: CF_NAV_LABELS, cfRowLabel, cfIsSidebarRow, findSidebarTemplateLink, buildFolderSvg,
//          renderFoldersLinkInner, injectSidebar
// Depends on: content/cf-state.js, content/cf-text.js, content/cf-panel.js (toggleFoldersPanel)
// Notes: docs/notes/content/cf-sidebar.js.md

// Rows matched by label in this order; the clone inherits Claude's current row styling
const CF_NAV_LABELS = ['projects', 'artifacts', 'customize', 'scheduled', 'chats', 'recents', 'starred'];

function cfRowLabel(el) {
  return cfStripGlyphs(el && el.textContent).toLowerCase();
}

// A sidebar row is in the left column and spans the full row width
function cfIsSidebarRow(el) {
  const href = el.getAttribute('href') || '';
  if (/\/chat\//.test(href)) return false;
  if (el.hasAttribute('data-folders-link')) return false;
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

// Sized to fill Claude's icon box, matching the other row icons in both sidebar widths
function buildFolderSvg() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '2');
  svg.setAttribute('width', '20');
  svg.setAttribute('height', '20');
  svg.style.cssText = 'width:20px;height:20px;flex:0 0 auto;';
  svg.innerHTML = `<path d="${CF_FOLDER_ICON_PATH}"/>`;
  return svg;
}

// Keeps the clone's inner structure and swaps two things: the icon glyph becomes the
// folder SVG and the first label text node becomes "Folders"
function renderFoldersLinkInner(link) {
  const glyph = link.querySelector('[data-cds="Icon"]');
  if (glyph) {
    glyph.replaceWith(buildFolderSvg());
  } else if (!link.querySelector('svg')) {
    link.insertBefore(buildFolderSvg(), link.firstChild);
  }

  const walker = document.createTreeWalker(link, NodeFilter.SHOW_TEXT, null);
  const textNodes = [];
  let node;
  while ((node = walker.nextNode())) {
    if (!cfIsGlyphOnly(node.textContent)) textNodes.push(node);
  }
  if (textNodes.length > 0) {
    textNodes[0].textContent = 'Folders';
    for (let i = 1; i < textNodes.length; i++) textNodes[i].textContent = '';
  }
}

function injectSidebar() {
  // Check if our link still exists (React may have removed it)
  if (document.querySelector('a[data-folders-link="true"]')) return;

  const templateLink = findSidebarTemplateLink();

  if (!templateLink || !templateLink.parentNode) {
    // Keep trying while the sidebar mounts, and stop before the timers pile up.
    // The mutation observer in observeUrlChanges retries after this gives up, so
    // a slow sidebar still gets its row without an unbounded timer chain.
    if (sidebarInjectRetries++ < 40) {
      setTimeout(injectSidebar, 500);
    } else {
      console.log('[CONTENT] No sidebar row found to clone yet');
    }
    return;
  }
  sidebarInjectRetries = 0;

  const foldersLink = templateLink.cloneNode(true);
  foldersLink.setAttribute('data-folders-link', 'true');
  foldersLink.setAttribute('aria-label', 'Folders');
  foldersLink.removeAttribute('aria-current');
  foldersLink.removeAttribute('aria-keyshortcuts');
  // Claude's keyboard navigation owns every data-roving-item, so the clone drops
  // that hook and carries its own tab stop instead of joining a list it is not
  // registered in.
  foldersLink.removeAttribute('data-roving-item');
  foldersLink.setAttribute('tabindex', '0');
  foldersLink.classList.remove('active');
  renderFoldersLinkInner(foldersLink);

  foldersLink.href = '#';
  foldersLink.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    toggleFoldersPanel();
  });

  templateLink.parentNode.insertBefore(foldersLink, templateLink.nextSibling);
  sidebarInjected = true;
  console.log('[CONTENT] Sidebar row injected after', cfRowLabel(templateLink) || 'template');
}
