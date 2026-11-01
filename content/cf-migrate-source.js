// content/cf-migrate-source.js
// Builds the attachment, request and target folder of each chat imported from another account.
// Globals: cfMigrationStyle, cfMigrationPrompt, cfMigrateImportSource
// Depends on: lib/storage-keys.js (MIGRATION_REQUEST_KEY), content/cf-cowork-import.js (cfReadExportFile)
// Notes: docs/notes/content/cf-migrate-source.js.md

// 'short' or 'full' as chosen on the settings page. Nothing stored means full reconstruction,
// the request share and Cowork imports sent before the setting existed.
async function cfMigrationStyle() {
  try {
    const stored = await chrome.storage.local.get(MIGRATION_REQUEST_KEY);
    return stored[MIGRATION_REQUEST_KEY] === 'short' ? 'short' : 'full';
  } catch (e) {
    console.log('[IMPORT] The request style was not read:', e.message);
    return 'full';
  }
}

function cfMigrationPrompt(item) {
  const intro = `Attached is the exported transcript of "${item.title}" from my other Claude account. `;
  if (item.style === 'short') return intro + 'Read it as the history of this chat and reply only with: Imported.';
  return intro + 'Reconstruct it here as our working context. Summarize what was asked and what was concluded, ' +
    'list the key facts, decisions and open questions, and keep any code, documents or drafts from it intact. ' +
    'Then treat that conversation as ours and continue from where it ended.';
}

// The export file is attached as it is on disk, and the new chat is filed in the folder planned for it
// (content/cf-migrate.js cfMigrationFolderId)
async function cfMigrateImportSource(item) {
  return {
    sourceId: item.sourceId,
    surface: 'chat',
    filename: item.filename,
    attachMarkdown: await cfReadExportFile(item.filename),
    prompt: cfMigrationPrompt(item),
    importedFrom: { chatId: item.sourceId, accountKey: item.accountKey, filename: item.filename },
    folderId: item.folderId,
    folderName: item.folderName,
    category: item.category
  };
}
