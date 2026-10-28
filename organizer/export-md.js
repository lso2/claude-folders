// organizer/export-md.js
// Exports the organizer's chats to markdown through the open Claude tab and saves them to the data folder.
// Globals: showExportMdModal, exportChatsToMarkdown, downloadMarkdownFiles, downloadBlob
// Depends on: organizer/app.js (allChats, currentFolder), lib/storage-keys.js, lib/handle-storage.js,
//             lib/export-files.js, lib/folder-access.js, lib/chat-markdown.js
// Notes: docs/notes/organizer/export-md.js.md

function showExportMdModal() {
  const totalChats = allChats.length;
  
  if (totalChats === 0) {
    alert('No chats to export. Import some chats first.');
    return;
  }
  
  const modal = document.createElement('div');
  modal.className = 'export-modal';
  modal.id = 'exportMdModal';
  modal.innerHTML = `
    <div class="export-modal-content">
      <div class="export-modal-title">Export Chats to Markdown</div>
      <p style="color: var(--text-secondary); margin-bottom: 16px;">
        Each chat is saved as markdown in your data folder, and the exported chats are also downloaded as one combined file.
      </p>
      <div class="export-options" style="margin-bottom: 16px;">
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
          <input type="radio" name="exportScope" value="all" checked>
          <span>All chats (${totalChats})</span>
        </label>
        <label style="display: flex; align-items: center; gap: 8px; cursor: pointer; margin-top: 8px;">
          <input type="radio" name="exportScope" value="folder">
          <span>Current folder only</span>
        </label>
      </div>
      <div class="export-modal-actions">
        <button class="export-cancel-btn" id="cancelExportMd">Cancel</button>
        <button class="btn-primary" id="startExportMd">Export</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  document.getElementById('cancelExportMd').addEventListener('click', () => modal.remove());
  document.getElementById('startExportMd').addEventListener('click', () => {
    const scope = document.querySelector('input[name="exportScope"]:checked').value;
    modal.remove();
    exportChatsToMarkdown(scope);
  });
}

// The Export click is the user gesture Chrome requires before it shows the folder permission prompt.
// A chat that cannot be fetched or written is reported with its reason and gets no file.
async function exportChatsToMarkdown(scope) {
  const chatsToExport = scope === 'folder' && currentFolder ? (currentFolder.chats || []) : allChats;
  if (chatsToExport.length === 0) {
    alert('No chats to export.');
    return;
  }

  const access = await checkFolderAccess();
  if (!access.hasHandle) {
    alert('No data folder is selected. Choose one from the extension popup first.');
    return;
  }
  if (access.permission !== 'granted') {
    const granted = await grantFolderAccess();
    if (!granted.granted) {
      alert(`Saving into "${access.folderName}" was not allowed (state: ${granted.permission}).`);
      return;
    }
  }

  let claudeTab = null;
  try {
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    claudeTab = tabs[0] || null;
  } catch (e) {
    console.log('[ORGANIZER] Could not query tabs:', e.message);
  }
  if (!claudeTab) {
    alert('Open claude.ai in a tab first. Each chat is read through that tab.');
    return;
  }

  const progressModal = document.createElement('div');
  progressModal.className = 'export-modal';
  progressModal.id = 'exportProgressModal';
  progressModal.innerHTML = `
    <div class="export-modal-content">
      <div class="export-modal-title">Exporting Chats to Markdown</div>
      <div class="export-progress-bar">
        <div class="export-progress-fill" id="exportProgressFill" style="width: 0%"></div>
      </div>
      <div class="export-progress-text" id="exportProgressText">Preparing... 0 / ${chatsToExport.length}</div>
      <div class="export-progress-current" id="exportProgressCurrent">Starting...</div>
      <div class="export-modal-actions">
        <button class="export-cancel-btn" id="cancelExportProgress">Cancel</button>
      </div>
    </div>
  `;
  document.body.appendChild(progressModal);
  let cancelled = false;
  document.getElementById('cancelExportProgress').addEventListener('click', () => {
    cancelled = true;
    progressModal.remove();
  });
  const progressFill = document.getElementById('exportProgressFill');
  const progressText = document.getElementById('exportProgressText');
  const progressCurrent = document.getElementById('exportProgressCurrent');

  // Filenames start with the chat id prefix, which survives a rename
  const onDisk = new Set((await listExportedChats()).map(exportPrefixOfFilename).filter(Boolean));
  const files = [];
  const reasons = new Map();
  const exportedIds = [];
  let skippedCount = 0;
  let failCount = 0;

  for (let i = 0; i < chatsToExport.length; i++) {
    if (cancelled) break;
    const chat = chatsToExport[i];
    progressFill.style.width = `${((i + 1) / chatsToExport.length * 100).toFixed(0)}%`;
    progressText.textContent = `Exporting... ${i + 1} / ${chatsToExport.length}`;
    progressCurrent.textContent = chat.title || 'Untitled';

    if (onDisk.has(exportIdPrefix(chat.id).toLowerCase())) {
      skippedCount++;
      continue;
    }

    let reason = null;
    try {
      const response = await chrome.tabs.sendMessage(claudeTab.id, { action: 'exportChatById', chatId: chat.id, title: chat.title });
      if (response?.success && response?.markdown) {
        const filename = response.filename || generateExportFilename(chat.id, chat.title);
        const written = await writeExportFileChecked(filename, response.markdown);
        if (written.success) {
          files.push({ name: filename, content: response.markdown });
          exportedIds.push(chat.id);
        } else {
          reason = 'disk write: ' + written.error;
        }
      } else {
        reason = response?.error || 'the Claude tab returned no markdown';
      }
    } catch (e) {
      reason = 'sending to the Claude tab failed: ' + e.message;
    }
    if (reason) {
      failCount++;
      reasons.set(reason, (reasons.get(reason) || 0) + 1);
      console.log('[ORGANIZER] Not exported:', chat.title, '-', reason);
    }
    await new Promise(r => setTimeout(r, 600));
  }
  if (cancelled) return;

  if (exportedIds.length) {
    const stored = await chrome.storage.local.get(EXPORTED_CHATS_KEY);
    const exported = stored[EXPORTED_CHATS_KEY] || {};
    const now = new Date().toISOString();
    exportedIds.forEach(id => { exported[id] = now; });
    await chrome.storage.local.set({ [EXPORTED_CHATS_KEY]: exported });
  }
  progressText.textContent = 'Creating download...';
  await downloadMarkdownFiles(files);
  progressModal.remove();

  const lines = [`${files.length} exported`];
  if (skippedCount > 0) lines.push(`${skippedCount} already on disk (skipped)`);
  if (failCount > 0) {
    lines.push(`${failCount} not exported:`);
    Array.from(reasons.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .forEach(([text, count]) => lines.push(`  ${count} x ${text}`));
  }
  alert(`Export complete!\n\n${lines.join('\n')}`);
}

// Download multiple markdown files
async function downloadMarkdownFiles(files) {
  if (files.length === 0) return;
  
  if (files.length === 1) {
    // Single file - download directly
    const blob = new Blob([files[0].content], { type: 'text/markdown;charset=utf-8' });
    downloadBlob(blob, files[0].name);
    return;
  }
  
  // Multiple files - combine into single markdown with separators
  const combined = files.map(f => {
    return `\n\n${'='.repeat(80)}\n# FILE: ${f.name}\n${'='.repeat(80)}\n\n${f.content}`;
  }).join('\n');
  
  const blob = new Blob([combined], { type: 'text/markdown;charset=utf-8' });
  const timestamp = new Date().toISOString().split('T')[0];
  downloadBlob(blob, `claude-chats-export-${timestamp}.md`);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
