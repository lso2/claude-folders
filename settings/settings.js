// settings/settings.js
// Starts the settings page: draws each section and wires its controls.
// Globals: SETTINGS_SIDEBAR_IDS, renderSettings, startSettingsSidebar
// Depends on: settings/settings-folder.js, settings/settings-accounts.js, settings/settings-helper.js,
//             settings/settings-about.js, settings/settings-clear.js, settings/settings-migration.js,
//             settings/settings-auto-sync.js, settings/settings-button-color.js,
//             lib/folder-picker.js (cfOpenPickerFlag), lib/sidebar-layout.js (the organizer's sidebar frame),
//             lib/storage-keys.js (SETTINGS_LAYOUT_KEY), background.js (openOrganizer)
// Notes: docs/notes/settings/settings.js.md

async function renderSettings() {
  await Promise.all([
    renderFolderSection(),
    renderAccountsSection(),
    renderAccountViewChoice(),
    renderHelperSection(false),
    renderAboutSection(),
    renderClearSection(),
    renderMigrationChoice(),
    renderAutoSyncSection(),
    renderButtonColorSection()
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
document.getElementById('migrationOpen').addEventListener('click', openMigrationDialog);
document.getElementById('settingsOrganizerBtn').addEventListener('click', () => {
  chrome.runtime.sendMessage({ action: 'openOrganizer' }).catch(e => console.log('[SETTINGS] Organizer not opened:', e.message));
});

// A tab shown again reads everything again, after an install or a sync elsewhere
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') renderSettings();
});

// The sidebar has the organizer's width, collapse button and drag edge, stored for this page
const SETTINGS_SIDEBAR_IDS = { sidebar: 'settingsSidebar', toggle: 'settingsSidebarToggle', resizer: 'settingsSidebarResizer' };

async function startSettingsSidebar() {
  const layout = await cfReadSidebarLayout(SETTINGS_LAYOUT_KEY);
  cfApplySidebarLayout(layout, SETTINGS_SIDEBAR_IDS);
  cfSetupSidebarFrame(layout, SETTINGS_LAYOUT_KEY, SETTINGS_SIDEBAR_IDS);
}

startSettingsSidebar();
renderSettings();
