// lib/storage-keys.js
// Names the chrome.storage.local keys shared by the content scripts and the extension pages.
// Globals: QUEUED_EXPORTS_KEY, EXPORTED_CHATS_KEY, EXPORT_STATE_KEY, ACCOUNT_VIEW_DEFAULT_KEY,
//          ACCOUNT_VIEW_KEY_PREFIX, CLAUDE_SHELL_KEY_PREFIX, ORGANIZER_LAYOUT_KEY, ORGANIZE_INDEX_KEY_PREFIX,
//          SETTINGS_LAYOUT_KEY, MIGRATION_REQUEST_KEY, RUN_STATE_KEY, SETUP_STEPS_OPEN_KEY, AUTO_SYNC_KEY, AUTO_SYNC_DEFAULT,
//          AUTO_SYNC_MINUTES, AUTO_SYNC_LAST_KEY, HELP_ON_OPEN_KEY, MONITORED_NEW_CHATS_KEY_PREFIX,
//          UPDATE_CHECK_KEY, UPDATE_DISMISSED_KEY, ORGANIZER_HOME_VIEW_KEY, CHAT_LIST_SORT_KEY, BUTTON_COLOR_KEY,
//          BUTTON_COLOR_DEFAULT, BUTTON_COLOR_ORGANIZER_KEY, ACTIVITY_LOG_KEY, ACTIVITY_LOG_CHUNK_PREFIX,
//          ACTIVITY_LOG_CHUNK, ACTIVITY_LOG_MAX, LOG_PAGE_SIZE_KEY, LOG_PAGE_SIZES, LOG_PAGE_SIZE_DEFAULT
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

// The last read of the version on GitHub: { checkedAt, latest, error } (lib/update-check.js)
const UPDATE_CHECK_KEY = 'cfUpdateCheck';
// The GitHub version whose notice was hidden with × (lib/update-notice.js)
const UPDATE_DISMISSED_KEY = 'cfUpdateDismissed';

// The organizer home's view: 'categories', 'cards' or 'list' (organizer/home-views.js). Categories until changed.
const ORGANIZER_HOME_VIEW_KEY = 'cfOrganizerHomeView';
// Sort by of the organizer's chat lists: { key, dir } (organizer/chat-sort.js)
const CHAT_LIST_SORT_KEY = 'cfChatListSort';

// The color of the orange buttons on claude.ai and in the popup, as #rrggbb. Set on the settings page.
// Nothing stored keeps the colors in inject.css and popup/popup.css (lib/button-color.js).
const BUTTON_COLOR_KEY = 'cfButtonColor';
const BUTTON_COLOR_DEFAULT = '#c48135';
// true applies the button color to the organizer and its chat view too. Off until checked on the settings page.
const BUTTON_COLOR_ORGANIZER_KEY = 'cfButtonColorOrganizer';

// The activity log shown on the settings page's Log tab (lib/activity-log.js). ACTIVITY_LOG_KEY holds the index
// { chunks: [chunk numbers, oldest first] }. Each chunk is [{ at, kind, text }], oldest first, stored under
// ACTIVITY_LOG_CHUNK_PREFIX + its number with up to ACTIVITY_LOG_CHUNK entries. A new entry rewrites the newest chunk only.
// The oldest chunk is removed once more than ACTIVITY_LOG_MAX entries would be kept.
const ACTIVITY_LOG_KEY = 'cfActivityLog';
const ACTIVITY_LOG_CHUNK_PREFIX = 'cfActivityLog__';
const ACTIVITY_LOG_CHUNK = 500;
const ACTIVITY_LOG_MAX = 50000;

// Entries per page on the Log tab, chosen in its dropdown: a number of LOG_PAGE_SIZES, or 'all'
const LOG_PAGE_SIZE_KEY = 'cfLogPageSize';
const LOG_PAGE_SIZES = [20, 50, 100, 250, 1000, 'all'];
const LOG_PAGE_SIZE_DEFAULT = 50;
