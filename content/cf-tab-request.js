// content/cf-tab-request.js
// Runs the request the background stored for a claude.ai tab it opened for the organizer.
// Globals: cfTakeTabRequest, cfRunTabRequest
// Depends on: lib/tab-handoff.js (background: takeTabRequest), content/cf-shell-replay.js (cfRunShellRequest),
//             content/cf-import-dialog.js (cfOpenImportDialog), content/cf-account.js (cfAccountReady),
//             content/cf-data.js (loadData)
// Notes: docs/notes/content/cf-tab-request.js.md

// The request is handed out once: { kind: 'shell' | 'import', payload }, or null for a tab with none
async function cfTakeTabRequest() {
  try {
    const answer = await chrome.runtime.sendMessage({ action: 'takeTabRequest' });
    return (answer && answer.handoff) || null;
  } catch (e) {
    console.log('[CONTENT] The tab request was not read:', e.message);
    return null;
  }
}

// The import dialog needs this login's folders. They are loaded once the account key is known.
async function cfRunTabRequest(handoff) {
  if (!handoff) return;
  try {
    if (handoff.kind === 'shell') {
      await cfRunShellRequest(handoff.payload);
    } else if (handoff.kind === 'import') {
      await cfAccountReady;
      await loadData();
      await cfOpenImportDialog(handoff.payload.accountKey);
    }
  } catch (e) {
    console.log('[CONTENT] The', handoff.kind, 'request failed:', e.message);
  }
}
