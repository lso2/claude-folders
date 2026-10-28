// content/cf-sync-summary.js
// Shows the summary at the end of a sync: chats imported, exports written and why any failed.
// Globals: showSyncSuccessModal
// Depends on: content/cf-text.js (cfEscapeHtml)
// Notes: docs/notes/content/cf-sync-summary.js.md

function showSyncSuccessModal(totalChats, scannedTotal, outcome, orgSummaries) {
  const result = outcome || { exported: 0, skipped: 0, empty: 0, unavailable: 0, failed: 0, reasons: new Map(), aborted: null };
  const exportSuccess = result.exported;
  const exportSkipped = result.skipped;
  const exportEmpty = result.empty;
  const exportUnavailable = result.unavailable;
  const exportFail = result.failed;
  const failureReasons = result.reasons;
  // Claude's list page shows only the active organization. The breakdown names each one.
  const orgLines = (orgSummaries || [])
    .filter(org => org && !org.error)
    .map(org => `${cfEscapeHtml(org.name)}: ${org.accountTotal}`);
  const reasonLines = Array.from((failureReasons || new Map()).entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([reason, count]) => `${count} x ${cfEscapeHtml(reason)}`);
  if (result.aborted) reasonLines.unshift(`Exports were not written: ${cfEscapeHtml(result.aborted)}`);
  // Remove progress bar
  const progressBar = document.getElementById('cf-sync-progress');
  if (progressBar) progressBar.remove();
  
  const existing = document.querySelector('.sync-success-modal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.className = 'sync-success-modal';
  modal.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        background: #2a2a28;
        border: 1px solid #3d3d3a;
        border-radius: 16px;
        padding: 32px;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #10b981, #059669);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        ">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <h2 style="color: #e8e6e3; margin: 0 0 12px; font-size: 24px;">Sync Complete!</h2>
        <div style="color: #9c9a92; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          <div style="margin-bottom: 8px;">
            <span style="color: #10b981; font-weight: 600;">${totalChats}</span> new chats imported${scannedTotal ? ` of ${scannedTotal}${orgLines.length > 1 ? ` across ${orgLines.length} organizations` : ' on the account'}` : ''}
          </div>
          <div style="margin-bottom: 8px;">
            <span style="color: #10b981; font-weight: 600;">${exportSuccess}</span> exported to markdown
          </div>
          ${exportSkipped > 0 ? `
            <div style="margin-bottom: 8px; color: #9c9a92;">
              ${exportSkipped} already exported (skipped)
            </div>
          ` : ''}
          ${exportEmpty > 0 ? `
            <div style="margin-bottom: 8px; color: #9c9a92;">
              ${exportEmpty} empty chats (no content)
            </div>
          ` : ''}
          ${exportUnavailable > 0 ? `
            <div style="margin-bottom: 8px; color: #9c9a92;">
              ${exportUnavailable} not found on the account
            </div>
          ` : ''}
          ${exportFail > 0 ? `
            <div style="margin-bottom: 8px; color: #f59e0b;">
              ${exportFail} did not produce a file
            </div>
          ` : ''}
          ${orgLines.length > 1 ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #3d3d3a; color: #9c9a92; font-size: 13px; text-align: left;">
              ${orgLines.map(line => `<div style="margin-bottom: 4px;">${line}</div>`).join('')}
            </div>
          ` : ''}
          ${reasonLines.length ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #3d3d3a; color: #9c9a92; font-size: 13px; text-align: left;">
              ${reasonLines.map(line => `<div style="margin-bottom: 4px;">${line}</div>`).join('')}
            </div>
          ` : ''}
        </div>
        <button id="syncSuccessClose" style="
          background: linear-gradient(135deg, #d97706, #b45309);
          border: none;
          color: white;
          padding: 12px 32px;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s;
        ">Done</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('#syncSuccessClose').addEventListener('click', () => {
    modal.remove();
  });
  
  // Also close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal.firstElementChild) {
      modal.remove();
    }
  });
}
