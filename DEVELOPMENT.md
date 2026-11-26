# Claude Folders Development

The extension's files and the browser APIs it uses. Installation and usage are in [README.md](README.md).

## Project Structure
```
claude-folders-extension/
├── manifest.json          # Extension configuration and the content-script load order
├── background.js          # Service worker, message handling
├── offscreen.html/js      # Data-folder writes
├── inject.css             # Styles for everything injected into claude.ai
├── content/               # Content-script parts, loaded in manifest order
│   ├── cf-state.js        # Shared state
│   ├── cf-text.js         # Glyph stripping and escaping
│   ├── cf-routes.js       # Page routes and titles
│   ├── cf-account.js      # Account key, the account's email and storage keys
│   ├── cf-account-view.js # Account dropdown in the Folders panel and the folders it shows
│   ├── cf-account-info.js # Signed-in name, initial and team from Claude's account row
│   ├── cf-notify.js       # Notices, confirmations, progress readout
│   ├── cf-data.js         # Folder data load
│   ├── cf-pending.js      # A sync or organize request left for this tab by a previous page or the background
│   ├── cf-styles.js       # Runtime stylesheet of the Folders panel and its modals
│   ├── cf-sidebar.js      # Folders and Groups rows in Claude's sidebar
│   ├── cf-header-buttons.js # Folders and Groups buttons in the sidebar header
│   ├── cf-row-hover.js    # Hover look of the Folders or Groups row while its panel is open
│   ├── cf-panel-host.js   # The layer of Claude's page the panels are added to
│   ├── cf-panel.js        # Folders flyout panel
│   ├── cf-folder-pane.js  # A folder's chats in the pane beside the Folders panel
│   ├── cf-groups-panel.js # Groups flyout panel
│   ├── cf-group-pane.js   # A group's chats in the pane beside the Groups panel
│   ├── cf-group-sync.js   # Claude's groups and their folders synced from a claude.ai tab
│   ├── cf-drag.js         # Chats dragged onto folders and groups
│   ├── cf-group-drop.js   # A dragged chat's place in a group's list
│   ├── cf-sidebar-drag.js # Chats dragged from Claude's sidebar onto the panels
│   ├── cf-push.js         # The Chats page's list moved right of an open panel
│   ├── cf-chat.js         # Buttons on chat, Cowork, Claude Code and shared-chat pages
│   ├── cf-picker.js       # Folder picker of Add to folder, for a chosen folder or a new one
│   ├── cf-url-watch.js    # Claude's page navigation, with the injected rows and buttons put back after re-renders
│   ├── cf-export*.js      # Single and bulk exports, their records and the export button's state
│   ├── cf-reveal.js       # Show in folder through the Claude Folders Helper
│   ├── cf-tooltip.js      # Hover tooltips
│   ├── cf-disk.js         # Export writes and folder access prompts
│   ├── cf-import*.js      # Chat import, its registry, the import dialog and the run's Pause, Resume and Stop
│   ├── cf-migrate*.js     # The plan for importing another account's chats, and the panel's import button
│   ├── cf-organize*.js    # Organize in One Click, Ask Claude to Organize and applying Claude's answer
│   ├── cf-panel-analytics.js # Category chart and totals in the Folders panel's analytics view
│   ├── cf-tab-request.js  # The request stored for a claude.ai tab opened by the organizer
│   ├── cf-run-state.js    # Progress and result of a sync or export for the popup and organizer
│   ├── cf-shell-*.js      # Claude's sidebar and account menu for the organizer
│   ├── cf-project-import.js # Import button on a project's Activity tab
│   ├── cf-composer.js     # Claude's message composer
│   ├── cf-sync*.js        # Conversation sync and its summary
│   ├── cf-cowork-sync.js  # Cowork and Claude Code sessions for a sync
│   ├── cf-cowork-import.js # Attachment and request of a Cowork session imported from another account
│   ├── cf-monitor.js      # New-chat monitor
│   ├── cf-build-check.js  # Reload check for a background older than the page scripts
│   ├── cf-core.js         # Start of every content-script part on page load, and the background's broadcasts
│   └── cf-boot.js         # Boot check and entry point
├── lib/                   # Shared by the content scripts and the extension pages
│   ├── chat-markdown.js   # Markdown format and export filenames
│   ├── chat-exporter.js   # Conversation reads from Claude's API
│   ├── cowork-api.js      # Cowork and Claude Code session and event reads
│   ├── cowork-markdown.js # Cowork and Claude Code event logs to markdown
│   ├── cowork-export.js   # One Cowork or Claude Code session's export
│   ├── share-snapshots.js # Shared chat and project activity reads
│   ├── handle-storage.js  # Data folder handle and access state
│   ├── folder-state.js    # The folder writer's state as one status line for the popup and settings page
│   ├── folder-worker.js   # Background requests to the offscreen folder writer, each with a time limit
│   ├── folder-ops.js      # One data-folder operation, run in the offscreen document
│   ├── folder-tab.js      # The settings page's Data folder section, opened or focused
│   ├── claude-groups.js   # Claude's sidebar groups read and changed in its settings store
│   ├── group-folders.js   # The folders linked to Claude's groups matched to them
│   ├── group-pushes.js    # Folder edits on group folders queued as group changes
│   ├── data-file.js       # data.json and the standalone library
│   ├── library-refresh.js # The offline library's page and files written again after an update or a folder change
│   ├── export-files.js    # chats/ folder reads and writes
│   ├── export-state.js    # Each export's file name and the conversation's state then
│   ├── export-render.js   # An exported chat's markdown as the HTML page of View Offline
│   ├── export-page.js     # The View Offline page, or the reason no chat is shown
│   ├── export-page.css    # Styles of the View Offline page
│   ├── folder-access.js   # Choosing the data folder and allowing its access, from the settings page
│   ├── storage-keys.js    # Shared storage key names
│   ├── folder-picker.js   # Folder picker check and the Brave flag page
│   ├── build-reload.js    # One guarded extension reload
│   ├── background-build.js # Background build number and its start check
│   ├── helper-host.js     # Background calls to the Claude Folders Helper
│   ├── account-identity.js # The account recorded in its data, and the account key on each chat
│   ├── accounts.js        # Every account with folder data, for the panel and the settings page
│   ├── account-entries.js # Account dropdown entries from each account's folder data
│   ├── account-files.js   # The account data files in the data folder
│   ├── account-file-list.js # The account data files of one folder, with each file's data
│   ├── account-migrate.js # Move of a login's data from its 1.3.15 key to its login key
│   ├── account-restore.js # A login's folders read back from its data file when storage has none
│   ├── account-view.js    # Account dropdown choices and the folders each one shows
│   ├── account-view-store.js # Each login's account view, shared by the Folders panel, the organizer, and the popup
│   ├── organize-*.js      # Ask Claude to Organize: the request, its tab and applying the answer
│   ├── tab-handoff.js     # A claude.ai tab opened with a request stored under its id
│   ├── shell-address.js   # Links for Claude's sidebar rows and account menu items
│   ├── page-dialog.js     # Designed dialogs and notices for the extension's pages
│   ├── page-frame.css     # Page frame of the organizer and the settings page: sidebar, main column, and footer
│   ├── page-store.js      # One chrome.storage.local value read and stored for the extension's pages
│   ├── sidebar-layout.js  # The resizable, collapsible sidebar of the organizer and the settings page
│   ├── select-size.js     # Each dropdown held at the size of a plain select
│   ├── select-picker.css  # The open list of the extension's dropdowns
│   ├── html-escape.js     # Escaping for innerHTML and attribute values
│   ├── search-*.js        # The content search index of the exports in chats/
│   ├── claude-tab.js      # The claude.ai tab a sync or folder export is run in
│   ├── run-failures.js    # A run's result lines, with links to the chats that failed and nested sub-items
│   ├── auto-sync.js       # Automatic sync on a timer in an open claude.ai tab
│   ├── activity-log.js    # Entries of the activity log on the settings page's Log tab
│   ├── activity-watch.js  # Log entries for runs, settings, folders, and exports
│   ├── activity-kinds.js  # Log categories for entries written before the categories existed
│   ├── button-color.js    # The button color chosen on the settings page, applied and followed
│   ├── color-variants.js  # The chosen button color as --cf-base
│   ├── color-variants.css # Every orange of the extension as a relative color of the chosen one
│   ├── first-run.js       # The settings page opened on Help after install
│   ├── update-check.js    # The version published on GitHub compared with the running one
│   ├── update-notice.js   # The notice for a newer version on GitHub, and the Check for updates answer
│   └── apply-update.js    # Applies files updated on disk
├── popup/                 # Toolbar popup
├── organizer/             # Full organizer page
├── standalone/            # Offline viewer copied into the data folder
├── update/                # Extension page that reloads an out-of-date extension
├── settings/              # Settings page: data folder, accounts, helper and version
├── icons/                 # Extension icons
├── screens/               # Screenshots for FEATURES.md and this README
├── native-host/           # PowerShell version of the Claude Folders Helper, with install.ps1 and uninstall.ps1
└── tools/check-project.js # Project checker
```

## Key APIs Used
- **File System Access API**: Read/write to user-selected folder
- **IndexedDB**: Store folder handle reference across sessions, and the content search index
- **Chrome Extension APIs**: Messaging, storage, tabs
- **MutationObserver**: Detect new chats in Claude.ai sidebar
