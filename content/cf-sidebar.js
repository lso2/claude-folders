// Claude Folders content script - the sidebar row and the folders flyout panel

// Locate a real sidebar row to clone for styling. Claude's sidebar no longer
// contains a <nav> element at all, so anchoring on one left the row unbuilt;
// the rows are now plain anchors carrying data-row and data-row-main-button in a
// flex column, which is what we match on. Position and label keep us on the
// sidebar rows rather than a conversation row or a header link, and cloning a
// live row means the folder entry inherits whatever styling ships that week.
const CF_NAV_LABELS = ['projects', 'artifacts', 'customize', 'scheduled', 'chats', 'recents', 'starred'];

// Accounts present in the stored chats, with a count each, so the panel can offer a
// filter without needing the network. Chats imported before accounts were recorded
// are grouped under one entry rather than dropped.
const CF_UNTAGGED_ORG = '__untagged__';

function cfOrgsInData() {
  const byId = new Map();
  folders.forEach(f => (f.chats || []).forEach(chat => {
    const id = chat.orgId || CF_UNTAGGED_ORG;
    const name = chat.orgName || 'Unlabelled';
    const entry = byId.get(id) || { id, name, count: 0 };
    entry.count++;
    byId.set(id, entry);
  }));
  return Array.from(byId.values()).sort((a, b) => b.count - a.count);
}

function cfChatPassesFilter(chat) {
  if (!cfOrgFilter.size) return true;
  return cfOrgFilter.has((chat && chat.orgId) || CF_UNTAGGED_ORG);
}

function cfVisibleChats(folder) {
  return (folder && folder.chats ? folder.chats : []).filter(cfChatPassesFilter);
}

function cfShortOrgName(name) {
  return String(name || 'Account').replace(/'s Organization$/i, '').trim();
}

// The filter row, shown only when the stored chats span more than one account
function cfRenderOrgFilter() {
  const orgs = cfOrgsInData();
  if (orgs.length < 2) return '';
  const chip = (id, label, count, on) =>
    `<button class="cf-org-chip${on ? ' cf-org-chip-on' : ''}" data-org-id="${cfEscapeHtml(id)}">${cfEscapeHtml(label)}<span class="cf-org-chip-count">${count}</span></button>`;
  const total = orgs.reduce((sum, o) => sum + o.count, 0);
  return `
    <div class="cf-org-filter">
      ${chip('', 'All accounts', total, cfOrgFilter.size === 0)}
      ${orgs.map(o => chip(o.id, cfShortOrgName(o.name), o.count, cfOrgFilter.has(o.id))).join('')}
    </div>
  `;
}

async function cfLoadOrgFilter() {
  try {
    const key = cfOrgFilterKey();
    const stored = await chrome.storage.local.get(key);
    cfOrgFilter = new Set(Array.isArray(stored[key]) ? stored[key] : []);
  } catch (e) {
    cfOrgFilter = new Set();
  }
}

async function cfSaveOrgFilter() {
  try {
    await chrome.storage.local.set({ [cfOrgFilterKey()]: Array.from(cfOrgFilter) });
  } catch (e) {
    console.log('[CONTENT] Could not store the account filter:', e.message);
  }
}

// A chat from another organization on this login gets a short label. Chats from the
// organization this tab is signed into carry none, so the common case stays clean.
function cfOrgTag(chat) {
  if (!chat || !chat.orgId || !chat.orgName) return '';
  if (cfActiveOrgId && chat.orgId === cfActiveOrgId) return '';
  const short = String(chat.orgName).replace(/'s Organization$/i, '').trim().slice(0, 18);
  return `<span class="folder-chat-org" title="${cfEscapeHtml(chat.orgName)}">${cfEscapeHtml(short)}</span>`;
}

function cfRowLabel(el) {
  return cfStripGlyphs(el && el.textContent).toLowerCase();
}

// A sidebar row sits in the left column and is wide enough to be a full row,
// which rules out header and toolbar links that share the anchor markup.
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

// Build a folder icon sized to fill Claude's icon box (so it lines up with the
// other nav icons and stays visible when the sidebar collapses).
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

// Convert the cloned "Projects" link into "Folders" while keeping Claude's exact
// inner structure (the translate offset, the sized icon box, the truncating label
// span). That structure is what makes the row align with the other nav items and
// collapse with the sidebar, so we only swap two things: the icon-font glyph
// (<span data-cds="Icon">) becomes a folder SVG, and the label text becomes
// "Folders". After the glyph is gone, the first remaining text node is the label,
// so we rename it and blank any leftover copies to avoid a duplicate "Projects".
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

function toggleFoldersPanel() {
  let panel = document.querySelector('.claude-folders-panel');
  
  if (panel) {
    panel.remove();
    panelExpanded = false;
    document.removeEventListener('click', closePanelOnOutsideClick);
    return;
  }
  
  // Create panel
  panel = document.createElement('div');
  panel.className = 'claude-folders-panel';
  panelExpanded = true;
  
  renderPanelContent(panel);
  document.body.appendChild(panel);

  // The saved account filter is read on open, then the panel redraws with it
  cfLoadOrgFilter().then(() => {
    if (cfOrgFilter.size && document.body.contains(panel)) renderPanelContent(panel);
  });

  // Anchor the flyout to the real sidebar edge so it sits flush whether the
  // sidebar is expanded or collapsed (the CSS default assumes the expanded width).
  // Measured from our own row's row container, because there is no nav element
  // to measure any more.
  const ownRow = document.querySelector('a[data-folders-link="true"]');
  const sidebarEl = ownRow ? (ownRow.closest('aside') || ownRow.closest('[data-sidebar]') || ownRow.parentElement) : null;
  if (sidebarEl) {
    const right = Math.round(sidebarEl.getBoundingClientRect().right);
    if (right > 0) panel.style.left = right + 'px';
  }

  // Close on outside click (delay to avoid immediate close)
  setTimeout(() => {
    document.addEventListener('click', closePanelOnOutsideClick);
  }, 100);
}

function closePanelOnOutsideClick(e) {
  const panel = document.querySelector('.claude-folders-panel');
  const foldersLink = document.querySelector('a[data-folders-link="true"]'); // The Folders nav link
  if (panel && !panel.contains(e.target) && !foldersLink?.contains(e.target)) {
    panel.remove();
    panelExpanded = false;
    document.removeEventListener('click', closePanelOnOutsideClick);
  }
}

function renderPanelContent(panel) {
  let html = `
    <div class="folders-panel-header">
      <h2>Folders</h2>
      <div class="panel-actions">
        <button class="panel-btn analytics-btn" title="Analytics">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 8L8 3" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 8L12 10" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="panel-organizer-btn open-organizer-btn" title="Open full organizer">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2v12h12V8h-2v4H4V4h4V2H2zm8 0v2h2.6L7.3 9.3l1.4 1.4L14 5.4V8h2V2h-6z"/>
          </svg>
          Organizer
        </button>
        <button class="panel-btn toggle-setup-btn" title="Show/Hide Setup" style="display:none;">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
          </svg>
        </button>
        <button class="panel-btn close-btn" title="Close">×</button>
      </div>
    </div>
    
    <!-- Analytics View (hidden by default) -->
    <div class="panel-analytics-view" style="display:none;">
      <div class="panel-analytics-header">
        <button class="panel-btn back-to-folders-btn">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M10 2L4 8l6 6" stroke="currentColor" stroke-width="2" fill="none"/>
          </svg>
          Back
        </button>
      </div>
      <div class="panel-donut-container">
        <canvas id="panelDonutChart" width="180" height="180"></canvas>
      </div>
      <div id="panelAnalyticsLegend" class="panel-analytics-legend"></div>
      <div id="panelAnalyticsStats" class="panel-analytics-stats"></div>
    </div>
    
    <!-- Folders View -->
    <div class="panel-folders-view">
    <div class="folders-panel-actions">
      <button class="ask-claude-btn" id="askClaudeBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
        </svg>
        Ask Claude to Organize
      </button>
      <button class="apply-categories-btn" id="applyCategoriesBtn">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
        </svg>
        Apply Claude's Response
      </button>
    </div>
    ${cfRenderOrgFilter()}
    <div class="folders-panel-content">
  `;
  
  if (folders.length === 0) {
    const emptyHint = cfLegacyAvailable
      ? 'Previously organized data was found. Run a Sync on this account to restore it.'
      : 'Use Import or Ask Claude to add chats';
    html += `<div class="folders-empty"><p>No folders yet</p><p style="font-size:12px;color:#888;">${cfEscapeHtml(emptyHint)}</p></div>`;
  } else {
    const byCategory = {};
    folders.forEach(f => {
      if (!byCategory[f.category]) byCategory[f.category] = [];
      byCategory[f.category].push(f);
    });
    
    Object.keys(byCategory).forEach(cat => {
      html += `<div class="folder-category-group"><div class="folder-category-header">${cfEscapeHtml(cat)}</div>`;
      byCategory[cat].forEach(folder => {
        const shown = cfVisibleChats(folder);
        const chatCount = shown.length;
        html += `
          <div class="folder-panel-item" data-folder-id="${cfEscapeHtml(folder.id)}">
            <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor" style="margin-right:8px;opacity:0.6;flex-shrink:0;">
              <path d="M2 3h6l2 2h6v10H2V3z"/>
            </svg>
            <span class="folder-panel-name">${cfEscapeHtml(folder.name)}</span>
            <span class="folder-panel-count">${chatCount}</span>
            <button class="folder-export-btn" data-folder-id="${cfEscapeHtml(folder.id)}" title="Export folder to markdown">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>
            <svg class="folder-expand-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
              <path d="M6 4l4 4-4 4"/>
            </svg>
          </div>
          <div class="folder-chats-list" data-folder-id="${cfEscapeHtml(folder.id)}" data-shown="10" style="display:none;">
            ${shown.slice(0, 10).map(chat => `
              <a href="${cfSafeUrl(chat.url)}" target="_blank" class="folder-chat-link" title="${cfEscapeHtml(chat.title)}">
                ${cfOrgTag(chat)}${cfEscapeHtml(chat.title)}
              </a>
            `).join('')}
            ${chatCount > 10 ? `<button class="folder-load-more-btn" data-folder-id="${cfEscapeHtml(folder.id)}">Load +${chatCount - 10} more</button>` : ''}
          </div>
        `;
      });
      html += `</div>`;
    });
  }
  
  html += `</div></div>`;
  panel.innerHTML = html;
  
  panel.querySelectorAll('.cf-org-chip').forEach(chip => {
    chip.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = chip.getAttribute('data-org-id') || '';
      if (!id) cfOrgFilter.clear();
      else if (cfOrgFilter.has(id)) cfOrgFilter.delete(id);
      else cfOrgFilter.add(id);
      await cfSaveOrgFilter();
      renderPanelContent(panel);
    });
  });

  panel.querySelector('.close-btn')?.addEventListener('click', () => {
    panel.remove();
    panelExpanded = false;
    document.removeEventListener('click', closePanelOnOutsideClick);
  });
  
  panel.querySelector('.open-organizer-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openOrganizer' });
  });
  
  // Analytics toggle
  panel.querySelector('.analytics-btn')?.addEventListener('click', () => {
    const foldersView = panel.querySelector('.panel-folders-view');
    const analyticsView = panel.querySelector('.panel-analytics-view');
    if (analyticsView.style.display === 'none') {
      foldersView.style.display = 'none';
      analyticsView.style.display = 'block';
      renderPanelAnalytics(panel);
    } else {
      analyticsView.style.display = 'none';
      foldersView.style.display = 'block';
    }
  });
  
  panel.querySelector('.back-to-folders-btn')?.addEventListener('click', () => {
    panel.querySelector('.panel-analytics-view').style.display = 'none';
    panel.querySelector('.panel-folders-view').style.display = 'block';
  });
  
  panel.querySelector('#askClaudeBtn')?.addEventListener('click', () => {
    askClaudeToOrganize();
  });
  
  panel.querySelector('#applyCategoriesBtn')?.addEventListener('click', () => {
    showApplyCategoriesModal();
  });
  
  // Setup actions (Ask Claude / Apply) stay open by default. The gear is always
  // available and only collapses the row when the user wants more list room.
  const toggleSetupBtn = panel.querySelector('.toggle-setup-btn');
  const panelActions = panel.querySelector('.folders-panel-actions');

  if (toggleSetupBtn) toggleSetupBtn.style.display = 'flex';
  if (panelActions) panelActions.style.display = 'block';

  toggleSetupBtn?.addEventListener('click', () => {
    if (panelActions) {
      panelActions.style.display = panelActions.style.display === 'none' ? 'block' : 'none';
    }
  });
  
  // Folder export buttons
  panel.querySelectorAll('.folder-export-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderId = btn.dataset.folderId;
      handleFolderExport(folderId, btn);
    });
  });
  
  // Folder click - expand/collapse chats inline
  panel.querySelectorAll('.folder-panel-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderId = item.dataset.folderId;
      const chatsList = panel.querySelector(`.folder-chats-list[data-folder-id="${folderId}"]`);
      const icon = item.querySelector('.folder-expand-icon');
      
      if (chatsList.style.display === 'none') {
        // Collapse all others first
        panel.querySelectorAll('.folder-chats-list').forEach(list => list.style.display = 'none');
        panel.querySelectorAll('.folder-expand-icon').forEach(i => i.style.transform = '');
        // Expand this one
        chatsList.style.display = 'block';
        icon.style.transform = 'rotate(90deg)';
      } else {
        chatsList.style.display = 'none';
        icon.style.transform = '';
      }
    });
  });
  
  // Load more button click - use named function for re-attachment
  function handleLoadMore(e) {
    e.stopPropagation();
    const btn = e.target;
    const folderId = btn.dataset.folderId;
    const chatsList = panel.querySelector(`.folder-chats-list[data-folder-id="${folderId}"]`);
    const folder = folders.find(f => f.id === folderId);
    if (!folder || !folder.chats) return;
    
    const currentShown = parseInt(chatsList.dataset.shown) || 10;
    const newShown = currentShown + 20;
    chatsList.dataset.shown = newShown;
    
    // Rebuild the chat list
    const visible = cfVisibleChats(folder);
    const remaining = visible.length - newShown;
    let html = visible.slice(0, newShown).map(chat => `
      <a href="${cfSafeUrl(chat.url)}" target="_blank" class="folder-chat-link" title="${cfEscapeHtml(chat.title)}">
        ${cfOrgTag(chat)}${cfEscapeHtml(chat.title)}
      </a>
    `).join('');

    if (remaining > 0) {
      html += `<button class="folder-load-more-btn" data-folder-id="${cfEscapeHtml(folderId)}">Load +${remaining} more</button>`;
    }
    
    chatsList.innerHTML = html;
    
    // Re-attach load more handler if button still exists
    const newBtn = chatsList.querySelector('.folder-load-more-btn');
    if (newBtn) {
      newBtn.addEventListener('click', handleLoadMore);
    }
  }
  
  panel.querySelectorAll('.folder-load-more-btn').forEach(btn => {
    btn.addEventListener('click', handleLoadMore);
  });
}
