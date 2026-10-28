// content/cf-export-run.js
// Exports a list of stored chats to the data folder for folder, popup and sync exports.
// Globals: cfLoadExportedPrefixes, cfOrgIdFor, cfExportChatList, cfDescribeExportOutcome,
//          cfRunExportWithModal, handleFolderExport
// Depends on: lib/chat-exporter.js, content/cf-disk.js, content/cf-export.js,
//             content/cf-notify.js, inject.css (export progress modal)
// Notes: docs/notes/content/cf-export-run.js.md

// The 8-character id prefix in each filename is unchanged when a chat is renamed
async function cfLoadExportedPrefixes() {
  const prefixes = new Set();
  try {
    const response = await chrome.runtime.sendMessage({ action: 'listExports' });
    (response?.files || []).forEach(name => {
      const match = String(name).match(/^([a-f0-9]{8})_/i);
      if (match) prefixes.add(match[1].toLowerCase());
    });
    console.log('[EXPORT] Found', prefixes.size, 'chats already exported to disk');
  } catch (e) {
    console.log('[EXPORT] Could not list exports:', e.message);
  }
  return prefixes;
}

// Records sent by the popup and organizer carry no organization. The stored record supplies it.
function cfOrgIdFor(chat) {
  if (chat && chat.orgId) return chat.orgId;
  const stored = allChats.find(c => c.id === (chat && chat.id));
  return (stored && stored.orgId) || null;
}

// Write access is checked before the first fetch. A permission error during the run
// stops it, leaving the remaining chats untouched for the next run.
async function cfExportChatList(chats, options) {
  const opts = options || {};
  const outcome = {
    total: chats.length, exported: 0, skipped: 0, empty: 0, unavailable: 0, failed: 0,
    reasons: new Map(), aborted: null, cancelled: false
  };
  const noteFailure = (reason) => {
    const key = String(reason || 'unknown').slice(0, 120);
    outcome.reasons.set(key, (outcome.reasons.get(key) || 0) + 1);
  };
  if (!chats.length) return outcome;
  if (!window.chatExporter) {
    outcome.aborted = 'the export module was not loaded on this page';
    return outcome;
  }

  const access = await cfCheckWriteAccess();
  if (!access.ok) {
    outcome.aborted = access.error;
    if (access.code === 'no-folder' || access.code === 'permission') cfPromptFolderAccess(access.code, access.folderName, access.permission);
    return outcome;
  }

  const prefixes = opts.skipExisting === false ? new Set() : await cfLoadExportedPrefixes();
  const unavailable = await cfLoadUnavailableChats();

  for (let i = 0; i < chats.length; i++) {
    if (opts.isCancelled && opts.isCancelled()) {
      outcome.cancelled = true;
      break;
    }
    const chat = chats[i] || {};
    const chatId = String(chat.id || '');
    const chatTitle = String(chat.title || 'Untitled');
    if (opts.onProgress) opts.onProgress(i + 1, chats.length, chat);

    if (chatId.length < 8) {
      outcome.unavailable++;
      await cfMarkChatUnavailable(chatTitle, 'stored record has no id');
      continue;
    }
    if (unavailable[chatId] || cfIsCoworkId(chatId)) {
      outcome.unavailable++;
      continue;
    }
    if (prefixes.has(chatId.substring(0, 8).toLowerCase())) {
      outcome.skipped++;
      await markChatAsExported(chatId);
      continue;
    }

    try {
      const result = await window.chatExporter.exportChatById(chatId, chatTitle, cfOrgIdFor(chat));
      if (result.success && result.markdown) {
        const written = await cfWriteExport(result.filename, result.markdown);
        if (written.success) {
          outcome.exported++;
          prefixes.add(chatId.substring(0, 8).toLowerCase());
          await markChatAsExported(chatId);
        } else if (written.code === 'no-folder' || written.code === 'permission') {
          outcome.aborted = written.error;
          cfPromptFolderAccess(written.code, written.folderName, written.permission);
          break;
        } else {
          outcome.failed++;
          noteFailure('disk write: ' + (written.error || 'no reason returned'));
        }
      } else {
        const reason = result.error || 'no markdown returned';
        if (/no messages/i.test(reason)) {
          outcome.empty++;
        } else if (/in any of the \d+ readable organizations/i.test(reason)) {
          outcome.unavailable++;
          await cfMarkChatUnavailable(chatId, reason);
        } else {
          outcome.failed++;
          noteFailure(reason);
        }
      }
    } catch (e) {
      outcome.failed++;
      noteFailure(e.message || 'threw without a message');
    }
    await new Promise(r => setTimeout(r, opts.delayMs || 300));
  }

  if (outcome.reasons.size) {
    console.log('[EXPORT] Export outcomes by reason:', Array.from(outcome.reasons.entries()).map(([r, n]) => n + ' x ' + r).join(' | '));
  }
  return outcome;
}

function cfDescribeExportOutcome(outcome) {
  const parts = [`${outcome.exported} exported`];
  if (outcome.skipped) parts.push(`${outcome.skipped} already on disk`);
  if (outcome.empty) parts.push(`${outcome.empty} empty`);
  if (outcome.unavailable) parts.push(`${outcome.unavailable} not found on the account`);
  if (outcome.failed) {
    const top = Array.from(outcome.reasons.entries()).sort((a, b) => b[1] - a[1])[0];
    parts.push(`${outcome.failed} failed${top ? ` (${top[0]})` : ''}`);
  }
  return parts.join(', ');
}

async function cfRunExportWithModal(chats, title) {
  document.querySelector('.export-progress-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'export-progress-modal';
  modal.innerHTML = `
    <div class="export-progress-content">
      <div class="export-progress-title">${cfEscapeHtml(title)}</div>
      <div class="export-progress-bar-container">
        <div class="export-progress-bar" style="width: 0%"></div>
      </div>
      <div class="export-progress-text">Checking folder access...</div>
      <div class="export-progress-current"></div>
      <button class="export-cancel-btn">Cancel</button>
    </div>
  `;
  document.body.appendChild(modal);

  let cancelled = false;
  modal.querySelector('.export-cancel-btn').addEventListener('click', () => {
    cancelled = true;
    modal.remove();
  });
  const bar = modal.querySelector('.export-progress-bar');
  const text = modal.querySelector('.export-progress-text');
  const current = modal.querySelector('.export-progress-current');

  const outcome = await cfExportChatList(chats, {
    isCancelled: () => cancelled,
    onProgress: (done, total, chat) => {
      bar.style.width = `${Math.round(done / total * 100)}%`;
      text.textContent = `Exporting ${done} of ${total}`;
      current.textContent = chat.folderName ? `${chat.folderName}: ${chat.title || 'Untitled'}` : (chat.title || 'Untitled');
    }
  });

  modal.remove();
  if (outcome.aborted) {
    showNotification('Export stopped: ' + outcome.aborted, true);
  } else if (outcome.cancelled) {
    showNotification('Export cancelled: ' + cfDescribeExportOutcome(outcome));
  } else {
    showNotification('Export complete: ' + cfDescribeExportOutcome(outcome), outcome.failed > 0);
  }
  return outcome;
}

async function handleFolderExport(folderId) {
  const folder = folders.find(f => f.id === folderId);
  if (!folder || !folder.chats?.length) {
    showNotification('No chats in this folder to export', true);
    return;
  }
  const count = folder.chats.length;
  const confirmed = await cfConfirm(
    `Export ${count} chat${count === 1 ? '' : 's'} from "${folder.name}"?`,
    'Each chat is saved as markdown in the chats folder of your data folder. Chats already on disk are skipped.',
    'Export'
  );
  if (confirmed) await cfRunExportWithModal(folder.chats, `Exporting: ${folder.name}`);
}
