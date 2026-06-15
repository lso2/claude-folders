# Claude Folders

![Brave](https://img.shields.io/badge/Brave-1.85%2B-ff5500.svg?logo=microsoftedge&logoColor=white)
![Chrome](https://img.shields.io/badge/Chrome-102%2B-4285F4.svg?logo=googlechrome&logoColor=white)
![Chromium](https://img.shields.io/badge/Chromium-143%2B-569bda.svg?logo=chromium&logoColor=white)
![Edge](https://img.shields.io/badge/Claude-4.5%2B-bf603b.svg?logo=microsoftedge&logoColor=white)
![License](https://img.shields.io/badge/License-GPLv3-orange.svg)

A Chrome extension that adds folder organization, markdown export, and offline viewing to Claude.ai conversations. All data stays on your computer - no cloud sync, no accounts, complete privacy.

## What's new in 1.1.x

This release fixes the sidebar icon and reworks how syncing and the offline library behave so re-importing is no longer destructive.

- **Folders icon fixed** so the sidebar entry renders its icon and full label instead of clipping to "olders", because the icon is now built with a fixed size rather than depending on Claude's cloned markup.
- **The Folders row matches the native nav** (1.1.2) by keeping Claude's icon box and label layout, so it lines up with the other items and hides its label when the sidebar collapses, and the flyout panel now opens flush against the sidebar edge whether it is expanded or collapsed.
- **Sync now auto-scrolls** the recents list to the bottom so it captures every conversation, replacing the old reliance on a "Show more" button that Claude no longer shows.
- **Re-syncing checks for updates and duplicates** so an existing chat is refreshed in place (title and date) and only genuinely new chats are added, which means a chat is never duplicated across folders.
- **Re-organizing merges instead of clobbering** so applying a new set from Claude reuses folders by name, keeps chats you already filed, reassigns where the new rules match, and leaves untouched chats where they are.
- **The offline library is directly usable** through a one-click "Build Library" button in the Organizer that embeds each exported chat into `data.js`, so "View Offline" works even when you open `index.html` straight from disk.
- **Library files refresh automatically** on every save, so fixes reach an already-set-up data folder without you clearing it out and re-selecting it.
- **Switching Claude profiles/orgs no longer breaks export**, because the active organization id is re-read live instead of being cached once.
- **Syncing to disk no longer throws or depends on the popup** (1.1.1), because disk writes now run in the always-available offscreen document instead of being messaged to a popup that is usually closed, which is what produced the `syncToDisk is not defined` and "Could not establish connection" errors.

## Summary

Claude Folders transforms Claude.ai's flat conversation list into an organized folder system with:

- **📁 Folder Organization** - Create folders, assign categories, organize hundreds of chats
- **📝 Markdown Export** - Automatically export conversations to `.md` files with full content
- **👁️ Offline Viewing** - Read your exported conversations without internet access
- **🔄 Passive Sync** - Monitors for new chats and notifies when 30+ are ready to import
- **📊 Analytics** - View category distribution and folder statistics
- **💾 Local Storage** - All data stored in a folder you choose on your computer
- **🎨 Native Feel** - UI integrates seamlessly with Claude.ai's design

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
- Automatic filename generation: `{chatId}_{title}.md`
- Skip already-exported files (no duplicates)
- Exports stored in `/chats/` subfolder within your data directory

### Offline Viewing
- Click "View Offline" to read any exported chat
- Styled HTML viewer with proper markdown rendering
- Code syntax highlighting
- Works completely offline after export

### Passive Chat Monitor
- Automatically detects new conversations in the sidebar
- Shows notification when 30+ new chats are available
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

1. Navigate to https://claude.ai/recents
2. Click the extension icon
3. Click **Sync from Recents**
4. Wait for scraping and export to complete
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
4. Files saved to your data folder and downloaded as ZIP

**From Extension Popup:**
1. Click **Export All to MD**
2. Progress shown on Claude.ai page
3. Skips already-exported chats automatically

### Syncing New Chats

**Automatic (Passive Monitor):**
- Extension watches for new chats in Claude.ai sidebar
- Orange notification appears when 30+ new chats detected
- Click **Sync Now** to import

**Manual:**
1. Go to https://claude.ai/recents
2. Click extension icon → **Sync from Recents**
3. Or click the orange sync notification

## Data Storage

All data is stored locally in the folder you selected:

```
Your-Data-Folder/
├── folders.json         # Folder definitions and chat assignments
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
| Brave | ✅ 1.40+ | Full support |
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
- Navigate to https://claude.ai/recents before syncing (it should do this automatically)
- Look for errors in the browser console (F12)

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
├── manifest.json          # Extension configuration
├── background.js          # Service worker, message handling
├── content-script.js      # Injects into claude.ai pages
├── inject.css             # Styles for injected UI
├── offscreen.html/js      # File system operations
├── lib/
│   ├── chat-exporter.js   # Markdown conversion
│   └── handle-storage.js  # IndexedDB folder handle storage
├── popup/
│   ├── popup.html         # Extension popup UI
│   ├── popup.js           # Popup logic
│   └── popup.css          # Popup styles
├── organizer/
│   ├── index.html         # Full organizer interface
│   ├── app.js             # Organizer application logic
│   └── styles.css         # Organizer styles
└── icons/                 # Extension icons
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

[![Ko-fi](https://img.shields.io/badge/Ko--fi-F16061?style=for-the-badge&logo=ko-fi&logoColor=white)](https://ko-fi.com/techreader)

**Why donate?**
- ☕ Fuel continued development
- 🚀 Support new features like search, tagging, and more
- 🐛 Faster bug fixes and updates
- 📚 Better documentation

---

*Made with ❤️ for the Claude.ai community*
