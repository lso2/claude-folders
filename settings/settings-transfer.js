// settings/settings-transfer.js
// Saves the extension's settings as a JSON file and reads such a file back in.
// Globals: SETTINGS_FILE_APP, SETTINGS_FILE_CHECKS, settingsFileCheck, exportSettingsFile, importSettingsFile
// Depends on: lib/storage-keys.js (the setting key names), settings/settings-format.js (settingsShowResult),
//             settings/settings.js (renderSettings)
// Notes: docs/notes/settings/settings-transfer.js.md

const SETTINGS_FILE_APP = 'claude-folders-settings';

// Each setting saved in the file, with the check its value must pass when a file is read in.
// Folder data, sync watermarks and export records are not settings and are left out.
const SETTINGS_FILE_CHECKS = {
  [ACCOUNT_VIEW_DEFAULT_KEY]: v => v === 'this' || v === 'all',
  [MIGRATION_REQUEST_KEY]: v => v === 'short' || v === 'full',
  [SETUP_STEPS_OPEN_KEY]: v => typeof v === 'boolean',
  [AUTO_SYNC_KEY]: v => !!v && typeof v.enabled === 'boolean' && AUTO_SYNC_MINUTES.includes(v.minutes),
  [ORGANIZER_LAYOUT_KEY]: v => !!v && Number.isFinite(v.width) && typeof v.collapsed === 'boolean',
  [SETTINGS_LAYOUT_KEY]: v => !!v && Number.isFinite(v.width) && typeof v.collapsed === 'boolean',
  [ORGANIZER_HOME_VIEW_KEY]: v => ['list', 'cards', 'categories'].includes(v),
  [CHAT_LIST_SORT_KEY]: v => !!v && ['name', 'recent', 'oldest', 'exported'].includes(v.key) && (v.dir === 'asc' || v.dir === 'desc')
};

// The check for a key: a fixed setting, or a login's Folders panel view (ACCOUNT_VIEW_KEY_PREFIX + account key)
function settingsFileCheck(key) {
  if (SETTINGS_FILE_CHECKS[key]) return SETTINGS_FILE_CHECKS[key];
  if (key.startsWith(ACCOUNT_VIEW_KEY_PREFIX)) return v => typeof v === 'string' && /^(all|acct:.+|org:[^:]+:.*)$/.test(v);
  return null;
}

async function exportSettingsFile() {
  const result = document.getElementById('settingsFileResult');
  try {
    const all = await chrome.storage.local.get(null);
    const settings = {};
    Object.keys(all).filter(key => settingsFileCheck(key)).sort().forEach(key => { settings[key] = all[key]; });
    const file = { app: SETTINGS_FILE_APP, version: chrome.runtime.getManifest().version, exportedAt: new Date().toISOString(), settings };
    const url = URL.createObjectURL(new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'claude-folders-settings.json';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const count = Object.keys(settings).length;
    settingsShowResult(result, `${count} setting${count === 1 ? '' : 's'} saved to claude-folders-settings.json.`, false);
  } catch (e) {
    settingsShowResult(result, `${e.name}: ${e.message}`, true);
  }
}

// Settings that fail their check, or that this version does not have, are skipped and named in the result
async function importSettingsFile(file) {
  const result = document.getElementById('settingsFileResult');
  try {
    const parsed = JSON.parse(await file.text());
    if (!parsed || parsed.app !== SETTINGS_FILE_APP || !parsed.settings || typeof parsed.settings !== 'object') {
      settingsShowResult(result, `${file.name} is not a Claude Folders settings file: it has no "app": "${SETTINGS_FILE_APP}" and "settings" object.`, true);
      return;
    }
    const accepted = {};
    const skipped = [];
    Object.entries(parsed.settings).forEach(([key, value]) => {
      const check = settingsFileCheck(key);
      if (check && check(value)) accepted[key] = value;
      else skipped.push(key);
    });
    await chrome.storage.local.set(accepted);
    const count = Object.keys(accepted).length;
    const text = `${count} setting${count === 1 ? '' : 's'} read from ${file.name}.` + (skipped.length ? ` Skipped: ${skipped.join(', ')}.` : '');
    settingsShowResult(result, text, false);
    await renderSettings();
  } catch (e) {
    settingsShowResult(result, `${file.name} was not read: ${e.name}: ${e.message}`, true);
  }
}

document.getElementById('settingsExport').addEventListener('click', exportSettingsFile);
document.getElementById('settingsImport').addEventListener('click', () => document.getElementById('settingsImportFile').click());
document.getElementById('settingsImportFile').addEventListener('change', (e) => {
  const file = e.target.files && e.target.files[0];
  e.target.value = '';
  if (file) importSettingsFile(file);
});
