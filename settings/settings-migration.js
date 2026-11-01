// settings/settings-migration.js
// The Import from another account section: the request sent with each imported chat, and opening the import dialog.
// Globals: renderMigrationChoice, onMigrationChange, openMigrationDialog
// Depends on: lib/storage-keys.js (MIGRATION_REQUEST_KEY), settings/settings-format.js (settingsShowResult),
//             background.js (openImportDialog)
// Notes: docs/notes/settings/settings-migration.js.md

// Nothing stored means the short request (content/cf-migrate-source.js cfMigrationStyle)
async function renderMigrationChoice() {
  let value = 'short';
  try {
    const stored = await chrome.storage.local.get(MIGRATION_REQUEST_KEY);
    if (stored[MIGRATION_REQUEST_KEY] === 'full') value = 'full';
  } catch (e) {
    console.log('[SETTINGS] The import request was not read:', e.message);
  }
  document.querySelectorAll('input[name="migrationRequest"]').forEach(input => { input.checked = input.value === value; });
}

async function onMigrationChange(e) {
  const result = document.getElementById('migrationResult');
  try {
    await chrome.storage.local.set({ [MIGRATION_REQUEST_KEY]: e.target.value });
    settingsShowResult(result, e.target.value === 'short'
      ? 'Saved. Imported chats get the short request.'
      : 'Saved. Imported chats get the full reconstruction request.', false);
  } catch (err) {
    settingsShowResult(result, `${err.name}: ${err.message}`, true);
  }
}

// The background opens the import dialog in a new claude.ai tab, for the signed-in login, and the import runs there
async function openMigrationDialog() {
  const result = document.getElementById('migrationResult');
  let answer = null;
  try {
    answer = await chrome.runtime.sendMessage({ action: 'openImportDialog', accountKey: null });
  } catch (e) {
    answer = { success: false, error: e.message };
  }
  if (!answer || !answer.success) settingsShowResult(result, 'The import dialog did not open: ' + ((answer && answer.error) || 'the background answered nothing'), true);
}
