// content/cf-panel.js
// Renders the folders flyout panel beside Claude's sidebar and wires its controls.
// Globals: toggleFoldersPanel, closePanelOnOutsideClick, cfCoworkTag, renderPanelContent
// Depends on: lib/cowork-api.js, content/cf-state.js, content/cf-text.js, content/cf-org-filter.js,
//             content/cf-organize.js, content/cf-export-run.js
// Notes: docs/notes/content/cf-panel.js.md

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

  // The flyout's left edge is measured from the sidebar holding the Folders row
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

// Rows for Cowork sessions carry a Cowork label
function cfCoworkTag(chat) {
  return chat && isCoworkSessionId(chat.id) ? '<span class="folder-chat-org">Cowork</span>' : '';
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
                ${cfCoworkTag(chat)}${cfOrgTag(chat)}${cfEscapeHtml(chat.title)}
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

  // The setup actions start open; the gear collapses them for more list room
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
        ${cfCoworkTag(chat)}${cfOrgTag(chat)}${cfEscapeHtml(chat.title)}
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
