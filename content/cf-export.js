// content/cf-export.js
// Exports the chat, shared chat or Cowork session open in this tab.
// Globals: CF_SPIN_ICON, cfSetButtonBusy, cfExportTarget, cfPageExportClick, handleExportCurrentChat,
//          handleExportCoworkPage, cfShareProjectName, handleExportSharePage
// Depends on: lib/chat-exporter.js, lib/share-snapshots.js, lib/chat-markdown.js,
//             lib/cowork-export.js, content/cf-disk.js, content/cf-notify.js, content/cf-reveal.js,
//             content/cf-export-state.js
// Notes: docs/notes/content/cf-export.js.md

const CF_SPIN_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="spin"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>';

// Returns the function that puts the button back the way it was
function cfSetButtonBusy(btn, label) {
  const original = btn.innerHTML;
  btn.innerHTML = `${CF_SPIN_ICON}<span>${cfEscapeHtml(label)}</span>`;
  btn.disabled = true;
  return () => {
    btn.innerHTML = original;
    btn.disabled = false;
  };
}

// Export Update writes over the file the conversation was exported to, whatever title the
// conversation has now. A new export uses the name built from the current title.
async function cfExportTarget(chatId, overwrite, builtName) {
  if (!overwrite) return builtName;
  if (overwrite.filename) return overwrite.filename;
  const found = await chrome.runtime.sendMessage({ action: 'findExport', chatId }).catch((e) => {
    console.log('[EXPORT] Export file lookup failed:', e.message);
    return null;
  });
  return (found && found.success && found.filename) || builtName;
}

// The page's export button: Export, Show in folder or Export Update by its state. An up-to-date export
// without the helper (state current) and Export Update write over the conversation's file. A recorded
// export starts a new state read (cfOnExportRecorded), applied once the button is enabled again.
async function cfPageExportClick(btn, ref) {
  const state = btn.dataset.cfState || 'export';
  if (state === 'show') {
    await cfRevealExport(ref.id, btn.dataset.cfFilename || null);
    return;
  }
  const overwrite = state === 'update' || state === 'current' ? { filename: btn.dataset.cfFilename || null } : null;
  if (ref.kind === 'cowork') await handleExportCoworkPage(btn, ref.id, overwrite);
  else await handleExportCurrentChat(btn, overwrite);
  await cfRefreshPageExportButton();
}

async function handleExportCurrentChat(btn, overwrite) {
  if (!window.chatExporter) {
    showNotification('Export module not loaded', true);
    return;
  }
  const restore = cfSetButtonBusy(btn, 'Exporting...');
  try {
    const result = await window.chatExporter.exportCurrentChat();
    if (!result.success) {
      showNotification('Export failed: ' + result.error, true);
      return;
    }
    const filename = await cfExportTarget(currentChatId, overwrite, result.filename);
    cfReportSave(await cfSaveExport(filename, result.markdown, currentChatId, result.mark));
  } catch (e) {
    showNotification('Export error: ' + e.message, true);
  } finally {
    restore();
  }
}

// The page belongs to the active organization, and the Cowork endpoints are asked for that one.
// With no title passed, the session's own title is read for the export.
async function handleExportCoworkPage(btn, sessionId, overwrite) {
  const restore = cfSetButtonBusy(btn, 'Exporting...');
  try {
    const orgId = await window.chatExporter.getActiveOrganizationId();
    const result = await exportCoworkSession(sessionId, null, orgId);
    if (!result.success) {
      showNotification('Export failed: ' + result.error, true);
      return;
    }
    const filename = await cfExportTarget(sessionId, overwrite, result.filename);
    cfReportSave(await cfSaveExport(filename, result.markdown, sessionId, result.mark));
  } catch (e) {
    showNotification('Export failed: ' + e.message, true);
  } finally {
    restore();
  }
}

// The project a snapshot was shared into, named for the export header
async function cfShareProjectName(orgId, projectId) {
  if (!projectId) return '';
  try {
    const projects = await listProjects(orgId);
    const match = projects.find(p => p.id === projectId);
    return match ? match.name : '';
  } catch (e) {
    return '';
  }
}

async function handleExportSharePage(btn, snapshotId) {
  const restore = cfSetButtonBusy(btn, 'Exporting...');
  try {
    const orgId = await window.chatExporter.getActiveOrganizationId();
    const snapshot = await fetchSnapshot(orgId, snapshotId);
    const projectName = await cfShareProjectName(orgId, snapshot.project_uuid);
    const markdown = snapshotToMarkdown(snapshot, projectName);
    const filename = generateExportFilename(snapshotId, snapshot.snapshot_name);
    cfReportSave(await cfSaveExport(filename, markdown, null));
  } catch (e) {
    showNotification('Export failed: ' + e.message, true);
  } finally {
    restore();
  }
}
