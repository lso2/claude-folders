// settings/settings-migration.js
// The request chosen for chats imported from another account: full reconstruction or a short request.
// Globals: renderMigrationChoice, onMigrationChange
// Depends on: lib/storage-keys.js (MIGRATION_REQUEST_KEY), settings/settings-format.js (settingsShowResult)
// Notes: docs/notes/settings/settings-migration.js.md

// Nothing stored means full reconstruction (content/cf-migrate-source.js cfMigrationStyle)
async function renderMigrationChoice() {
  let value = 'full';
  try {
    const stored = await chrome.storage.local.get(MIGRATION_REQUEST_KEY);
    if (stored[MIGRATION_REQUEST_KEY] === 'short') value = 'short';
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
