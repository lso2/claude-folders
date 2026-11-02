// content/cf-sync-summary.js
// Words the result of a sync and shows it in the summary modal on Claude's page.
// Globals: cfSyncSummaryLines, showSyncSuccessModal
// Depends on: content/cf-text.js (cfEscapeHtml), lib/run-failures.js (cfRenderRunLines), content/cf-disk.js (cfFolderAccessAction)
// Notes: docs/notes/content/cf-sync-summary.js.md

// The same sentences go to the modal and to the run record the popup and organizer show (content/cf-sync.js).
// lines: the counts. details: the organizations and the failure reasons.
// libraryWritten: the background's answer for data.js (background.js scrapedChats), null when nothing was sent.
function cfSyncSummaryLines(totalChats, scannedTotal, outcome, orgSummaries, coworkCount, libraryWritten) {
  const result = outcome || { exported: 0, updated: 0, skipped: 0, empty: 0, unavailable: 0, failed: 0, reasons: new Map(), aborted: null };
  const orgLines = (orgSummaries || []).filter(org => org && !org.error).map(org => `${org.name}: ${org.accountTotal}`);
  const lines = [];
  const total = scannedTotal ? ` of ${scannedTotal}${orgLines.length > 1 ? ` across ${orgLines.length} organizations` : ' on the account'}` : '';
  lines.push(`${totalChats} new chats imported${total}`);
  if (coworkCount > 0) lines.push(`${coworkCount} Cowork session${coworkCount === 1 ? '' : 's'} in that total`);
  lines.push(`${result.exported} exported to markdown`);
  // Exports with no message timestamps, or older than the chat's newest change, are written again (content/cf-export-run.js)
  if (result.updated > 0) lines.push(`${result.updated} outdated export${result.updated === 1 ? '' : 's'} updated`);
  if (result.skipped > 0) lines.push(`${result.skipped} already exported and current (skipped)`);
  if (result.empty > 0) lines.push(`${result.empty} empty chats (no content)`);
  if (result.unavailable > 0) lines.push(`${result.unavailable} not found on the account`);
  if (result.otherOrgs > 0) lines.push(`${result.otherOrgs} in organizations this login cannot read`);
  // Chats another account holds left this login's folders in this run (lib/accounts.js releaseForeignChats)
  (result.releasedTo || []).forEach(a => lines.push(`${a.count} chat${a.count === 1 ? '' : 's'} of ${a.label} now listed only under that account`));
  if (result.failed > 0) lines.push(`${result.failed} did not produce a file`);
  if (libraryWritten === true) lines.push('Offline library data written (data.js)');
  if (libraryWritten === false) lines.push('Offline library data was not written (data.js)');

  const details = orgLines.length > 1 ? orgLines.slice() : [];
  // Stopped for folder access, the reason is the window's own message and the run record's error (content/cf-sync.js)
  if (result.aborted && !result.access) details.push(`Exports were not written: ${result.aborted}`);
  Array.from((result.reasons || new Map()).entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .forEach(([reason, count]) => details.push(`${count} x ${reason}`));
  return { lines, details, failures: result.failures || [] };
}

// access: { code, folderName, permission } when the exports stopped for folder access. The window then
// offers the access window, and the sync runs again once access is granted (content/cf-sync.js).
function showSyncSuccessModal(summary, access) {
  const grant = access ? cfFolderAccessAction(access.code, access.folderName, access.permission) : null;
  document.getElementById('cf-sync-progress')?.remove();
  document.querySelector('.sync-success-modal')?.remove();

  const modal = document.createElement('div');
  modal.className = 'sync-success-modal';
  modal.innerHTML = `
    <div style="position: fixed; inset: 0; background: rgba(0,0,0,0.7); z-index: 100000; display: flex; align-items: center; justify-content: center;">
      <div style="background: #2a2a28; border: 1px solid #3d3d3a; border-radius: 0; padding: 32px; max-width: 400px; text-align: center; box-shadow: 0 8px 32px rgba(0,0,0,0.5); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
        <div style="width: 64px; height: 64px; background: ${grant ? 'var(--cf-orange)' : '#059669'}; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px;">
          ${grant
            ? '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3" stroke-linecap="round"><path d="M12 6v8M12 18h.01"/></svg>'
            : '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3"><path d="M20 6L9 17l-5-5"/></svg>'}
        </div>
        <h2 style="color: #e8e6e3; margin: 0 0 12px; font-size: 24px;">${grant ? 'Folder access needed' : 'Sync complete'}</h2>
        ${grant ? `<div style="color: #e8e6e3; font-size: 15px; line-height: 1.6; margin-bottom: 16px;">${cfEscapeHtml(grant.message)} The sync runs again once access is granted.</div>` : ''}
        <div style="color: #e8e6e3; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          ${summary.lines.map(line => `<div style="margin-bottom: 8px;">${cfEscapeHtml(line)}</div>`).join('')}
          ${summary.details.length || summary.failures.length ? `
            <ul class="cf-sync-details" style="margin: 12px 0 0; padding: 12px 0 0; border-top: 1px solid #3d3d3a; color: #9c9a92; font-size: 13px; text-align: left; list-style: none;"></ul>` : ''}
        </div>
        ${grant && grant.label ? `<button id="syncAccessGrant" style="background: var(--cf-orange); border: none; color: #ffffff; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; margin-right: 8px;">${cfEscapeHtml(grant.label)}</button>` : ''}
        <button id="syncSuccessClose" style="background: ${grant ? '#3d3d3a' : 'var(--cf-orange)'}; border: none; color: #ffffff; padding: 12px 32px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer;">${grant ? 'Close' : 'Done'}</button>
      </div>
    </div>
  `;
  // Each failure reason opens the list of its chats, as links (lib/run-failures.js)
  const details = modal.querySelector('.cf-sync-details');
  if (details) cfRenderRunLines(details, summary.details, summary.failures);
  document.body.appendChild(modal);
  modal.querySelector('#syncSuccessClose').addEventListener('click', () => modal.remove());
  modal.querySelector('#syncAccessGrant')?.addEventListener('click', () => {
    modal.remove();
    grant.run();
  });
  modal.addEventListener('click', (e) => {
    if (e.target === modal.firstElementChild) modal.remove();
  });
}
