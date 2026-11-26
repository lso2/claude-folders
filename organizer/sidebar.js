// organizer/sidebar.js
// Draws the organizer's sidebar from Claude's sidebar as last read on claude.ai, with the account menu,
// the drag divider and the collapse toggle.
// Globals: organizerShell, organizerLayout, organizerSectionsClosed, SECTION_CARET, FOLDERS_ROW_ICON, GROUPS_ROW_ICON,
//          ORGANIZER_SIDEBAR_IDS, claudeUrl, shellIcon, shellLinkAttrs, runShellItem, loadOrganizerShell, sectionClosed,
//          sectionRowHtml, sectionHtml, renderNavRows, showGroupFolders, renderSidebarShell, toggleSidebarSection,
//          renderUserProfile, renderAppsLink, renderMenuItems, renderAccountMenu, setAccountMenuOpen, loadSidebarLayout,
//          applySidebarLayout, setupSidebar
// Depends on: lib/storage-keys.js (CLAUDE_SHELL_KEY_PREFIX, ORGANIZER_LAYOUT_KEY, ORGANIZER_SECTIONS_KEY), lib/shell-address.js,
//             organizer/app.js (esc, metadata, folders, currentCategory), organizer/folders.js (renderCategoryFilters,
//             renderFolderList), organizer/view-controls.js (showFolderListView), lib/sidebar-layout.js
// Notes: docs/notes/organizer/sidebar.js.md

// { brand, nav, sections, recentsLabel, account, apps, menu } stored by content/cf-shell-capture.js
let organizerShell = null;
// { width, collapsed }
let organizerLayout = { width: SIDEBAR_DEFAULT_WIDTH, collapsed: false };
// Sections opened or closed in the organizer, by name (ORGANIZER_SECTIONS_KEY). A section with no choice here is drawn
// as it was on claude.ai.
let organizerSectionsClosed = {};
// The caret after a section's name, drawn like the caret of Claude's sidebar sections: 14px and pointing down for an
// open section. sidebar.css turns it a quarter left for a closed one.
const SECTION_CARET = '<svg class="section-caret" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6l3.5 3.5 3.5-3.5"/></svg>';
// Folder and layers icons: Feather Icons 4.29 (https://feathericons.com, MIT), 17px as on the rows on claude.ai
const FOLDERS_ROW_ICON = '<svg class="row-svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/></svg>';
const GROUPS_ROW_ICON = '<svg class="row-svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/>' +
  '<polyline points="2 12 12 17 22 12"/></svg>';

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
    const stored = await chrome.storage.local.get(['activeAccountKey', ORGANIZER_SECTIONS_KEY]);
    organizerSectionsClosed = stored[ORGANIZER_SECTIONS_KEY] || {};
    const key = CLAUDE_SHELL_KEY_PREFIX + stored.activeAccountKey;
    organizerShell = (await chrome.storage.local.get(key))[key] || null;
  } catch (e) {
    console.log('[ORGANIZER] Claude sidebar not read:', e.message);
  }
}

// A section's choice in the organizer, else its state on claude.ai
function sectionClosed(sec) {
  return Object.prototype.hasOwnProperty.call(organizerSectionsClosed, sec.label) ? !!organizerSectionsClosed[sec.label] : !!sec.closed;
}

// A row of a section. A row with no icon of its own gets a ring as on claude.ai, and View all gets neither.
// Depth 1 is a project's session or View all, indented under the project.
function sectionRowHtml(row) {
  const lead = row.icon ? shellIcon(row.icon) : row.viewAll ? '' : '<span class="section-dot" aria-hidden="true"></span>';
  const kind = (row.depth ? ' depth-1' : '') + (row.viewAll ? ' view-all' : '');
  return `<a ${shellLinkAttrs(row.href, { kind: 'nav', label: row.label })} class="nav-item section-row${kind}" title="${esc(row.label)}">${lead}<span class="nav-label">${esc(row.label)}</span></a>`;
}

// A section of Claude's sidebar: its name with the caret after it, and its rows, open or closed
function sectionHtml(sec) {
  const closed = sectionClosed(sec);
  return `
    <div class="sidebar-section" data-section="${esc(sec.label)}">
      <button type="button" class="section-toggle" aria-expanded="${!closed}"><span class="section-name">${esc(sec.label)}</span>${SECTION_CARET}</button>
      <div class="section-rows"${closed ? ' hidden' : ''}>${sec.rows.map(sectionRowHtml).join('')}</div>
    </div>`;
}

// Claude's rows in Claude's order, with their badges. The Folders row is this page. The Groups row shows the folders of
// Claude's groups, and is drawn when such folders exist (lib/group-folders.js gives each one a groupId).
function renderNavRows(shell) {
  const nav = document.getElementById('sidebarNav');
  const rows = Array.isArray(shell.nav) && shell.nav.length ? shell.nav : [{ ours: true, label: 'Folders' }];
  const groupFolders = folders.some(f => f.groupId);
  nav.innerHTML = rows.map(row => {
    if (row.ours === 'groups') {
      return groupFolders ? `<a href="#" class="nav-item" id="groupsLink" title="${esc(row.label)}">${GROUPS_ROW_ICON}<span class="nav-label">${esc(row.label)}</span></a>` : '';
    }
    if (row.ours) {
      return `<a href="#" class="nav-item active" id="foldersLink" title="${esc(row.label)}">${FOLDERS_ROW_ICON}<span class="nav-label">${esc(row.label)}</span></a>`;
    }
    const badge = row.badge ? `<span class="nav-badge">${esc(row.badge)}</span>` : '';
    return `<a ${shellLinkAttrs(row.href, { kind: 'nav', label: row.label })} class="nav-item" title="${esc(row.label)}">
      ${shellIcon(row.icon)}<span class="nav-label">${esc(row.label)}</span>${badge}</a>`;
  }).join('');
  document.getElementById('foldersLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    showGroupFolders(false);
  });
  document.getElementById('groupsLink')?.addEventListener('click', (e) => {
    e.preventDefault();
    showGroupFolders(true);
  });
}

// The folder list with every category (Folders), or with the category of Claude's groups (Groups). The row clicked is
// highlighted.
function showGroupFolders(groups) {
  if (typeof showFolderListView === 'function') showFolderListView();
  const groupFolder = groups ? folders.find(f => f.groupId) : null;
  currentCategory = groupFolder ? groupFolder.category : 'all';
  renderCategoryFilters();
  renderFolderList();
  document.getElementById('foldersLink')?.classList.toggle('active', !groupFolder);
  document.getElementById('groupsLink')?.classList.toggle('active', !!groupFolder);
}

// The brand, the rows and the sections as last read on claude.ai. A trailing list of recent chats is drawn from the
// organizer's own data (organizer/chats.js renderRecentChats). A capture ending with Claude's groups has no such list,
// and the organizer's list is hidden then. With no capture yet, the list is drawn with no name.
function renderSidebarShell() {
  const shell = organizerShell || {};
  const brand = document.getElementById('brandName');
  if (brand) brand.textContent = shell.brand || '';
  renderNavRows(shell);
  // Pinned, a group or Ungrouped is drawn with no rows too, as claude.ai draws it
  const captured = (shell.sections || []).filter(sec => Array.isArray(sec.rows) && (sec.rows.length || (sec.kind && sec.kind !== 'recents')));
  document.getElementById('sidebarSections').innerHTML = captured.map(sectionHtml).join('');
  const recents = document.getElementById('recentsSection');
  const toggle = document.getElementById('recentsToggle');
  const closed = !!shell.recentsLabel && sectionClosed({ label: shell.recentsLabel, closed: false });
  recents.hidden = !shell.recentsLabel && captured.length > 0;
  recents.dataset.section = shell.recentsLabel || '';
  document.getElementById('recentsLabel').textContent = shell.recentsLabel || '';
  toggle.hidden = !shell.recentsLabel;
  toggle.setAttribute('aria-expanded', String(!closed));
  document.getElementById('recentChats').hidden = closed;
  renderUserProfile();
  renderAppsLink(shell.apps);
  renderAccountMenu();
}

// Opens or closes a section and stores the choice for the next visit
function toggleSidebarSection(section) {
  const toggle = section.querySelector('.section-toggle');
  const open = toggle.getAttribute('aria-expanded') !== 'true';
  toggle.setAttribute('aria-expanded', String(open));
  section.querySelector('.section-rows').hidden = !open;
  organizerSectionsClosed[section.dataset.section] = !open;
  chrome.storage.local.set({ [ORGANIZER_SECTIONS_KEY]: organizerSectionsClosed })
    .catch(e => console.log('[ORGANIZER] Section choice not stored:', e.message));
}

// The name and team read from Claude's account button, else the account recorded in the folder data
function renderUserProfile() {
  const shellAccount = (organizerShell && organizerShell.account) || {};
  const recorded = (metadata && metadata.account) || {};
  const name = shellAccount.name || metadata.userName || recorded.name || recorded.email || '';
  const team = shellAccount.team || metadata.userTeam || '';
  const avatar = document.getElementById('userAvatar');
  avatar.textContent = shellAccount.initial || metadata.userInitial || (name ? Array.from(name)[0].toUpperCase() : '');
  // The circle's color on claude.ai, stored as rgb() by content/cf-shell-capture.js
  avatar.style.backgroundColor = /^rgba?\([\d.,\s]+\)$/.test(shellAccount.color || '') ? shellAccount.color : '';
  document.getElementById('userName').textContent = name;
  // Before the first claude.ai visit no account is known, and the row is hidden
  document.getElementById('userProfile').hidden = !name && !avatar.textContent;
  const teamEl = document.getElementById('userTeam');
  teamEl.textContent = team;
  teamEl.hidden = !team;
}

// The link beside the account button on claude.ai, such as Get apps and extensions
function renderAppsLink(apps) {
  const link = document.getElementById('appsLink');
  if (!link) return;
  link.hidden = !(apps && apps.href);
  if (link.hidden) return;
  link.href = claudeUrl(apps.href);
  link.title = apps.label || '';
  link.setAttribute('aria-label', apps.label || '');
  link.innerHTML = shellIcon(apps.icon);
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
  // A section's caret opens or closes it. Rows and menu items with no address recorded yet run in a claude.ai tab.
  document.getElementById('sidebar').addEventListener('click', (e) => {
    const toggle = e.target.closest('.section-toggle');
    if (toggle) {
      toggleSidebarSection(toggle.closest('.sidebar-section'));
      return;
    }
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
