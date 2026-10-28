// content/cf-export-run.js
// Exports a list of stored chats to the data folder for folder, popup and sync exports.
// Globals: cfLoadExportedPrefixes, cfOrgIdFor, cfReadableOrgIds, cfExportChatList,
//          cfDescribeExportOutcome, cfRunExportWithModal, handleFolderExport
// Depends on: lib/chat-markdown.js (exportIdPrefix, exportPrefixOfFilename), lib/chat-exporter.js,
//             content/cf-disk.js, content/cf-export-records.js, content/cf-notify.js, inject.css
// Notes: docs/notes/content/cf-export-run.js.md

// The id prefix in each filename is unchanged when a chat is renamed
async function cfLoadExportedPrefixes() {
  const prefixes = new Set();
  try {
    const response = await chrome.runtime.sendMessage({ action: 'listExports' });
    (response?.files || []).forEach(name => {
      const prefix = exportPrefixOfFilename(name);
      if (prefix) prefixes.add(prefix);
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

// The organizations this login can read. Null turns the organization filter off.
async function cfReadableOrgIds() {
  try {
    const orgs = await window.chatExporter.listAccessibleOrganizations();
    return orgs.length ? new Set(orgs.map(org => org.id)) : null;
  } catch (e) {
    console.log('[EXPORT] Could not list organizations:', e.message);
    return null;
  }
}

// Write access is checked before the first fetch. Chats already on disk, recorded as
// missing, or stored with an organization this login cannot read are counted before
// any export, and progress covers only the chats being exported. A permission error
// during the run stops it, leaving the remaining chats for the next run.
async function cfExportChatList(chats, options) {
  const opts = options || {};
  const outcome = {
    total: chats.length, exported: 0, skipped: 0, empty: 0, unavailable: 0, otherOrgs: 0, failed: 0,
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

  if (opts.onCheck) opts.onCheck(chats.length);
  const prefixes = opts.skipExisting === false ? new Set() : await cfLoadExportedPrefixes();
  const unavailable = await cfLoadUnavailableChats();
  const readable = opts.readableOrgIds || await cfReadableOrgIds();

  const toExport = [];
  const onDisk = [];
  for (const chat of chats) {
    const chatId = String((chat && chat.id) || '');
    if (chatId.length < 8) {
      outcome.unavailable++;
      await cfMarkChatUnavailable(String((chat && chat.title) || 'Untitled'), 'stored record has no id');
      continue;
    }
    if (unavailable[chatId]) {
      outcome.unavailable++;
      continue;
    }
    if (readable && chat.orgId && !readable.has(chat.orgId)) {
      outcome.otherOrgs++;
      continue;
    }
    if (prefixes.has(exportIdPrefix(chatId).toLowerCase())) {
      outcome.skipped++;
      onDisk.push(chatId);
      continue;
    }
    toExport.push(chat);
  }
  await cfMarkChatsExported(onDisk);
  console.log('[EXPORT] Checked', chats.length, 'chats:', toExport.length, 'to export,', outcome.skipped, 'on disk,',
    outcome.unavailable, 'missing,', outcome.otherOrgs, 'in organizations this login cannot read');

  for (let i = 0; i < toExport.length; i++) {
    if (opts.isCancelled && opts.isCancelled()) {
      outcome.cancelled = true;
      break;
    }
    const chat = toExport[i];
    const chatId = String(chat.id);
    const chatTitle = String(chat.title || 'Untitled');
    if (opts.onProgress) opts.onProgress(i + 1, toExport.length, chat);

    try {
      const result = await window.chatExporter.exportChatById(chatId, chatTitle, cfOrgIdFor(chat));
      if (result.success && result.markdown) {
        const written = await cfWriteExport(result.filename, result.markdown);
        if (written.success) {
          outcome.exported++;
          prefixes.add(exportIdPrefix(chatId).toLowerCase());
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
        } else if (/in any of the \d+ readable organizations|^Cowork endpoint returned 404/i.test(reason)) {
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
  if (outcome.otherOrgs) parts.push(`${outcome.otherOrgs} in organizations this login cannot read`);
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
    onCheck: (count) => {
      text.textContent = `Checking ${count} chat${count === 1 ? '' : 's'} against the files on disk...`;
    },
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
