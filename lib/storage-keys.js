// lib/storage-keys.js
// Names the chrome.storage.local keys shared by the content scripts and the extension pages.
// Globals: QUEUED_EXPORTS_KEY, EXPORTED_CHATS_KEY, EXPORT_STATE_KEY, ACCOUNT_VIEW_DEFAULT_KEY,
//          ACCOUNT_VIEW_KEY_PREFIX, CLAUDE_SHELL_KEY_PREFIX, ORGANIZER_LAYOUT_KEY, ORGANIZE_INDEX_KEY_PREFIX,
//          MIGRATION_REQUEST_KEY, RUN_STATE_KEY
// Notes: docs/notes/lib/storage-keys.js.md

// Exports waiting for folder access, as [{ filename, content, chatId, queuedAt, lastError }]
const QUEUED_EXPORTS_KEY = 'cfQueuedExports';

// Export time per chat id, as { [chatId]: isoString }
const EXPORTED_CHATS_KEY = 'exportedChats';

// Each export's file name, its time and the conversation's state then, as
// { [chatId]: { filename, mark, exportedAt } } (lib/export-state.js)
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

// The chat ids in the order the last Ask Claude to Organize request numbered them, per login
const ORGANIZE_INDEX_KEY_PREFIX = 'organizeIndex__';

// The request sent with each chat imported from another account: 'short' or 'full'. Set on the settings page.
const MIGRATION_REQUEST_KEY = 'cfMigrationRequest';

// The sync or export run of a claude.ai tab, read by the popup and organizer panes:
// { run, text, done, lines, files, error, startedAt, at } (content/cf-run-state.js)
const RUN_STATE_KEY = 'cfRunState';
