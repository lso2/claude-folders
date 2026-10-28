// content/cf-cowork-import.js
// Imports the Cowork exports in the data folder that belong to other accounts as Cowork tasks.
// Globals: CF_COWORK_IMPORT_CLASS, CF_EXPORT_HEAD_BYTES, CF_COWORK_SOURCE_PATTERN, cfCoworkImportState,
//          cfCoworkPrompt, cfReadExportFile, cfExportTitle, cfCoworkSourceOfExport, cfListOwnCoworkIds,
//          cfFindCoworkImports, cfCheckCoworkImport, cfRenderCoworkImport, cfImportCoworkExports,
//          cfCoworkImportSource, cfWaitForCoworkTurn
// Depends on: lib/chat-markdown.js (exportIdOfFilename), lib/cowork-api.js, lib/chat-exporter.js,
//             content/cf-account.js, content/cf-import-registry.js, content/cf-import.js,
//             content/cf-notify.js (cfConfirm), inject.css (.cf-cowork-import)
// Notes: docs/notes/content/cf-cowork-import.js.md

const CF_COWORK_IMPORT_CLASS = 'cf-cowork-import';
// Enough bytes of an export for its title and its first message
const CF_EXPORT_HEAD_BYTES = 16384;
// The first message of a task this import starts has its source session id in this form
const CF_COWORK_SOURCE_PATTERN = /\(session (cse_[A-Za-z0-9]+)\)/;

// The exports pending for this account, read once per visit to the Chats and tasks page
let cfCoworkImportState = { loading: null, pending: [] };

function cfCoworkPrompt(item) {
  return `Attached is the exported transcript of my Cowork session "${item.title}" (session ${item.sessionId}) from another Claude account. ` +
    'Read it and reconstruct the session here as our working context. Summarize what was asked and what was concluded, ' +
    'list the key facts, decisions and open questions, and keep any code, documents or drafts from it intact. ' +
    'Then treat that session as ours and continue from where it ended.';
}

async function cfReadExportFile(filename, maxBytes) {
  const res = await chrome.runtime.sendMessage({ action: 'readExportFile', filename, maxBytes });
  if (!res) throw new Error(`${filename} could not be read: the response from the background was empty`);
  if (!res.success) throw new Error(`${filename} could not be read: ${res.error || "the folder worker's failure had no message"}`);
  return res.content;
}

// An export's first line is "# <title>"
function cfExportTitle(markdown, fallback) {
  const match = String(markdown || '').match(/^# (.+)$/m);
  return match ? match[1].trim() : fallback;
}

// The source session id in the export's first message from the person
function cfCoworkSourceOfExport(markdown) {
  const firstPrompt = String(markdown || '').split('\n---\n').find(turn => turn.trim().startsWith('## Human')) || '';
  const match = firstPrompt.match(CF_COWORK_SOURCE_PATTERN);
  return match ? match[1] : null;
}

// Every Cowork session id this account can list. A 404 is the endpoint's status for an
// organization this account is not a member of, and it is counted as no sessions.
// Any other failure is thrown.
async function cfListOwnCoworkIds() {
  const own = new Set();
  for (const org of await window.chatExporter.listAccessibleOrganizations()) {
    try {
      (await listCoworkSessions(org.id)).forEach(session => own.add(session.id));
    } catch (e) {
      if (e.status !== 404) throw new Error(`${org.name} Cowork sessions were not listed: ${e.message}`);
      console.log('[IMPORT]', org.name, 'Cowork list answered', e.message, '- counted as no sessions');
    }
  }
  return own;
}

// Every Cowork export except this account's own sessions, the ones imported here, and
// the tasks this import started from either of those
async function cfFindCoworkImports() {
  // The imported list is stored per account key, which is known once cfAccountReady settles
  if (cfAccountReady) await cfAccountReady;
  const listing = await chrome.runtime.sendMessage({ action: 'listExports' });
  const files = (listing && listing.files) || [];
  const exports = files
    .map(filename => ({ filename, sessionId: exportIdOfFilename(filename) }))
    .filter(entry => isCoworkSessionId(entry.sessionId));
  if (!exports.length) return [];

  const own = await cfListOwnCoworkIds();
  const imported = await cfLoadImported();
  for (const entry of exports) {
    const head = await cfReadExportFile(entry.filename, CF_EXPORT_HEAD_BYTES);
    entry.source = cfCoworkSourceOfExport(head);
    entry.title = cfExportTitle(head, entry.filename);
  }
  // A source with a task in this account is counted as imported when this browser has no record of it
  const importedHere = new Set(exports.filter(entry => entry.source && own.has(entry.sessionId)).map(entry => entry.source));
  const known = (id) => own.has(id) || !!imported[id] || importedHere.has(id);

  const candidates = exports.filter(entry => !known(entry.sessionId) && !(entry.source && known(entry.source)));
  // A task started from another waiting export is left for that export
  const waiting = new Set(candidates.map(entry => entry.sessionId));
  const pending = candidates.filter(entry => !(entry.source && waiting.has(entry.source)));
  console.log('[IMPORT] Data folder has', exports.length, 'Cowork exports,', pending.length, 'not from this account and not imported');
  return pending;
}

// Called on every burst of page mutations. Outside the Chats and tasks page it only clears the button.
function cfCheckCoworkImport() {
  if (location.pathname !== '/recents') {
    if (cfCoworkImportState.loading) cfCoworkImportState = { loading: null, pending: [] };
    document.querySelector('.' + CF_COWORK_IMPORT_CLASS)?.remove();
    return;
  }
  if (!cfCoworkImportState.loading) {
    const state = cfCoworkImportState;
    state.loading = cfFindCoworkImports()
      .then(pending => { state.pending = pending; })
      .catch(e => console.log('[IMPORT] No Cowork exports are offered:', e.message))
      .then(() => cfRenderCoworkImport());
    return;
  }
  cfRenderCoworkImport();
}

// Claude lists chats and tasks in one table. The button is placed above it while exports are pending.
function cfRenderCoworkImport() {
  const count = cfCoworkImportState.pending.length;
  const existing = document.querySelector('.' + CF_COWORK_IMPORT_CLASS);
  const table = document.querySelector('main table');
  if (!count || !table) {
    existing?.remove();
    return;
  }
  const label = `Import ${count} Cowork chat${count === 1 ? '' : 's'}`;
  if (existing && existing.nextElementSibling === table) {
    existing.querySelector('button').textContent = label;
    return;
  }
  existing?.remove();
  const bar = document.createElement('div');
  bar.className = CF_COWORK_IMPORT_CLASS;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.title = 'Start each Cowork export from another account as a Cowork task here';
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    cfImportCoworkExports();
  });
  bar.appendChild(btn);
  table.parentElement.insertBefore(bar, table);
}

async function cfImportCoworkExports() {
  const pending = cfCoworkImportState.pending.slice();
  if (!pending.length) return;
  const count = pending.length;
  const confirmed = await cfConfirm(
    `Import ${count} Cowork chat${count === 1 ? '' : 's'}?`,
    `Each one is started as a Cowork task in this account with its exported transcript attached and a request to reconstruct it. ${count} message${count === 1 ? ' is' : 's are'} sent one at a time.`,
    'Import'
  );
  if (!confirmed) return;
  const orgId = await window.chatExporter.getActiveOrganizationId();
  await cfStartImportRun(pending.map(entry => ({
    kind: 'cowork', sessionId: entry.sessionId, filename: entry.filename, title: entry.title, orgId
  })));
}

// The export file is attached as it is on disk. Cowork reads attachments with its tools.
async function cfCoworkImportSource(item) {
  return {
    sourceId: item.sessionId,
    surface: 'cowork',
    filename: item.filename,
    attachMarkdown: await cfReadExportFile(item.filename),
    prompt: cfCoworkPrompt(item),
    importedFrom: { coworkSessionId: item.sessionId, filename: item.filename },
    folderId: 'cowork-imports',
    folderName: 'Imported Cowork chats',
    category: 'Imported'
  };
}

// Polled every 3 seconds. A failed read is logged and polled again.
async function cfWaitForCoworkTurn(sessionId, orgId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if (await coworkTurnFinished(sessionId, orgId)) return true;
    } catch (e) {
      console.log('[IMPORT] Could not read the events of', sessionId, '-', e.message);
    }
    await cfSleep(3000);
  }
  return false;
}
