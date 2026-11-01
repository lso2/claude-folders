// settings/settings.js
// Starts the settings page: draws each section and wires its controls.
// Globals: renderSettings
// Depends on: settings/settings-folder.js, settings/settings-accounts.js, settings/settings-helper.js,
//             settings/settings-about.js, settings/settings-clear.js, settings/settings-migration.js,
//             lib/folder-picker.js (cfOpenPickerFlag)
// Notes: docs/notes/settings/settings.js.md

async function renderSettings() {
  await Promise.all([
    renderFolderSection(),
    renderAccountsSection(),
    renderAccountViewChoice(),
    renderHelperSection(false),
    renderAboutSection(),
    renderClearSection(),
    renderMigrationChoice()
  ]);
}

settingsFolderEls.grant.addEventListener('click', onFolderGrantClick);
settingsFolderEls.choose.addEventListener('click', onFolderChooseClick);
settingsFolderEls.flag.addEventListener('click', () => cfOpenPickerFlag());
document.getElementById('helperCheck').addEventListener('click', () => renderHelperSection(true));
clearEls.start.addEventListener('click', onClearClick);
clearEls.yes.addEventListener('click', onClearConfirm);
clearEls.no.addEventListener('click', onClearCancel);
document.querySelectorAll('input[name="accountView"]').forEach(input => input.addEventListener('change', onAccountViewChange));
document.querySelectorAll('input[name="migrationRequest"]').forEach(input => input.addEventListener('change', onMigrationChange));

// A tab shown again reads everything again, after an install or a sync elsewhere
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderSettings();
});

renderSettings();
