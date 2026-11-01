// lib/storage-keys.js
// Names the chrome.storage.local keys shared by the content scripts and the extension pages.
// Globals: QUEUED_EXPORTS_KEY, EXPORTED_CHATS_KEY, EXPORT_STATE_KEY, ACCOUNT_VIEW_DEFAULT_KEY,
//          ACCOUNT_VIEW_KEY_PREFIX, CLAUDE_SHELL_KEY_PREFIX, ORGANIZER_LAYOUT_KEY, ORGANIZE_INDEX_KEY_PREFIX,
//          SETTINGS_LAYOUT_KEY, MIGRATION_REQUEST_KEY, RUN_STATE_KEY, SETUP_STEPS_OPEN_KEY, AUTO_SYNC_KEY, AUTO_SYNC_DEFAULT,
//          AUTO_SYNC_MINUTES, AUTO_SYNC_LAST_KEY, HELP_ON_OPEN_KEY, MONITORED_NEW_CHATS_KEY_PREFIX
// Notes: docs/notes/lib/storage-keys.js.md

// Exports waiting for folder access, as [{ filename, content, chatId, queuedAt, lastError }]
const QUEUED_EXPORTS_KEY = 'cfQueuedExports';

// Export time per chat id, as { [chatId]: isoString }
const EXPORTED_CHATS_KEY = 'exportedChats';

// Each export's file name, its time and the conversation's state then, as
// { [chatId]: { filename, mark, format, exportedAt } } (lib/export-state.js)
const EXPORT_STATE_KEY = 'cfExportState';

// What the Folders panel shows for a login without a choice of its own: 'this' or 'all'.
// Set on the settings page.
const ACCOUNT_VIEW_DEFAULT_KEY = 'cfAccountViewDefault';

// Each login's choice in the panel's account dropdown is stored under this prefix and the
// login's account key: 'all', 'acct:<key>' or 'org:<key>:<org id>'
const ACCOUNT_VIEW_KEY_PREFIX = 'accountView__';

// Claude's sidebar rows and account menu as last read on claude.ai, per login (content/cf-shell-capture.js)
const CLAUDE_SHELL_KEY_PREFIX = 'cfClaudeShell__';

// The organizer's sidebar width and collapsed state: { width, collapsed }
const ORGANIZER_LAYOUT_KEY = 'cfOrganizerLayout';

// The settings page's sidebar width and collapsed state: { width, collapsed } (lib/sidebar-layout.js)
const SETTINGS_LAYOUT_KEY = 'cfSettingsLayout';

// The chat ids in the order the last Ask Claude to Organize request numbered them, per login
const ORGANIZE_INDEX_KEY_PREFIX = 'organizeIndex__';

// The request sent with each chat imported from another account: 'short' or 'full'. Set on the settings page.
const MIGRATION_REQUEST_KEY = 'cfMigrationRequest';

// The sync or export run of a claude.ai tab, read by the popup and organizer panes:
// { run, text, done, lines, files, error, startedAt, at } (content/cf-run-state.js)
const RUN_STATE_KEY = 'cfRunState';

// The square-check's last choice for the organize steps, shared by the Folders panel and the popup:
// true shown, false collapsed, missing before the first click (content/cf-panel.js, popup/popup.js)
const SETUP_STEPS_OPEN_KEY = 'cfSetupStepsOpen';

// Automatic sync, set on the settings page: { enabled, minutes } (lib/auto-sync.js). Hourly until changed there.
const AUTO_SYNC_KEY = 'cfAutoSync';
const AUTO_SYNC_DEFAULT = { enabled: true, minutes: 60 };
// The intervals the settings page offers, in minutes
const AUTO_SYNC_MINUTES = [15, 30, 60, 120, 240];

// The last automatic sync attempt: { at, started, text }, written by lib/auto-sync.js and content/cf-sync.js
const AUTO_SYNC_LAST_KEY = 'cfAutoSyncLast';

// Set when the extension is installed. The settings page opens on Help once and removes it (settings/settings-tabs.js).
const HELP_ON_OPEN_KEY = 'cfHelpOnOpen';

// The new chats the claude.ai sidebar monitor found since the last sync, per login: this prefix and the
// login's account key (content/cf-account.js cfMonitorKey). The popup's sync icon reads it.
const MONITORED_NEW_CHATS_KEY_PREFIX = 'monitoredNewChats__';
