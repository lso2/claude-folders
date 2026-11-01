// organizer/sidebar.js
// Draws the organizer's sidebar from Claude's sidebar as last read on claude.ai, with the account menu,
// the drag divider and the collapse toggle.
// Globals: organizerShell, organizerLayout, ORGANIZER_SIDEBAR_IDS, claudeUrl, shellIcon, shellLinkAttrs, runShellItem,
//          loadOrganizerShell, renderSidebarShell, renderUserProfile, renderAccountMenu, setAccountMenuOpen,
//          loadSidebarLayout, applySidebarLayout, setupSidebar
// Depends on: lib/storage-keys.js (CLAUDE_SHELL_KEY_PREFIX, ORGANIZER_LAYOUT_KEY), lib/shell-address.js,
//             organizer/app.js (esc, metadata), lib/sidebar-layout.js (the width, collapse and drag edge)
// Notes: docs/notes/organizer/sidebar.js.md

// { brand, nav, sections, recentsLabel, account, menu } stored by content/cf-shell-capture.js
let organizerShell = null;
// { width, collapsed }
let organizerLayout = { width: SIDEBAR_DEFAULT_WIDTH, collapsed: false };

// Claude's own links are site paths; the organizer page opens them on claude.ai
function claudeUrl(href) {
  return /^https?:\/\//i.test(href) ? href : 'https://claude.ai' + (href.startsWith('/') ? href : '/' + href);
}


function shellIcon(icon) {
  return icon
    ? `<span class="shell-icon" style="--icon:url('${esc(icon)}')"></span>`
    : '<span class="shell-icon shell-icon-blank"></span>';
}

// A row or item with a link, or with an address recorded on claude.ai (content/cf-shell-address.js), opens it.
// One without either carries its request, and a click runs it in a new claude.ai tab (runShellItem).
function shellLinkAttrs(href, request) {
  const recorded = organizerShell && organizerShell.addresses && organizerShell.addresses[cfShellItemKey(request)];
  const url = href ? claudeUrl(href) : cfShellAddressUrl(recorded);
  if (url) return `href="${esc(url)}" target="_blank" rel="noopener"`;
  return `href="${esc(CF_SHELL_ADDRESS_PAGE)}" data-shell-run="${esc(JSON.stringify(request))}"`;
}

// The background opens claude.ai and the page runs the request there (content/cf-shell-replay.js)
async function runShellItem(request) {
  try {
    await chrome.runtime.sendMessage({ action: 'runShellItem', request });
  } catch (e) {
    console.log('[ORGANIZER] Claude tab for', request.label, 'not opened:', e.message);
  }
}

async function loadOrganizerShell() {
  try {
    const stored = await chrome.storage.local.get('activeAccountKey');
    const key = CLAUDE_SHELL_KEY_PREFIX + stored.activeAccountKey;
    organizerShell = (await chrome.storage.local.get(key))[key] || null;
  } catch (e) {
    console.log('[ORGANIZER] Claude sidebar not read:', e.message);
  }
}

// Rows come in Claude's order. The Folders row is this page.
function renderSidebarShell() {
  const shell = organizerShell || {};
  const brand = document.getElementById('brandName');
  if (brand) brand.textContent = shell.brand || '';
  const nav = document.getElementById('sidebarNav');
  const rows = Array.isArray(shell.nav) && shell.nav.length ? shell.nav : [{ ours: true, label: 'Folders' }];
  nav.innerHTML = rows.map(row => {
    if (row.ours) {
      return `<a href="#" class="nav-item active" id="foldersLink" title="${esc(row.label)}">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/></svg>
        <span class="nav-label">${esc(row.label)}</span></a>`;
    }
    return `<a ${shellLinkAttrs(row.href, { kind: 'nav', label: row.label })} class="nav-item" title="${esc(row.label)}">
      ${shellIcon(row.icon)}<span class="nav-label">${esc(row.label)}</span></a>`;
  }).join('');
  document.getElementById('foldersLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    if (typeof showFolderListView === 'function') showFolderListView();
  });

  const sections = document.getElementById('sidebarSections');
  sections.innerHTML = (shell.sections || []).filter(sec => sec.rows && sec.rows.length).map(sec => `
    <div class="sidebar-section">
      <div class="section-label">${esc(sec.label)}</div>
      ${sec.rows.map(row => `<a ${shellLinkAttrs(row.href, { kind: 'nav', label: row.label })} class="nav-item" title="${esc(row.label)}">
        ${shellIcon(row.icon)}<span class="nav-label">${esc(row.label)}</span></a>`).join('')}
    </div>`).join('');

  const recentsLabel = document.getElementById('recentsLabel');
  recentsLabel.textContent = shell.recentsLabel || '';
  recentsLabel.hidden = !shell.recentsLabel;
  renderUserProfile();
  renderAccountMenu();
}

// The name and team read from Claude's account button, else the account recorded in the folder data
function renderUserProfile() {
  const shellAccount = (organizerShell && organizerShell.account) || {};
  const recorded = (metadata && metadata.account) || {};
  const name = shellAccount.name || metadata.userName || recorded.name || recorded.email || '';
  const team = shellAccount.team || metadata.userTeam || '';
  document.getElementById('userAvatar').textContent = shellAccount.initial || metadata.userInitial || (name ? Array.from(name)[0].toUpperCase() : '');
  document.getElementById('userName').textContent = name;
  const teamEl = document.getElementById('userTeam');
  teamEl.textContent = team;
  teamEl.hidden = !team;
}

function renderMenuItems(items, parentLabel) {
  return (items || []).map(item => {
    if (item.kind === 'separator') return '<div class="menu-sep" role="separator"></div>';
    if (item.submenu) {
      return `<div class="menu-item has-sub" role="menuitem" aria-haspopup="menu" aria-expanded="false" tabindex="0">
        ${shellIcon(item.icon)}<span>${esc(item.label)}</span>
        <svg class="menu-chevron" width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 4l4 4-4 4"/></svg>
        <div class="submenu" role="menu">${renderMenuItems(item.submenu, item.label)}</div></div>`;
    }
    const request = { kind: 'menu', label: item.label, testid: item.testid || null, parent: parentLabel || null };
    // An icon claude.ai places after the label, such as the external link arrow, is drawn after it here too
    const lead = item.iconAfter ? '<span class="shell-icon shell-icon-blank"></span>' : shellIcon(item.icon);
    const trail = item.iconAfter ? shellIcon(item.icon).replace('class="shell-icon"', 'class="shell-icon shell-icon-after"') : '';
    return `<a class="menu-item" role="menuitem" ${shellLinkAttrs(item.href, request)}>
      ${lead}<span>${esc(item.label)}</span>${trail}</a>`;
  }).join('');
}

// Claude's account menu as last read on claude.ai, under the login's email
function renderAccountMenu() {
  const menu = document.getElementById('accountMenu');
  const read = (organizerShell && organizerShell.menu) || { items: [] };
  const email = read.header || (metadata && metadata.account && metadata.account.email) || '';
  menu.innerHTML = (email ? `<div class="menu-header">${esc(email)}</div>` : '') + renderMenuItems(read.items, null);
  menu.querySelectorAll('.menu-item.has-sub').forEach(item => {
    const open = (state) => {
      item.classList.toggle('open', state);
      item.setAttribute('aria-expanded', String(state));
    };
    item.addEventListener('mouseenter', () => open(true));
    item.addEventListener('mouseleave', () => open(false));
    item.addEventListener('click', (e) => { if (e.target === item || !e.target.closest('.submenu')) open(!item.classList.contains('open')); });
    item.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'Enter') { open(true); item.querySelector('.submenu .menu-item')?.focus(); }
      if (e.key === 'ArrowLeft') { open(false); item.focus(); }
    });
  });
  menu.querySelectorAll('a.menu-item').forEach(a => a.addEventListener('click', () => setAccountMenuOpen(false)));
}

function setAccountMenuOpen(open) {
  const menu = document.getElementById('accountMenu');
  const button = document.getElementById('userProfile');
  menu.hidden = !open;
  button.setAttribute('aria-expanded', String(open));
  if (open) menu.querySelector('.menu-item')?.focus();
}

// The width and collapsed state are shared with the settings page's sidebar code (lib/sidebar-layout.js)
const ORGANIZER_SIDEBAR_IDS = { sidebar: 'sidebar', toggle: 'sidebarToggle', resizer: 'sidebarResizer' };

async function loadSidebarLayout() {
  organizerLayout = await cfReadSidebarLayout(ORGANIZER_LAYOUT_KEY);
}

function applySidebarLayout() {
  cfApplySidebarLayout(organizerLayout, ORGANIZER_SIDEBAR_IDS);
}

function setupSidebar() {
  const button = document.getElementById('userProfile');
  button.addEventListener('click', (e) => {
    e.stopPropagation();
    setAccountMenuOpen(button.getAttribute('aria-expanded') !== 'true');
  });
  document.addEventListener('click', (e) => {
    if (!document.getElementById('accountArea').contains(e.target)) setAccountMenuOpen(false);
  });
  // Rows and menu items with no address recorded yet
  document.getElementById('sidebar').addEventListener('click', (e) => {
    const link = e.target.closest('[data-shell-run]');
    if (!link) return;
    e.preventDefault();
    setAccountMenuOpen(false);
    runShellItem(JSON.parse(link.dataset.shellRun));
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && button.getAttribute('aria-expanded') === 'true') {
      setAccountMenuOpen(false);
      button.focus();
    }
  });

  cfSetupSidebarFrame(organizerLayout, ORGANIZER_LAYOUT_KEY, ORGANIZER_SIDEBAR_IDS);

  // A claude.ai page stores the sidebar again whenever it changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (Object.keys(changes).some(k => k.startsWith(CLAUDE_SHELL_KEY_PREFIX))) {
      loadOrganizerShell().then(renderSidebarShell);
    }
  });
}
