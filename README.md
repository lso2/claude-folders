# Claude Folders

![Brave](https://img.shields.io/badge/Brave-1.85%2B-ff5500.svg?logo=microsoftedge&logoColor=white)
![Chrome](https://img.shields.io/badge/Chrome-102%2B-4285F4.svg?logo=googlechrome&logoColor=white)
![Chromium](https://img.shields.io/badge/Chromium-143%2B-569bda.svg?logo=chromium&logoColor=white)
![Edge](https://img.shields.io/badge/Claude-4.5%2B-bf603b.svg?logo=microsoftedge&logoColor=white)
![License](https://img.shields.io/badge/License-GPLv3-orange.svg)

A Chrome extension that adds folder organization, markdown export, and offline viewing to Claude.ai conversations. All data stays on your computer - no cloud sync, no accounts, complete privacy.

See [CHANGELOG.md](CHANGELOG.md) for release notes.

## Summary

Claude Folders transforms Claude.ai's flat conversation list into an organized folder system with:

- **📁 Folder Organization**: Create folders, assign categories, organize hundreds of chats
- **Organize in One Click**: Chat titles are sent to Claude and step 2 runs automatically
- **Content Search**: The organizer's search matches both the titles and text of exported chats
- **📝 Markdown Export**: Automatically export conversations to `.md` files with full content
- **👁️ Offline Viewing**: Read your exported conversations without internet access
- **🔄 Passive Sync**: Monitors for new chats and shows a sync bar as soon as one is ready to import
- **📥 Shared Chat Import**: Chats shared with you are imported as new chats in your account, with the transcript attached
- **Cowork Sessions**: Cowork sessions are synced into folders and exported to markdown. Exports from another account are imported as Cowork tasks
- **Account Import**: Another account's chats and Cowork sessions can be imported into matching folders from the Folders panel or the organizer, with Pause, Resume and Stop
- **📚 Full Account Import**: Reads every organization connected to your login
- **📊 Analytics**: View category distribution and folder statistics
- **💾 Local Storage**: All data stored in a folder you choose on your computer
- **🎨 Native Feel**: UI integrates seamlessly with Claude.ai's design

## Features

### Folder Management
- Create unlimited folders with custom names and descriptions
- Assign folders to categories (Business, Personal, Development, etc.)
- Move chats between folders with drag-and-drop or menu
- Search and filter folders by name or category
- Category pills show each category's folder count, with empty categories last
- View chat count and last activity per folder

### Folders Panel
- Clicking **Folders** in Claude's sidebar opens the panel beside it
- At the top are **Organize in One Click** and the 2 steps, **Ask Claude to Organize** and **Apply Claude's Response**. The square-check button shows and hides them
- The account dropdown is under them, with **Import from another account** below it while another account has chats
- Clicking a folder opens its chats in a second pane to the right of the panel, with full titles, 30 at a time with **Load more**
- Clicking the folder again, the pane's **×** or pressing Escape closes the pane

### Content Search
- Typing 2 or more characters in the organizer's search box lists the chats whose title has the typed text or whose export in `chats/` has every typed word
- Title matches are listed before export matches, newest first in each, 50 at a time
- A chat matched by its export shows an excerpt with the match marked. Clicking **View export** opens the export in a new tab
- The folder grid also shows the folders holding the listed chats
- On the first search, the words of every export are indexed in the browser, with the progress in the search status. Later searches index only new and changed exports

### Organizing with Claude
Claude sorts your chat titles into categories and folders. The request is automatically inserted and sent in a claude.ai tab, and Claude's answer is read from that page.

- Clicking **Organize in One Click** in the Folders panel or the popup, or **Organize** in the organizer, opens a new claude.ai tab and sends the request with your chat titles
- When Claude's answer is finished, the preview of its categories and folders is shown in that tab. Clicking **Apply & Save** files the chats, and nothing is saved before that click
- When the answer is not finished within 10 minutes, a notice with **Read the answer now** is shown
- After a reload of the tab while Claude answers, the preview is shown when that chat's answer is finished
- In 2 steps: clicking **Ask Claude to Organize** opens a new claude.ai tab with the request in the message box, for sending by hand. Pasting Claude's JSON answer into **Apply Claude's Response**, then clicking **Preview Categories** and **Apply & Save**, files the chats

### Markdown Export
- Export individual chats or bulk export all conversations
- Full conversation content including all messages and responses
- Automatic filename generation: `{first 8 characters of the chat id}_{title}.md`, and `{session id}_{title}.md` for Cowork sessions
- Skip already-exported files (no duplicates)
- Exports stored in `/chats/` subfolder within your data directory

### Shared Chats
- Shared chats (`claude.ai/share/...`) show **Export** and **Import** at the top right
- Clicking **Export** saves the shared transcript to `chats/` in your data folder
- Clicking **Import** exports the transcript, starts a new chat with the file attached, and asks Claude to reconstruct the conversation
- In a project's **Activity** tab, a button appears above the chats others shared. It reads **Import N shared chats** when some are not imported yet, and clicking it imports them one at a time after a confirmation showing the count. With all of them imported it reads **Import shared chats** and offers to import them again
- Imported chats are filed under the **Shared** category in a folder named for their project
- Chats already imported are skipped, including imports made in another browser

### Cowork Sessions
- Cowork sessions (`claude.ai/cowork/...`) show **Export** and **Add to folder** beside the session title
- Clicking **Export** saves the whole session to `chats/`: your messages, Claude's replies, tool calls and tool results
- Syncing stores Cowork sessions in the folders beside your chats and exports the new ones. Their rows in the folders panel have a **Cowork** label

### Moving Cowork Sessions to Another Account
- Export the sessions in the first account with **Export** or a sync
- In the other account, **Import from another account** in the Folders panel imports them as Cowork tasks (below)

### Importing Another Account's Chats
- Choose the same data folder in both accounts. Syncing the first account exports its chats to `chats/`
- In the second account, click **Import from another account** under the account dropdown in the Folders panel, or beside the account dropdown in the organizer. Clicking the organizer's button opens the dialog in a new claude.ai tab, and the import is run in that tab
- The dialog has the account to import from (**All other accounts** is the first choice with 2 or more), the account to import into, and the number of chats and Cowork tasks to import, with the ones skipped as imported before or with no export
- **Request sent with each chat**: **Short** (Claude replies with one line) or **Reconstruct** (Claude replies with a summary of the chat). The choice is saved to the settings page
- **Pause after each batch of 25 chats** is unchecked, and the import is run to the end with no pause. Checking it pauses the import after each batch, with the batch size from 1 to 500
- Clicking **Import N** starts the import. Each chat is started as a new chat with its export attached, and each Cowork session as a Cowork task, one at a time
- Clicking **Pause** or **Stop** on the progress bar pauses or ends the import after the chat in progress. A paused import shows **Resume** and **Stop**
- The popup and the organizer show the import's progress and result
- Each import is filed in this account's folder with the same name and category, or in a new folder of that name
- Clicking **Import from another account** again skips the chats already imported

### Accounts
- Each Claude login has its own folders and its own data file, `data.<account>.json`, in the data folder
- Every organized chat records the account it belongs to, and each account's data file records the account's email and name
- With chats from more than one account, or more than one organization, the Folders panel and the organizer have an account dropdown: **All accounts**, then each account by email with its chat count, and under an account with more than one organization, each organization
- **All accounts** shows the folders of every account in the data folder together, merged by folder name. Chats of another account show its email and open in a browser signed in to that account
- Each signed-in login has its own dropdown choice. The settings page sets what a login without a choice shows
- After a sync, chats held in another account's data are listed only under that account
- A sync gives chats stored without their organization the organization they belong to

### Settings Page
- Opened from the browser's Extension options, the gear button in the popup and the Folders panel, or **Settings** in the organizer
- **Data folder**: the folder and whether the folder writer can save into it, with **Open access window** and **Choose folder**
- **Accounts**: each account with its chats, folders and organizations, and every account data file in the data folder
- **Folders panel**: whether a login opens on its own folders or on all accounts
- **Import from another account**: the request sent with each imported chat, a short request or a full reconstruction. A choice made in the import dialog is saved here
- **Claude Folders Helper**: whether the helper is installed and finds the data folder, with **Check again**
- **Version**: the extension version, its background's build, the extension ID and the last update reload
- **Clear folder data**: clicking **Clear folders** and confirming empties this login's folders. Other accounts' data files are left as they are

### Saved Files and Show in Folder
- After a single export, the Saved notice stays open until its **×** is clicked
- An exported chat or Cowork session with messages newer than its export shows **Export Update**, which writes over the same file, and hovering over it explains this
- Every sync exports the stored chats and Cowork sessions missing from the data folder
- Chrome extensions cannot open File Explorer. On Windows, the Claude Folders Helper does it (setup steps in INSTALL.md). With the helper installed, the file name in the Saved notice is underlined and an exported, current chat shows **Show in folder**. Clicking either opens File Explorer with the file selected
- Without the helper, the Saved notice shows the file name as plain text, and an exported, current chat shows **Export**, which writes over the same file

### Offline Viewing
- Click "View Offline" to read any exported chat
- Styled HTML viewer with proper markdown rendering
- Code syntax highlighting
- Works completely offline after export
- The library page, `index.html` in the data folder, shows each chat's text from `chats/`. Opened from disk, the page needs the data folder chosen once (**Choose folder**) and reading allowed on later visits (**Allow reading**)
- New exports appear in the library with no rebuild step

### Passive Chat Monitor
- Automatically detects new conversations and Cowork sessions in the sidebar
- Shows a sync bar as soon as a new chat is available
- One-click sync to import all new chats
- Smart skip logic - only imports chats not already in folders

### Analytics Dashboard
- Donut chart showing category distribution
- Total chats, folders, and categories overview
- Breakdown of folders by category

## Installation

### Step 1: Download Extension

```bash
git clone https://github.com/yourusername/claude-folders.git
```

Or download and extract the ZIP file.

### Step 2: Load in Chrome

1. Open Chrome and navigate to `chrome://extensions/`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the `claude-folders-extension` folder
5. The extension icon (folder) appears in your toolbar

### Step 3: Select Data Folder

1. Click the extension icon in your toolbar
2. Click **Select Data Folder**
3. Choose or create a folder on your computer (e.g., `Documents/Claude-Data`)
4. Grant permission when prompted
5. Extension is ready to use

### Step 4: Import Your Chats

1. Click the extension icon
2. Click **Sync** at the bottom of the popup
3. The sync is run in the active claude.ai tab, else in another open claude.ai tab, else in a new Recents tab. The popup shows its progress and result
4. Click **Organizer** to view and organize your chats

## Usage

### Organizing Chats

**From Claude.ai:**
- Click the folder icon next to any chat title
- Select a folder from the dropdown
- Chat is instantly assigned

**From Organizer:**
1. Click the extension icon, then **Organizer**
2. Click any folder to view its chats
3. Use the search bar to find folders, and chats by title or exported text
4. Click **View Chat** to open in Claude.ai
5. Click **View Offline** to read the markdown export
6. Click **Download** to save the markdown file

### Creating Folders

1. Open the Organizer
2. Click **+ New folder**
3. Enter folder name and select a category
4. Click Create

### Sync and Export

**All chats, from the popup or the organizer:**
1. Click **Sync**
2. Every chat and Cowork session of this login is read, and the ones missing from `chats/` are exported
3. The popup and the organizer show the progress and the result, with the counts of imported and exported chats
4. In the organizer, clicking **Download** saves the files written by that sync as one combined markdown file

**One folder, from the organizer:**
1. Open a folder this login created
2. Click **Export folder**
3. The folder's chats are saved to `chats/`, and the result appears at the top of the organizer

### Syncing New Chats

**Automatic (Passive Monitor):**
- Extension watches for new chats in Claude.ai sidebar
- Orange bar appears once a new chat is detected
- Click **Sync Now** to import
- Syncing needs a writable data folder. Without one the bar shows the folder state with **Choose folder** or **Grant access**, and the sync starts after access is granted

**Manual:**
- Click **Sync** in the popup or the organizer, or **Sync Now** on the sync bar

## Data Storage

All data is stored locally in the folder you selected:

```
Your-Data-Folder/
├── data.json            # Active account's folder definitions and chat assignments
├── data.<account>.json  # One file per Claude login, so accounts sharing a folder stay separate
├── data.js              # Same data for the standalone offline viewer
├── index.html           # Offline library page, with app.js, styles.css, chat-markdown.js and library-files.js
├── chats/               # Exported markdown files
│   ├── a1b2c3d4_Chat_Title_Here.md
│   ├── e5f6g7h8_Another_Chat.md
│   └── ...
```

### Privacy & Security

- **No cloud sync** - All data stays on your computer
- **No accounts** - No login or registration required
- **No telemetry** - Extension makes no external network requests
- **Portable** - Copy your data folder to any computer
- **Readable format** - JSON and Markdown files you can open anywhere

## File Format

### folders.json
```json
{
  "folders": [
    {
      "id": "folder-uuid",
      "name": "Project Alpha",
      "category": "Business",
      "description": "Client project discussions",
      "chats": [
        {
          "id": "chat-uuid",
          "title": "API Design Discussion",
          "url": "https://claude.ai/chat/...",
          "date": "2025-01-20",
          "tags": []
        }
      ],
      "createdAt": "2025-01-15T10:30:00Z"
    }
  ],
  "categories": ["Business", "Personal", "Development", "Research"]
}
```

### Exported Markdown
```markdown
# Chat Title Here

**Exported:** 2025-01-20
**URL:** https://claude.ai/chat/a1b2c3d4-e5f6-7890-abcd-ef1234567890
**Chat ID:** a1b2c3d4-e5f6-7890-abcd-ef1234567890

---

## Human

User's message here...

---

## Claude

Claude's response here...

---
```

## Browser Compatibility

| Browser | Supported | Notes |
|---------|-----------|-------|
| Chrome | ✅ 102+ | Full support |
| Edge | ✅ 102+ | Full support |
| Brave | ✅ 1.40+ | Needs the `file-system-access-api` flag (see Troubleshooting) |
| Opera | ✅ 88+ | Full support |
| Firefox | ❌ | No File System Access API |
| Safari | ❌ | No File System Access API |

## Troubleshooting

### Extension won't load
- Make sure Developer mode is enabled in `chrome://extensions`
- Check for errors on the extension card
- Click "Reload" on the extension

### Can't select data folder
- Choose an empty folder or one with existing Claude Folders data
- Make sure you have write permissions to the folder
- Try a folder in your Documents directory

### Chats not syncing
- Check that you're logged into Claude.ai
- One login can carry several organizations. The sync reads every one it can, and the console lists them with a count each, so a total lower than you expect shows which organization is short
- Look for errors in the browser console (F12)
- A message about reading the page instead of the API means the conversation list request failed, and that run only covers the rows Claude had loaded

### Export says folder access is needed
- Chrome's folder prompt for this extension has only Allow and Block
- Exports are saved while the Data Folder Access window is open with access granted
- With that window closed, single exports are queued, bulk exports stop before the first chat, and the notice shows **Grant access**
- Clicking **Grant access**, then **Allow access** in the Data Folder Access window, then **Allow** in Chrome's prompt writes the queued exports
- While the folder writer cannot save, the popup shows a banner with **Open access window**, and the settings page shows the same state

### Brave: no data folder can be selected
- In Brave the File System Access API is off by default, and `window.showDirectoryPicker` is missing ([Brave's list of disabled features](https://support.brave.app/hc/en-us/articles/36223805247245-What-does-brave-remove-from-the-Chromium-engine))
- The setup screen, the Data Folder Access window and the sync bar show the reason with an **Open flag** button
- Setting the `file-system-access-api` flag to **Enabled** and restarting Brave makes folder selection available

### Export showing "empty chats"
- Some conversations may have no messages (opened but never used)
- These are skipped automatically - not an error

### Offline view shows "File not found"
- The chat hasn't been exported yet
- Run a sync or click Download first

## Development

### Project Structure
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
│   ├── cf-notify.js       # Notices, confirmations, progress readout
│   ├── cf-data.js         # Folder data load
│   ├── cf-sidebar.js      # Folders row in Claude's sidebar
│   ├── cf-panel.js        # Folders flyout panel
│   ├── cf-folder-pane.js  # A folder's chats in the pane beside the Folders panel
│   ├── cf-chat.js         # Buttons on chat, Cowork and shared-chat pages
│   ├── cf-export*.js      # Single and bulk exports, their records and the export button's state
│   ├── cf-reveal.js       # Show in folder through the Claude Folders Helper
│   ├── cf-tooltip.js      # Hover tooltips
│   ├── cf-disk.js         # Export writes and folder access prompts
│   ├── cf-import*.js      # Chat import, its registry, the import dialog and the run's Pause, Resume and Stop
│   ├── cf-migrate*.js     # The plan for importing another account's chats, and the panel's import button
│   ├── cf-organize*.js    # Organize in One Click, Ask Claude to Organize and applying Claude's answer
│   ├── cf-tab-request.js  # The request stored for a claude.ai tab opened by the organizer
│   ├── cf-run-state.js    # Progress and result of a sync or export for the popup and organizer
│   ├── cf-shell-*.js      # Claude's sidebar and account menu for the organizer
│   ├── cf-project-import.js # Import button on a project's Activity tab
│   ├── cf-composer.js     # Claude's message composer
│   ├── cf-sync*.js        # Conversation sync and its summary
│   ├── cf-cowork-sync.js  # Cowork sessions for a sync
│   ├── cf-cowork-import.js # Attachment and request of a Cowork session imported from another account
│   ├── cf-monitor.js      # New-chat monitor
│   ├── cf-build-check.js  # Reload check for a background older than the page scripts
│   └── cf-boot.js         # Boot check and entry point
├── lib/                   # Shared by the content scripts and the extension pages
│   ├── chat-markdown.js   # Markdown format and export filenames
│   ├── chat-exporter.js   # Conversation reads from Claude's API
│   ├── cowork-api.js      # Cowork session and event reads
│   ├── cowork-markdown.js # Cowork event log to markdown
│   ├── cowork-export.js   # One Cowork session's export
│   ├── share-snapshots.js # Shared chat and project activity reads
│   ├── handle-storage.js  # Data folder handle and access state
│   ├── data-file.js       # data.json and the standalone library
│   ├── export-files.js    # chats/ folder reads and writes
│   ├── export-state.js    # Each export's file name and the conversation's state then
│   ├── folder-access.js   # Re-granting access, writing queued exports
│   ├── storage-keys.js    # Shared storage key names
│   ├── folder-picker.js   # Folder picker check and the Brave flag page
│   ├── build-reload.js    # One guarded extension reload
│   ├── background-build.js # Background build number and its start check
│   ├── helper-host.js     # Background calls to the Claude Folders Helper
│   ├── account-identity.js # The account recorded in its data, and the account key on each chat
│   ├── accounts.js        # Every account with folder data, for the panel and the settings page
│   ├── account-files.js   # The account data files in the data folder
│   ├── account-migrate.js # Move of a login's data from its 1.3.15 key to its login key
│   ├── account-view.js    # Account dropdown choices and the folders each one shows
│   ├── organize-*.js      # Ask Claude to Organize: the request, its tab and applying the answer
│   ├── tab-handoff.js     # A claude.ai tab opened with a request stored under its id
│   ├── shell-address.js   # Links for Claude's sidebar rows and account menu items
│   ├── page-dialog.js     # Designed dialogs and notices for the extension's pages
│   ├── search-*.js        # The content search index of the exports in chats/
│   ├── claude-tab.js      # The claude.ai tab a sync or folder export is run in
│   └── apply-update.js    # Applies files updated on disk
├── access/                # Data folder access window
├── popup/                 # Toolbar popup
├── organizer/             # Full organizer page
├── standalone/            # Offline viewer copied into the data folder
├── update/                # Extension page that reloads an out-of-date extension
├── settings/              # Settings page: data folder, accounts, helper and version
├── helper/                # Claude Folders Helper for Windows: Visual Studio project and Inno Setup script
└── tools/check-project.js # Project checker
```

### Key APIs Used
- **File System Access API** - Read/write to user-selected folder
- **IndexedDB** - Store folder handle reference across sessions, and the content search index
- **Chrome Extension APIs** - Messaging, storage, tabs
- **MutationObserver** - Detect new chats in Claude.ai sidebar

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test thoroughly on Chrome
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Author

TechReader - [TechReader](https://techreader.com)

## License

GPLv3 - See LICENSE file for details

---

**⭐ If this extension saved you time organizing your Claude conversations, please star the repository!**

## 💖 Support This Project

If Claude Folders has helped you stay organized, consider supporting its development!

**[Donate](https://plexpixel.com/donate)**

**Why donate?**
- ☕ Fuel continued development
- 🚀 Support new features like search, tagging, and more
- 🐛 Faster bug fixes and updates
- 📚 Better documentation

---

*Made with ❤️ for the Claude.ai community*
