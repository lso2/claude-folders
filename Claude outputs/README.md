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
- **📝 Markdown Export**: Automatically export conversations to `.md` files with full content
- **👁️ Offline Viewing**: Read your exported conversations without internet access
- **🔄 Passive Sync**: Monitors for new chats and shows a sync bar as soon as one is ready to import
- **📥 Shared Chat Import**: Chats shared with you are imported as new chats in your account, with the transcript attached
- **Cowork Sessions**: Cowork sessions are synced into folders and exported to markdown, and exports from another account are imported as Cowork tasks
- **📚 Full Account Import**: Reads every organization your login can reach, not just the active one, and not just the visible rows
- **📊 Analytics**: View category distribution and folder statistics
- **💾 Local Storage**: All data stored in a folder you choose on your computer
- **🎨 Native Feel**: UI integrates seamlessly with Claude.ai's design

## Features

### Folder Management
- Create unlimited folders with custom names and descriptions
- Assign folders to categories (Business, Personal, Development, etc.)
- Move chats between folders with drag-and-drop or menu
- Search and filter folders by name or category
- View chat count and last activity per folder

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
- In the other account, with the same data folder chosen, open **Chats and tasks**. A button above the list reads **Import N Cowork chats** while the data folder has Cowork exports from another account
- Clicking it imports them one at a time after a confirmation showing the count. Each one is started as a Cowork task with its export attached and a request for Claude to reconstruct it, then renamed to the session's title and filed in **Imported Cowork chats**
- Exports of the account's own sessions, and of tasks made by an earlier import, are never offered

### Offline Viewing
- Click "View Offline" to read any exported chat
- Styled HTML viewer with proper markdown rendering
- Code syntax highlighting
- Works completely offline after export

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

1. Open any Claude.ai page
2. Click the extension icon
3. Click **Sync from Recents**
4. Wait for the conversation list to read and the exports to finish
5. Open the Organizer to view and organize your chats

## Usage

### Organizing Chats

**From Claude.ai:**
- Click the folder icon next to any chat title
- Select a folder from the dropdown
- Chat is instantly assigned

**From Organizer:**
1. Click extension icon → **Open Organizer**
2. Click any folder to view its chats
3. Use the search bar to find specific conversations
4. Click **View Chat** to open in Claude.ai
5. Click **View Offline** to read the markdown export
6. Click **Download** to save the markdown file

### Creating Folders

1. Open the Organizer
2. Click **+ New Folder**
3. Enter folder name and select a category
4. Click Create

### Bulk Export

**From Organizer:**
1. Click **Export MD** button
2. Choose "All chats" or "Current folder only"
3. Export runs with progress indicator
4. Files are saved to your data folder, and the exported chats are also downloaded as one combined markdown file

**From Extension Popup:**
1. Click **Export All to MD**
2. Progress shown on Claude.ai page
3. Skips already-exported chats automatically

### Syncing New Chats

**Automatic (Passive Monitor):**
- Extension watches for new chats in Claude.ai sidebar
- Orange bar appears once a new chat is detected
- Click **Sync Now** to import
- Syncing needs a writable data folder. Without one the bar shows the folder state with **Choose folder** or **Grant access**, and the sync starts after access is granted

**Manual:**
1. Go to https://claude.ai/recents
2. Click extension icon → **Sync from Recents**
3. Or click the orange sync notification

## Data Storage

All data is stored locally in the folder you selected:

```
Your-Data-Folder/
├── data.json            # Active account's folder definitions and chat assignments
├── data.<account>.json  # One file per signed-in account, so accounts sharing a folder stay separate
├── data.js              # Same data for the standalone offline viewer
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

**Chat ID:** a1b2c3d4-e5f6-7890-abcd-ef1234567890
**URL:** https://claude.ai/chat/...
**Exported:** 2025-01-20T15:30:00Z

---

## Human

User's message here...

---

## Assistant

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
- In the organizer, clicking **Export MD** and then **Export** requests folder access from the organizer page

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
│   ├── cf-account.js      # Account key and storage keys
│   ├── cf-notify.js       # Notices, confirmations, progress readout
│   ├── cf-data.js         # Folder data load
│   ├── cf-sidebar.js      # Folders row in Claude's sidebar
│   ├── cf-panel.js        # Folders flyout panel
│   ├── cf-chat.js         # Buttons on chat, Cowork and shared-chat pages
│   ├── cf-export*.js      # Single and bulk exports and their records
│   ├── cf-disk.js         # Export writes and folder access prompts
│   ├── cf-import*.js      # Shared chat import and its registry
│   ├── cf-project-import.js # Import button on a project's Activity tab
│   ├── cf-composer.js     # Claude's message composer
│   ├── cf-sync*.js        # Conversation sync and its summary
│   ├── cf-cowork-sync.js  # Cowork sessions for a sync
│   ├── cf-cowork-import.js # Import of Cowork exports from another account
│   ├── cf-monitor.js      # New-chat monitor
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
│   ├── folder-access.js   # Re-granting access, writing queued exports
│   ├── storage-keys.js    # Shared storage key names
│   ├── folder-picker.js   # Folder picker check and the Brave flag page
│   └── apply-update.js    # Applies files updated on disk
├── access/                # Data folder access window
├── popup/                 # Toolbar popup
├── organizer/             # Full organizer page
├── standalone/            # Offline viewer copied into the data folder
└── tools/check-project.js # Project checker
```

### Key APIs Used
- **File System Access API** - Read/write to user-selected folder
- **IndexedDB** - Store folder handle reference across sessions
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
