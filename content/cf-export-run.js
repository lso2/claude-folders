// content/cf-export-run.js
// Exports a list of stored chats to the data folder for folder, popup and sync exports.
// Globals: cfLoadExportedFiles, cfExportIsOutdated, cfOutdatedTarget, cfOrgIdFor, cfReadableOrgIds,
//          cfReleaseForeignChats, cfExportChatList, cfDescribeExportOutcome, cfRunExportWithModal, handleFolderExport
// Depends on: lib/chat-markdown.js (exportIdPrefix, exportPrefixOfFilename, EXPORT_FORMAT),
//             lib/export-state.js (loadExportRecords), lib/chat-exporter.js,
//             content/cf-disk.js, content/cf-export-records.js, content/cf-notify.js,
//             content/cf-run-state.js (cfRunStart, cfRunProgress, cfRunFinish), inject.css
// Notes: docs/notes/content/cf-export-run.js.md

// The export file names in chats/ by lowercased id prefix. The prefix is unchanged when a chat is renamed.
async function cfLoadExportedFiles() {
  const byPrefix = new Map();
  try {
    const response = await chrome.runtime.sendMessage({ action: 'listExports' });
    (response?.files || []).forEach(name => {
      const prefix = exportPrefixOfFilename(name);
      if (!prefix) return;
      if (!byPrefix.has(prefix)) byPrefix.set(prefix, []);
      byPrefix.get(prefix).push(name);
    });
    console.log('[EXPORT] Found', byPrefix.size, 'chats already exported to disk');
  } catch (e) {
    console.log('[EXPORT] Could not list exports:', e.message);
  }
  return byPrefix;
}

// An export on disk is outdated when its record has no format or another format than EXPORT_FORMAT,
// or when the chat's updatedAt is later than the export. A file with no record counts as outdated.
function cfExportIsOutdated(chat, record) {
  if (!record || record.format !== EXPORT_FORMAT) return true;
  const changed = Date.parse((chat && chat.updatedAt) || '');
  const exported = Date.parse(record.exportedAt || '');
  return Number.isFinite(changed) && Number.isFinite(exported) && changed > exported;
}

// An outdated export is written over its recorded file when that file is on disk, else over the first file with its id prefix
function cfOutdatedTarget(record, names) {
  return record && record.filename && names.includes(record.filename) ? record.filename : names[0];
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

// Chats this login cannot read leave its folders when another account's data holds them
// (lib/accounts.js releaseForeignChats). The answer is { released, accounts: [{ label, count }] }.
async function cfReleaseForeignChats(ids) {
  if (!ids.length) return { released: 0, accounts: [] };
  try {
    const answer = await chrome.runtime.sendMessage({ action: 'releaseForeignChats', ids });
    if (answer && answer.success) return answer;
    console.log('[EXPORT] Chats of other accounts were not released:', (answer && answer.error) || 'the background answered nothing');
  } catch (e) {
    console.log('[EXPORT] Chats of other accounts were not released:', e.message);
  }
  return { released: 0, accounts: [] };
}

// Write access is checked before the first fetch. Chats current on disk, recorded as
// missing, or stored with an organization this login cannot read are counted before
// any export, and progress covers only the chats being exported. An outdated export on
// disk is exported again over its file and counted as updated. A permission error
// during the run stops it, leaving the remaining chats for the next run.
// opts.rewriteAll: every export on disk is written again over its file, current or not (the popup's forced resync).
// opts.waitIfPaused: awaited before each chat, the sync's Pause (content/cf-sync-control.js).
// onProgress(done, total, chat, detail, updating): detail is the event count while a Cowork session reads.
// updating is true when the chat's export is on disk and outdated, and its file is written again.
async function cfExportChatList(chats, options) {
  const opts = options || {};
  const outcome = {
    total: chats.length, exported: 0, updated: 0, skipped: 0, empty: 0, unavailable: 0, knownMissing: 0, otherOrgs: 0,
    failed: 0, released: 0, releasedTo: [], reasons: new Map(), aborted: null, cancelled: false, files: [], failures: []
  };
  // failures lists each chat that did not produce a file under its reason, for the result's chat links (lib/run-failures.js)
  const noteFailure = (reason, chat) => {
    const key = String(reason || 'unknown').slice(0, 120);
    outcome.reasons.set(key, (outcome.reasons.get(key) || 0) + 1);
    if (chat) {
      const id = String(chat.id || '');
      outcome.failures.push({ id, title: String(chat.title || 'Untitled'), url: chat.url || `https://claude.ai/chat/${id}`, reason: key });
    }
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
  const onDiskFiles = opts.skipExisting === false ? new Map() : await cfLoadExportedFiles();
  const records = await loadExportRecords();
  const unavailable = await cfLoadUnavailableChats();
  const readable = opts.readableOrgIds || await cfReadableOrgIds();

  // Chats this login cannot read: recorded as missing, stored with an organization it has no access to,
  // or absent from a listing that read every organization to the end (opts.notListed)
  const cannotRead = (chat) => {
    const chatId = String((chat && chat.id) || '');
    return !!(unavailable[chatId] || (readable && chat.orgId && !readable.has(chat.orgId)) || (opts.notListed && opts.notListed.has(chatId)));
  };
  const release = await cfReleaseForeignChats(chats.filter(c => c && c.id && cannotRead(c)).map(c => String(c.id)));
  outcome.released += release.released;
  outcome.releasedTo = release.accounts;
  const releasedIds = new Set(release.ids || []);

  const toExport = [];
  const onDisk = [];
  for (const chat of chats) {
    const chatId = String((chat && chat.id) || '');
    if (releasedIds.has(chatId)) continue;
    if (chatId.length < 8) {
      outcome.unavailable++;
      await cfMarkChatUnavailable(String((chat && chat.title) || 'Untitled'), 'stored record has no id');
      continue;
    }
    if (unavailable[chatId]) {
      outcome.knownMissing++;
      continue;
    }
    if (readable && chat.orgId && !readable.has(chat.orgId)) {
      outcome.otherOrgs++;
      continue;
    }
    const names = onDiskFiles.get(exportIdPrefix(chatId).toLowerCase());
    if (names && !opts.rewriteAll && !cfExportIsOutdated(chat, records[chatId])) {
      outcome.skipped++;
      onDisk.push(chatId);
      continue;
    }
    toExport.push({ chat, target: names ? cfOutdatedTarget(records[chatId], names) : null });
  }
  await cfMarkChatsExported(onDisk);
  const updates = toExport.filter(entry => entry.target).length;
  console.log('[EXPORT] Checked', chats.length, 'chats:', toExport.length - updates, 'to export,', updates, 'outdated on disk to update,', outcome.skipped, 'current on disk,',
    outcome.knownMissing, 'recorded as missing,', outcome.otherOrgs, 'in organizations this login cannot read,',
    outcome.released, 'moved to the accounts that hold them');

  const newlyMissing = [];
  for (let i = 0; i < toExport.length; i++) {
    if (opts.waitIfPaused) await opts.waitIfPaused();
    if (opts.isCancelled && opts.isCancelled()) {
      outcome.cancelled = true;
      break;
    }
    const { chat, target } = toExport[i];
    const chatId = String(chat.id);
    const chatTitle = String(chat.title || 'Untitled');
    if (opts.onProgress) opts.onProgress(i + 1, toExport.length, chat, '', !!target);

    try {
      const started = performance.now();
      const result = await window.chatExporter.exportChatById(chatId, chatTitle, cfOrgIdFor(chat),
        opts.onProgress ? (detail) => opts.onProgress(i + 1, toExport.length, chat, detail, !!target) : null);
      const read = Math.round(performance.now() - started);
      if (result.success && result.markdown) {
        const filename = target || result.filename;
        const writing = performance.now();
        const written = await cfWriteExport(filename, result.markdown);
        console.log(`[EXPORT] ${i + 1} of ${toExport.length} ${chatId}: read in ${read} ms, ${Math.round(result.markdown.length / 1024)} KB written to ${filename} in ${Math.round(performance.now() - writing)} ms`);
        if (written.success) {
          if (target) outcome.updated++;
          else outcome.exported++;
          outcome.files.push(filename);
          await markChatAsExported(chatId, { filename, mark: result.mark });
        } else if (written.code === 'no-folder' || written.code === 'permission') {
          outcome.aborted = written.error;
          cfPromptFolderAccess(written.code, written.folderName, written.permission);
          break;
        } else {
          outcome.failed++;
          noteFailure('disk write: ' + (written.error || 'no reason returned'), chat);
        }
      } else {
        const reason = result.error || 'no markdown returned';
        console.log(`[EXPORT] ${i + 1} of ${toExport.length} ${chatId}: not read after ${read} ms: ${reason}`);
        if (/no messages/i.test(reason)) {
          outcome.empty++;
        } else if (/in any of the \d+ readable organizations|^Cowork endpoint returned 404/i.test(reason)) {
          outcome.unavailable++;
          newlyMissing.push(chatId);
          await cfMarkChatUnavailable(chatId, reason);
        } else {
          outcome.failed++;
          noteFailure(reason, chat);
        }
      }
    } catch (e) {
      outcome.failed++;
      noteFailure(e.message || 'threw without a message', chat);
    }
    await new Promise(r => setTimeout(r, opts.delayMs || 300));
  }

  // Chats found missing in this run leave the folders too when another account holds them
  const late = await cfReleaseForeignChats(newlyMissing);
  if (late.released) {
    outcome.released += late.released;
    outcome.unavailable -= late.released;
    late.accounts.forEach(a => {
      const known = outcome.releasedTo.find(x => x.label === a.label);
      if (known) known.count += a.count;
      else outcome.releasedTo.push({ ...a });
    });
  }

  if (outcome.reasons.size) {
    console.log('[EXPORT] Export outcomes by reason:', Array.from(outcome.reasons.entries()).map(([r, n]) => n + ' x ' + r).join(' | '));
  }
  return outcome;
}

function cfDescribeExportOutcome(outcome) {
  const parts = [`${outcome.exported} exported`];
  if (outcome.updated) parts.push(`${outcome.updated} updated`);
  if (outcome.skipped) parts.push(`${outcome.skipped} already on disk and current`);
  if (outcome.empty) parts.push(`${outcome.empty} empty`);
  if (outcome.unavailable) parts.push(`${outcome.unavailable} not found on the account`);
  if (outcome.otherOrgs) parts.push(`${outcome.otherOrgs} in organizations this login cannot read`);
  if (outcome.released) parts.push(`${outcome.released} moved to the account that holds them`);
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

  cfRunStart('export', title);
  const outcome = await cfExportChatList(chats, {
    isCancelled: () => cancelled,
    onCheck: (count) => {
      text.textContent = `Checking ${count} chat${count === 1 ? '' : 's'} against the files on disk...`;
      cfRunProgress(text.textContent);
    },
    onProgress: (done, total, chat, detail, updating) => {
      bar.style.width = `${Math.round(done / total * 100)}%`;
      text.textContent = `${updating ? 'Updating' : 'Exporting'} ${done} of ${total}` + (detail ? `, ${detail}` : '');
      current.textContent = chat.folderName ? `${chat.folderName}: ${chat.title || 'Untitled'}` : (chat.title || 'Untitled');
      cfRunProgress(`${text.textContent}: ${chat.title || 'Untitled'}`);
    }
  });
  cfRunFinish([cfDescribeExportOutcome(outcome)], outcome.files, outcome.aborted || (outcome.cancelled ? 'cancelled in the claude.ai tab' : null), outcome.failures);

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
    'Each chat is saved as markdown in the chats folder of your data folder. Exports on disk are written again when the chat changed after its export or the export has no message timestamps. Current exports are skipped.',
    'Export'
  );
  if (confirmed) await cfRunExportWithModal(folder.chats, `Exporting: ${folder.name}`);
}
