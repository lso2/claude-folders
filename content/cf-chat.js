// Claude Folders content script - per-chat controls, folder picker and notifications

function injectChatButton() {
  // Clear every previous pair, not the first match. The export button carries both
  // classes, so it was usually what the first selector found and removed, leaving
  // the folder button in place for the next call to add another one beside it.
  document.querySelectorAll('.claude-folders-btn, .claude-export-btn').forEach(el => el.remove());
  
  const ref = cfConversationRef();
  if (!ref) return;

  // Claude's chat pages ship no header element and no h1 any more, and a Cowork page
  // uses a different header again: no chat-header, an empty actions group, and its
  // own trailing slot. Each route is anchored to what it actually has.
  const header = document.querySelector('[data-testid="chat-header"]') || document.querySelector('header');
  const actionsGroup = header && header.querySelector('[data-testid="wiggle-controls-actions-group"]');
  const usableActions = actionsGroup && actionsGroup.getBoundingClientRect().width > 0 ? actionsGroup : null;
  const coworkTrailing = document.querySelector('[data-testid="cowork-title-row-trailing"]');
  const titleControl = document.querySelector('[data-testid="chat-title-split"]')
    || document.querySelector('[data-testid="session-title-split"]')
    || (header && header.querySelector('h1'));

  const titleContainer = usableActions
    || (coworkTrailing && coworkTrailing.parentElement)
    || (titleControl && titleControl.parentElement)
    || header;
  const placeFirst = !!usableActions;

  if (!titleContainer) {
    // Bounded retry: the mutation observer calls back in once the header mounts,
    // so a missing header can no longer queue a timer every half second forever
    if (chatButtonRetries++ < 40) setTimeout(injectChatButton, 500);
    return;
  }
  chatButtonRetries = 0;

  // Keep the two buttons in order whether they lead the cluster or trail the title
  const place = (el) => {
    if (placeFirst) titleContainer.insertBefore(el, titleContainer.firstChild);
    else titleContainer.appendChild(el);
  };
  
  // Export button
  const exportBtn = document.createElement('button');
  exportBtn.className = 'claude-folders-btn claude-export-btn' + (placeFirst ? ' in-header' : '');
  exportBtn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
    <span>Export</span>
  `;
  if (ref.kind === 'cowork') {
    // No endpoint returns a Cowork transcript, so this cannot run here
    exportBtn.disabled = true;
    exportBtn.title = 'Cowork sessions are not in Claude\u2019s conversation list, so there is nothing to export';
  } else {
    exportBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await handleExportCurrentChat(exportBtn);
    });
  }
  // Folder button
  const btn = document.createElement('button');
  btn.className = 'claude-folders-btn' + (placeFirst ? ' in-header' : '');
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
      <path d="M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/>
    </svg>
    <span>Add to folder</span>
  `;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    showFolderPicker(btn);
  });

  if (placeFirst) {
    place(btn);
    place(exportBtn);
  } else {
    place(exportBtn);
    place(btn);
  }
}

// Export handler function
async function handleExportCurrentChat(btn) {
  if (!window.chatExporter) {
    showNotification('Export module not loaded', true);
    return;
  }
  
  const originalText = btn.innerHTML;
  btn.innerHTML = `
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin">
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 6v6l4 2"/>
    </svg>
    <span>Exporting...</span>
  `;
  btn.disabled = true;
  
  try {
    const result = await window.chatExporter.exportCurrentChat();
    
    if (result.success && result.markdown) {
      // Send to background to write file
      const saveResponse = await chrome.runtime.sendMessage({
        action: 'saveExport',
        filename: result.filename,
        content: result.markdown
      });
      
      if (saveResponse?.success) {
        showNotification(`Saved: ${result.filename}`);
        if (currentChatId) markChatAsExported(currentChatId);
      } else {
        showNotification('Could not save: ' + (saveResponse?.error || 'Unknown error'), true);
      }
    } else {
      showNotification('Export failed: ' + result.error, true);
    }
  } catch (e) {
    showNotification('Export error: ' + e.message, true);
  } finally {
    btn.innerHTML = originalText;
    btn.disabled = false;
  }
}

// Mark chat as exported in storage
// Chats the account no longer has, and stored records too broken to fetch. These
// are not export failures and retrying them every sync says nothing new, so they
// are recorded once and reported as their own outcome from then on.
async function cfMarkChatUnavailable(chatId, reason) {
  if (!chatId) return;
  try {
    const result = await chrome.storage.local.get('unavailableChats');
    const unavailable = result.unavailableChats || {};
    if (!unavailable[chatId]) {
      unavailable[chatId] = { reason: String(reason || 'unavailable'), since: new Date().toISOString() };
      await chrome.storage.local.set({ unavailableChats: unavailable });
    }
  } catch (e) {
    console.log('[EXPORT] Could not record an unavailable chat:', e.message);
  }
}

async function cfLoadUnavailableChats() {
  try {
    const result = await chrome.storage.local.get('unavailableChats');
    return result.unavailableChats || {};
  } catch (e) {
    return {};
  }
}

async function markChatAsExported(chatId) {
  try {
    const result = await chrome.storage.local.get('exportedChats');
    const exported = result.exportedChats || {};
    exported[chatId] = new Date().toISOString();
    await chrome.storage.local.set({ exportedChats: exported });
  } catch (e) {
    console.log('[EXPORT] Failed to mark as exported:', e.message);
  }
}

// Handle folder export - shows confirmation then starts bulk export
async function handleFolderExport(folderId, btn) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.chats?.length) {
    showNotification('No chats in this folder to export', true);
    return;
  }
  
  const chatCount = folder.chats.length;
  const estimatedTime = Math.ceil(chatCount * 0.5 / 60); // ~0.5s per chat
  
  if (!confirm(`Export ${chatCount} chats from "${folder.name}"?\n\nThis will visit each chat page to extract content.\nEstimated time: ${estimatedTime > 0 ? estimatedTime + ' minute(s)' : 'less than a minute'}\n\nFiles will be saved to your data folder/chats/`)) {
    return;
  }
  
  showBulkExportProgress(folder);
}

// Show bulk export progress modal
function showBulkExportProgress(folder) {
  const existing = document.querySelector('.export-progress-modal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.className = 'export-progress-modal';
  modal.innerHTML = `
    <div class="export-progress-content">
      <div class="export-progress-title">Exporting: ${folder.name}</div>
      <div class="export-progress-bar-container">
        <div class="export-progress-bar" style="width: 0%"></div>
      </div>
      <div class="export-progress-text">Preparing... 0 / ${folder.chats.length}</div>
      <div class="export-progress-current">Starting export...</div>
      <button class="export-cancel-btn">Cancel</button>
    </div>
  `;
  document.body.appendChild(modal);
  
  let cancelled = false;
  modal.querySelector('.export-cancel-btn').addEventListener('click', () => {
    cancelled = true;
    modal.remove();
    showNotification('Export cancelled');
  });
  
  // Start the export process
  runBulkExport(folder, modal, () => cancelled);
}

// Run the bulk export process
async function runBulkExport(folder, modal, isCancelled) {
  const progressBar = modal.querySelector('.export-progress-bar');
  const progressText = modal.querySelector('.export-progress-text');
  const currentText = modal.querySelector('.export-progress-current');
  
  let successCount = 0;
  let failCount = 0;
  
  for (let i = 0; i < folder.chats.length; i++) {
    if (isCancelled()) break;
    
    const chat = folder.chats[i];
    const percent = ((i + 1) / folder.chats.length * 100).toFixed(0);
    
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `Exporting... ${i + 1} / ${folder.chats.length}`;
    currentText.textContent = chat.title;
    
    try {
      // Use the chat exporter to fetch and convert
      if (window.chatExporter) {
        const result = await window.chatExporter.exportChatById(chat.id, chat.title);
        
        if (result.success && result.markdown) {
          // Send to background to write file
          const saveResponse = await chrome.runtime.sendMessage({
            action: 'saveExport',
            filename: result.filename,
            content: result.markdown
          });
          
          if (saveResponse?.success) {
            successCount++;
            await markChatAsExported(chat.id);
          } else {
            failCount++;
            console.log('[EXPORT] Write failed:', chat.title, saveResponse?.error);
          }
        } else {
          failCount++;
          console.log('[EXPORT] Failed:', chat.title, result.error);
        }
      }
    } catch (e) {
      failCount++;
      console.log('[EXPORT] Error exporting:', chat.title, e.message);
    }
    
    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }
  
  if (!isCancelled()) {
    modal.remove();
    showNotification(`Export complete! ${successCount} succeeded, ${failCount} failed`);
  }
}

// Save export file via popup (which has file system access)
async function saveExportViaPopup(filename, content) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'saveExport',
      filename,
      content
    });
    return response?.success || false;
  } catch (e) {
    console.log('[EXPORT] saveExportViaPopup failed:', e.message);
    return false;
  }
}

function showFolderPicker(anchorElement) {
  const existing = document.querySelector('.claude-folders-picker');
  if (existing) { existing.remove(); return; }
  
  const picker = document.createElement('div');
  picker.className = 'claude-folders-picker';
  
  const rect = anchorElement.getBoundingClientRect();
  picker.style.top = `${rect.bottom + 8}px`;
  picker.style.right = `${Math.max(8, window.innerWidth - rect.right)}px`;
  picker.style.left = 'auto';

  let html = '<div class="folders-picker-header">Select folder</div><div class="folders-picker-list">';

  if (folders.length > 0) {
    folders.forEach(folder => {
      html += `
        <div class="folder-picker-item" data-folder-id="${cfEscapeHtml(folder.id)}">
          <span class="folder-category">${cfEscapeHtml(folder.category)}</span>
          <span class="folder-name">${cfEscapeHtml(folder.name)}</span>
        </div>
      `;
    });
  } else {
    html += `<div style="padding:12px 16px;color:#888;font-size:13px;">No folders yet. Create one below:</div>`;
  }

  html += `</div>`;

  html += `
    <div class="folder-picker-divider"></div>
    <div class="folder-picker-new">
      <input type="text" id="newFolderName" placeholder="New folder name..." class="new-folder-input">
      <select id="newFolderCategory" class="new-folder-select">
        ${(categories.length > 0 ? categories : ['Personal', 'Work', 'Projects']).map(cat => `<option value="${cfEscapeHtml(cat)}">${cfEscapeHtml(cat)}</option>`).join('')}
      </select>
      <button class="create-folder-btn">Create & Add</button>
    </div>
  `;

  picker.innerHTML = html;
  document.body.appendChild(picker);

  // Clamp inside the viewport: if it would spill past the bottom, flip above
  const pickerRect = picker.getBoundingClientRect();
  if (pickerRect.bottom > window.innerHeight - 8) {
    const flippedTop = rect.top - pickerRect.height - 8;
    picker.style.top = `${Math.max(8, flippedTop)}px`;
  }
  
  picker.querySelectorAll('.folder-picker-item').forEach(item => {
    item.addEventListener('click', async () => {
      await assignCurrentChatToFolder(item.dataset.folderId);
      picker.remove();
    });
  });
  
  const createBtn = picker.querySelector('.create-folder-btn');
  if (createBtn) {
    createBtn.addEventListener('click', async () => {
      const name = picker.querySelector('#newFolderName').value.trim();
      const category = picker.querySelector('#newFolderCategory').value;
      if (name) {
        await createFolderAndAssign(name, category);
        picker.remove();
      }
    });
  }
  
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!picker.contains(e.target) && e.target !== anchorElement) {
        picker.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 0);
}

async function createFolderAndAssign(folderName, category) {
  const folderId = 'folder-' + Date.now();
  try {
    await chrome.runtime.sendMessage({
      action: 'createFolder',
      folder: { id: folderId, category, name: folderName, chats: [] }
    });
    await loadData();
    await assignCurrentChatToFolder(folderId);
    showNotification('Folder created and chat added');
  } catch (error) {
    showNotification('Error: ' + error.message, true);
  }
}

async function assignCurrentChatToFolder(folderId) {
  const chatTitle = cfCurrentChatTitle();
  const chatUrl = window.location.href;
  
  try {
    await chrome.runtime.sendMessage({
      action: 'assignChatToFolder',
      chat: {
        id: currentChatId,
        title: chatTitle,
        url: chatUrl,
        tags: [],
        date: new Date().toISOString().split('T')[0],
        relativeDate: 'Today'
      },
      folderId
    });
    await loadData();
    showNotification('Added to folder');
  } catch (error) {
    showNotification('Error: ' + error.message, true);
  }
}

function observeUrlChanges() {
  let lastUrl = location.href;
  let checkScheduled = false;

  // React mutates the DOM constantly, so coalesce bursts of mutations into one
  // check on the next animation frame instead of querying on every mutation.
  const scheduleCheck = () => {
    if (checkScheduled) return;
    checkScheduled = true;
    requestAnimationFrame(() => {
      checkScheduled = false;
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        updateCurrentChatId();
        if (cfOnConversationPage()) {
          setTimeout(injectChatButton, 500);
        }
      }
      // Re-inject sidebar if React removed it
      if (!document.querySelector('a[data-folders-link="true"]')) {
        sidebarInjected = false;
        injectSidebar();
      }
      // Same for the per-chat buttons, which React replaces when the header
      // re-renders without the URL having changed
      if (cfOnConversationPage() && !document.querySelector('.claude-folders-btn')) {
        injectChatButton();
      }
    });
  };

  new MutationObserver(scheduleCheck).observe(document, { subtree: true, childList: true });
}

function showNotification(message, isError = false) {
  const notification = document.createElement('div');
  notification.className = `claude-folders-notification ${isError ? 'error' : ''}`;
  notification.textContent = message;
  document.body.appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, 3000);
}

// Orange styled progress bar for sync operations
// Progress readout with fixed geometry. The old version put a whole sentence in one
// span inside a box centered by transform, so the box resized and re-centered on
// every item and the proportional digits shifted width, which is what made a count
// of two thousand read as a blur. Holding the geometry still is what cures that, so
// every count is drawn rather than sampled: fixed width, the counter in its own
// tabular-figure slot, and the file name on a separate clipped line.
// Hand the frame back to the renderer. Writing to the DOM does not paint it: the
// display refreshes about sixty times a second, so a loop that iterates hundreds of
// times a second has most of its counts overwritten before any of them are drawn.
// Waiting a frame per item is what makes every number actually appear.
function showSyncProgressBar(message) {
  let bar = document.getElementById('cf-sync-progress');

  // Determine position based on current page
  const isInChat = /\/chat\/[a-f0-9-]+/i.test(window.location.pathname);
  const positionStyle = isInChat
    ? 'top: 12px; right: 12px; left: auto; transform: none;'
    : 'bottom: 20px; left: 50%; transform: translateX(-50%);';

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cf-sync-progress';
    // The blur came from the box: min-width let it grow with the message, so a
    // transform-centred box re-centred on every count, and proportional digits
    // changed width as the number climbed. A fixed width with the text clipped and
    // the digits tabular holds it still. Nothing about the update rate changes.
    bar.innerHTML = `
      <div style="
        position: fixed;
        ${positionStyle}
        background: linear-gradient(135deg, #d97706, #b45309);
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        width: 380px;
        box-sizing: border-box;
      ">
        <svg class="sync-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="animation: cf-spin 1s linear infinite; flex: 0 0 auto;">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <span class="sync-message" style="
          flex: 1 1 auto;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-variant-numeric: tabular-nums;
          font-feature-settings: 'tnum' 1;
        ">${message}</span>
      </div>
      <style>
        @keyframes cf-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>
    `;
    document.body.appendChild(bar);
  } else {
    bar.querySelector('.sync-message').textContent = message;
  }
}

function hideSyncProgressBar() {
  const bar = document.getElementById('cf-sync-progress');
  if (bar) bar.remove();
}
