// content/cf-export.js
// Exports the chat, shared chat or Cowork session open in this tab.
// Globals: CF_SPIN_ICON, cfSetButtonBusy, handleExportCurrentChat, handleExportCoworkPage,
//          cfShareProjectName, handleExportSharePage
// Depends on: lib/chat-exporter.js, lib/share-snapshots.js, lib/chat-markdown.js,
//             lib/cowork-export.js, content/cf-disk.js, content/cf-notify.js
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

async function handleExportCurrentChat(btn) {
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
    cfReportSave(await cfSaveExport(result.filename, result.markdown, currentChatId));
  } catch (e) {
    showNotification('Export error: ' + e.message, true);
  } finally {
    restore();
  }
}

// The page belongs to the active organization, which the Cowork endpoints are asked for.
// With no title passed, the export reads the session's own title.
async function handleExportCoworkPage(btn, sessionId) {
  const restore = cfSetButtonBusy(btn, 'Exporting...');
  try {
    const orgId = await window.chatExporter.getActiveOrganizationId();
    const result = await exportCoworkSession(sessionId, null, orgId);
    if (!result.success) {
      showNotification('Export failed: ' + result.error, true);
      return;
    }
    cfReportSave(await cfSaveExport(result.filename, result.markdown, sessionId));
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
