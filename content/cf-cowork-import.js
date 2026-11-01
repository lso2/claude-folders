// content/cf-cowork-import.js
// Builds the attachment and request of a Cowork session imported from another account, and waits for its task.
// Globals: cfCoworkPrompt, cfReadExportFile, cfCoworkImportSource, cfWaitForCoworkTurn
// Depends on: lib/cowork-api.js (coworkTurnFinished), content/cf-composer.js (cfSleep), background.js (readExportFile)
// Notes: docs/notes/content/cf-cowork-import.js.md

// The "(session cse_...)" text names the source session in the task's first message.
// item.style is the request chosen on the settings page (content/cf-migrate-source.js).
function cfCoworkPrompt(item) {
  const intro = `Attached is the exported transcript of my Cowork session "${item.title}" (session ${item.sessionId}) from another Claude account. `;
  if (item.style === 'short') return intro + 'Read it as the history of this task and reply only with: Imported.';
  return intro + 'Read it and reconstruct the session here as our working context. Summarize what was asked and what was concluded, ' +
    'list the key facts, decisions and open questions, and keep any code, documents or drafts from it intact. ' +
    'Then treat that session as ours and continue from where it ended.';
}

async function cfReadExportFile(filename, maxBytes) {
  const res = await chrome.runtime.sendMessage({ action: 'readExportFile', filename, maxBytes });
  if (!res) throw new Error(`${filename} could not be read: the response from the background was empty`);
  if (!res.success) throw new Error(`${filename} could not be read: ${res.error || "the folder worker's failure had no message"}`);
  return res.content;
}

// The export file is attached as it is on disk. Cowork reads attachments with its tools.
// A task imported with its account's folders (content/cf-migrate.js) goes to the folder planned for it.
async function cfCoworkImportSource(item) {
  return {
    sourceId: item.sessionId,
    surface: 'cowork',
    filename: item.filename,
    attachMarkdown: await cfReadExportFile(item.filename),
    prompt: cfCoworkPrompt(item),
    importedFrom: { coworkSessionId: item.sessionId, filename: item.filename, accountKey: item.accountKey || null },
    folderId: item.folderId || 'cowork-imports',
    folderName: item.folderName || 'Imported Cowork chats',
    category: item.category || 'Imported'
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
