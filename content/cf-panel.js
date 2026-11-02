// content/cf-panel.js
// Renders the folders flyout panel beside Claude's sidebar and wires its controls.
// Globals: cfSetupStepsOpen, cfApplySetupSteps, toggleFoldersPanel, cfClosePanel, closePanelOnOutsideClick,
//          renderPanelContent
// Depends on: lib/storage-keys.js (SETUP_STEPS_OPEN_KEY), content/cf-state.js, content/cf-text.js, content/cf-account-view.js, content/cf-folder-pane.js,
//             content/cf-organize.js, content/cf-organize-modal.js, content/cf-export-run.js, content/cf-migrate-button.js,
//             content/cf-row-hover.js (cfSetFoldersRowOpen), lib/update-notice.js (cfAskForUpdate, cfRenderUpdateNotices, cfWireUpdateCheck)
// Notes: docs/notes/content/cf-panel.js.md

// The square-check's stored choice: false keeps the organize actions collapsed. The panel is drawn again on
// every data change, so the choice is held here, read once and kept current from storage.
let cfSetupStepsOpen = true;
chrome.storage.local.get(SETUP_STEPS_OPEN_KEY)
  .then(stored => {
    if (typeof stored[SETUP_STEPS_OPEN_KEY] === 'boolean') cfSetupStepsOpen = stored[SETUP_STEPS_OPEN_KEY];
    cfApplySetupSteps();
  })
  .catch(e => console.log('[PANEL] Organize steps choice not read:', e.message));
// A click in the popup or another tab applies here too
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes[SETUP_STEPS_OPEN_KEY] || typeof changes[SETUP_STEPS_OPEN_KEY].newValue !== 'boolean') return;
  cfSetupStepsOpen = changes[SETUP_STEPS_OPEN_KEY].newValue;
  cfApplySetupSteps();
});

// Shows or collapses the organize actions of the panel on the page by the stored choice
function cfApplySetupSteps() {
  const actions = document.querySelector('.folders-panel-actions');
  const btn = document.querySelector('.toggle-setup-btn');
  if (actions) actions.style.display = cfSetupStepsOpen ? 'block' : 'none';
  if (btn) btn.setAttribute('aria-expanded', String(cfSetupStepsOpen));
}

// Clicking the Folders row opens the panel, and clicking it again closes it
function toggleFoldersPanel() {
  let panel = document.querySelector('.claude-folders-panel');

  if (panel) {
    cfClosePanel();
    return;
  }
  
  // Create panel
  panel = document.createElement('div');
  panel.className = 'claude-folders-panel';
  panelExpanded = true;
  
  renderPanelContent(panel);
  document.body.appendChild(panel);
  cfSetFoldersRowOpen(true);
  cfAskForUpdate(false);

  // The stored account view and the other accounts are read on open, then the panel redraws with them
  Promise.all([cfLoadAccountView(), cfLoadAccountList()]).then(() => {
    if (document.body.contains(panel)) renderPanelContent(panel);
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

// Removes the panel with its folder pane and stops listening for outside clicks
function cfClosePanel() {
  const panel = document.querySelector('.claude-folders-panel');
  if (panel) {
    cfCloseFolderPane(panel);
    panel.remove();
  }
  panelExpanded = false;
  cfSetFoldersRowOpen(false);
  document.removeEventListener('click', closePanelOnOutsideClick);
}

// The event path is fixed when the click starts. A control the click removed from the panel is still in it.
// A click in a dialog opened over the panel (.cf-confirm-overlay) leaves the panel open.
function closePanelOnOutsideClick(e) {
  const panel = document.querySelector('.claude-folders-panel');
  const foldersLink = document.querySelector('a[data-folders-link="true"]'); // The Folders nav link
  const path = e.composedPath();
  if (!panel || path.includes(panel) || (foldersLink && path.includes(foldersLink))) return;
  if (path.some(el => el instanceof Element && el.classList.contains('cf-confirm-overlay'))) return;
  cfClosePanel();
}

// Header order and icons follow the popup's: the square-check shows and hides the organize actions, the gear opens Settings.
// Gear and bolt: Font Awesome Free 6.5.2 (https://fontawesome.com/license/free, CC BY 4.0)
function renderPanelContent(panel) {
  let html = `
    <div class="folders-panel-header">
      <h2>Folders</h2>
      <div class="panel-actions">
        <button class="panel-organizer-btn open-organizer-btn" title="Open full organizer">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M2 2v12h12V8h-2v4H4V4h4V2H2zm8 0v2h2.6L7.3 9.3l1.4 1.4L14 5.4V8h2V2h-6z"/>
          </svg>
          Organizer
        </button>
        <button class="panel-btn analytics-btn" title="Analytics" aria-label="Analytics">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor">
            <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 8L8 3" stroke="currentColor" stroke-width="1.5"/>
            <path d="M8 8L12 10" stroke="currentColor" stroke-width="1.5"/>
          </svg>
        </button>
        <button class="panel-btn toggle-setup-btn" title="Organize with Claude" aria-label="Organize with Claude" aria-expanded="true">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
        </button>
        <button class="panel-btn settings-btn" title="Settings" aria-label="Settings">
          <svg width="14" height="14" viewBox="0 0 512 512" fill="currentColor" aria-hidden="true"><path d="M495.9 166.6c3.2 8.7 .5 18.4-6.4 24.6l-43.3 39.4c1.1 8.3 1.7 16.8 1.7 25.4s-.6 17.1-1.7 25.4l43.3 39.4c6.9 6.2 9.6 15.9 6.4 24.6c-4.4 11.9-9.7 23.3-15.8 34.3l-4.7 8.1c-6.6 11-14 21.4-22.1 31.2c-5.9 7.2-15.7 9.6-24.5 6.8l-55.7-17.7c-13.4 10.3-28.2 18.9-44 25.4l-12.5 57.1c-2 9.1-9 16.3-18.2 17.8c-13.8 2.3-28 3.5-42.5 3.5s-28.7-1.2-42.5-3.5c-9.2-1.5-16.2-8.7-18.2-17.8l-12.5-57.1c-15.8-6.5-30.6-15.1-44-25.4L83.1 425.9c-8.8 2.8-18.6 .3-24.5-6.8c-8.1-9.8-15.5-20.2-22.1-31.2l-4.7-8.1c-6.1-11-11.4-22.4-15.8-34.3c-3.2-8.7-.5-18.4 6.4-24.6l43.3-39.4C64.6 273.1 64 264.6 64 256s.6-17.1 1.7-25.4L22.4 191.2c-6.9-6.2-9.6-15.9-6.4-24.6c4.4-11.9 9.7-23.3 15.8-34.3l4.7-8.1c6.6-11 14-21.4 22.1-31.2c5.9-7.2 15.7-9.6 24.5-6.8l55.7 17.7c13.4-10.3 28.2-18.9 44-25.4l12.5-57.1c2-9.1 9-16.3 18.2-17.8C227.3 1.2 241.5 0 256 0s28.7 1.2 42.5 3.5c9.2 1.5 16.2 8.7 18.2 17.8l12.5 57.1c15.8 6.5 30.6 15.1 44 25.4l55.7-17.7c8.8-2.8 18.6-.3 24.5 6.8c8.1 9.8 15.5 20.2 22.1 31.2l4.7 8.1c6.1 11 11.4 22.4 15.8 34.3zM256 336a80 80 0 1 0 0-160 80 80 0 1 0 0 160z"/></svg>
        </button>
      </div>
    </div>
    
    <!-- The notice for a newer version on GitHub (lib/update-notice.js) -->
    <div class="cf-update-slot"></div>

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
      <button class="organize-auto-btn" id="organizeAutoBtn" title="The chat titles are sent to Claude in a new claude.ai tab, and Claude's answer is shown in a preview to apply">
        <svg width="12" height="14" viewBox="0 0 448 512" fill="currentColor" aria-hidden="true"><path d="M349.4 44.6c5.9-13.7 1.5-29.7-10.6-38.5s-28.6-8-39.9 1.8l-256 224c-10 8.8-13.6 22.9-8.9 35.3S50.7 288 64 288H175.5L98.6 467.4c-5.9 13.7-1.5 29.7 10.6 38.5s28.6 8 39.9-1.8l256-224c10-8.8 13.6-22.9 8.9-35.3s-16.6-20.7-30-20.7H272.5L349.4 44.6z"/></svg>
        Organize in One Click
      </button>
      <div class="organize-steps-label">Or in 2 steps</div>
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
    ${cfRenderAccountSelect()}
    ${cfRenderMigrateBar()}
    <div class="folders-panel-content">
  `;
  
  const viewFolders = cfViewFolders();
  if (viewFolders.length === 0) {
    const emptyHint = cfLegacyAvailable
      ? 'Previously organized data was found. Run a Sync on this account to restore it.'
      : 'Use Import or Ask Claude to add chats';
    html += `<div class="folders-empty"><p>No folders yet</p><p style="font-size:12px;color:#888;">${cfEscapeHtml(emptyHint)}</p></div>`;
  } else {
    const byCategory = {};
    viewFolders.forEach(f => {
      if (!byCategory[f.category]) byCategory[f.category] = [];
      byCategory[f.category].push(f);
    });
    
    Object.keys(byCategory).forEach(cat => {
      html += `<div class="folder-category-group"><div class="folder-category-header">${cfEscapeHtml(cat)}</div>`;
      byCategory[cat].forEach(folder => {
        const chatCount = folder.rows.length;
        // Only this login's chats can be read for an export
        const exportBtn = folder.exportId ? `
            <button class="folder-export-btn" data-folder-id="${cfEscapeHtml(folder.exportId)}" title="Export folder to markdown">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
            </button>` : '';
        html += `
          <div class="folder-panel-item" data-folder-id="${cfEscapeHtml(folder.id)}">
            <svg width="14" height="14" viewBox="0 0 18 18" fill="currentColor" style="margin-right:8px;opacity:0.6;flex-shrink:0;">
              <path d="M2 3h6l2 2h6v10H2V3z"/>
            </svg>
            <span class="folder-panel-name" title="${cfEscapeHtml(folder.name)}">${cfEscapeHtml(folder.name)}</span>
            <span class="folder-panel-count">${chatCount}</span>${exportBtn}
            <svg class="folder-open-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
              <path d="M6 4l4 4-4 4"/>
            </svg>
          </div>
        `;
      });
      html += `</div>`;
    });
  }
  
  html += `</div>
    <div class="panel-update-row"><button type="button" class="cf-update-check panel-update-check">Check for updates</button></div>
  </div>`;
  // The open folder pane is part of the panel's markup. Its state is read before the redraw replaces that markup.
  const paneState = cfFolderPaneState(panel);
  panel.innerHTML = html;
  cfRenderUpdateNotices();
  cfWireUpdateCheck(panel.querySelector('.panel-update-check'));

  panel.querySelector('.cf-account-select')?.addEventListener('change', async (e) => {
    cfAccountView = e.target.value;
    await cfSaveAccountView();
    renderPanelContent(panel);
  });

  // The import button is shown while another account has chats. Clicking it opens the import dialog (content/cf-migrate-button.js).
  panel.querySelector('.cf-migrate-btn')?.addEventListener('click', () => {
    cfStartMigration().catch(err => showNotification('The import dialog did not open: ' + err.message, true));
  });

  panel.querySelector('.settings-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openSettings' }).catch(e => console.log('[CONTENT] Settings did not open:', e.message));
  });

  panel.querySelector('.open-organizer-btn')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openOrganizer' });
  });
  
  // Analytics toggle
  panel.querySelector('.analytics-btn')?.addEventListener('click', () => {
    const foldersView = panel.querySelector('.panel-folders-view');
    const analyticsView = panel.querySelector('.panel-analytics-view');
    if (analyticsView.style.display === 'none') {
      cfCloseFolderPane(panel);
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
  
  // One click sends the request and opens the answer for applying (content/cf-organize-auto.js)
  panel.querySelector('#organizeAutoBtn')?.addEventListener('click', () => {
    askClaudeToOrganize(true);
  });

  panel.querySelector('#askClaudeBtn')?.addEventListener('click', () => {
    askClaudeToOrganize();
  });
  
  panel.querySelector('#applyCategoriesBtn')?.addEventListener('click', () => {
    showApplyCategoriesModal();
  });

  // The setup actions are open until the square-check collapses them for more list room. The choice is stored.
  cfApplySetupSteps();
  panel.querySelector('.toggle-setup-btn')?.addEventListener('click', () => {
    cfSetupStepsOpen = !cfSetupStepsOpen;
    cfApplySetupSteps();
    chrome.storage.local.set({ [SETUP_STEPS_OPEN_KEY]: cfSetupStepsOpen })
      .catch(e => console.log('[PANEL] Organize steps choice not stored:', e.message));
  });
  
  // Folder export buttons
  panel.querySelectorAll('.folder-export-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const folderId = btn.dataset.folderId;
      handleFolderExport(folderId, btn);
    });
  });
  
  // A folder's chats open in the pane beside the panel (content/cf-folder-pane.js)
  panel.querySelectorAll('.folder-panel-item').forEach(item => {
    item.addEventListener('click', () => cfToggleFolderPane(panel, item.dataset.folderId));
  });

  if (paneState) cfOpenFolderPane(panel, paneState.folderId, paneState.shown, paneState.scrollTop);
}
