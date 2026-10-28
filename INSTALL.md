# Installation & Usage Guide

## Prerequisites

1. **Chrome-based browser** (Chrome, Edge, Brave, Opera)
2. **Empty folder** for data storage (extension will create files)

## Step 1: Load Extension

1. Open Chrome
2. Navigate to `chrome://extensions/`
3. Enable **Developer mode** (toggle in top-right corner)
4. Click **"Load unpacked"** button
5. Browse to and select the `claude-folders-extension2` folder
6. Extension loads with folder icon in toolbar

## Step 2: Select Data Folder

1. Click the extension icon (folder) in Chrome toolbar
2. You'll see "Welcome to Claude Folders" screen
3. Click **"Select Data Folder"** button
4. Choose or create a folder (e.g., `Documents/Claude-Data`)
5. Click **"Select Folder"** to grant permission
6. Extension creates necessary files automatically

**Data folder structure created:**
```
Your-Data-Folder/
├── data.json           # All folders, categories, chats
├── data.js             # For standalone viewer
├── index.html          # Standalone viewer
├── styles.css          # Standalone styles
├── app.js              # Standalone app
└── chats/              # Exported markdown files
    └── *.md
```

## Step 3: Import Your Chats

### Quick Import (Recommended)
1. Click extension icon in toolbar
2. Click **Sync** button (orange icon)
3. Select **Quick** tab
4. Click **"Auto-Import from Claude.ai"**
5. Extension reads the full conversation list from your account
6. Wait for completion notification

### Shared Chats
1. Open a chat someone shared with you (`claude.ai/share/...`)
2. Click **Import** at the top right
3. A new chat is opened with the transcript attached and a request for Claude to reconstruct it
4. To import every chat shared with you in your projects, click **Folders** in Claude's sidebar, then **Import Shared Chats**

### Passive Monitor
- Extension automatically detects new chats as you browse Claude.ai
- Orange bar appears once a new chat is detected
- Click **"Sync Now"** to import them

## Step 4: Organize with AI

### Ask Claude to Organize
1. Click extension icon
2. Click **"Ask Claude to Organize"** button
3. Extension copies a prompt to clipboard and opens new Claude chat
4. Paste the prompt and send
5. Claude analyzes your chat titles and returns category JSON

### Apply Claude's Response
1. Copy Claude's JSON response
2. Click **"Apply Claude's Response"** button (or header checkmark icon)
3. Paste the JSON
4. Click **Preview** to see organization
5. Click **Apply & Save** to organize all chats

## Features

### Extension Popup

**Header Icons (left to right):**
- ♥ Heart - Donate
- 📊 Analytics - View category charts
- ✓ Apply - Apply Claude's organization JSON
- 🔄 Sync (orange) - Import chats from Claude.ai
- ⬇ Export (purple) - Export all chats to Markdown
- **Organizer** (orange button) - Open full organizer
- ⚙ Toggle (appears after organizing) - Show/hide setup buttons

**Folder List:**
- Grouped by category (collapsible)
- Shows folder name and chat count
- Click folder to open in Organizer
- Right-click menu: Rename, Delete

**Search & Filter:**
- Search folders by name
- Filter by category pills
- Edit categories button

### Flyout Panel (on Claude.ai)

1. Click **"Folders"** in Claude.ai sidebar
2. Panel slides out showing:
   - Analytics button
   - Organizer button (orange)
   - Toggle setup button (gear, when organized)
   - Ask Claude / Apply Response buttons
   - All folders grouped by category
   - Quick chat links

### Full Organizer

1. Click **Organizer** button to open full page
2. Features:
   - Full folder grid view
   - Search all chats
   - Filter by category
   - Analytics dashboard
   - Export to Markdown
   - Import/Export data
   - Create new folders
   - View individual chats

### Chat Actions (in Organizer)

For each chat:
- **View Chat** - Opens chat on Claude.ai
- **View Offline** - Read exported markdown (if exported)
- **Download** - Download markdown file

### Markdown Export

**Individual Export:**
- Click Download on any chat in Organizer
- Saves markdown with full conversation

**Bulk Export:**
- Click Export MD in Organizer header
- Exports all chats to `chats/` folder
- Progress indicator shows status
- Skips already-exported chats

**Export Format:**
```markdown
# Chat Title

**Exported:** 1/20/2025, 3:30:00 PM

---

**Human:**

User message here...

---

**Claude:**

Assistant response here...

---
```

## Data Storage

### Single JSON File
All data stored in `data.json`:
```json
{
  "folders": [
    {
      "id": "folder-1",
      "name": "Project Alpha",
      "category": "Business",
      "chats": [
        {
          "id": "chat-uuid",
          "title": "Chat Title",
          "url": "https://claude.ai/chat/...",
          "date": "2025-01-20"
        }
      ]
    }
  ],
  "categories": ["Business", "Personal", "Development"],
  "metadata": {
    "userName": "James",
    "userInitial": "J"
  }
}
```

### Chrome Storage Cache
- Extension caches data in `chrome.storage.local`
- Syncs between popup, flyout, and organizer
- Writes to JSON file on changes

## Troubleshooting

### Extension Won't Load
- Check manifest.json is valid
- Verify all files present
- Check chrome://extensions for errors
- Try reloading extension

### Can't Select Folder
- Choose any folder (empty or existing)
- Ensure write permissions
- Try Documents folder
- Verify browser supports File System Access API

### Chats Not Appearing
- Click Sync button to import
- Check you're logged into Claude.ai
- Look in browser console for errors

### Sync Not Working
- Refresh Claude.ai page
- Re-enable extension
- Check console for errors

### Export Fails
- The notice shows the reason
- "Saving exports needs access to the folder": click **Grant access**, then **Allow access**, then **Allow** in Chrome's prompt
- Exports are saved while the Data Folder Access window is open with access granted
- "No data folder is selected": click **Choose folder**
- Exports made while access was missing are written once access is granted

### Organizer Button Not Orange
- Hard refresh the extension (disable/enable)
- Clear browser cache
- Reload claude.ai page

## Browser Compatibility

**Supported:**
- ✅ Chrome 102+
- ✅ Edge 102+
- ✅ Brave 1.40+
- ✅ Opera 88+

**Not Supported:**
- ❌ Firefox (no File System Access API)
- ❌ Safari (no File System Access API)

## Security & Privacy

**Local Only:**
- All data stored on your computer
- No cloud sync, no accounts
- No external network requests
- No telemetry

**Permissions:**
- `storage` - Cache data locally
- `tabs` - Open organizer, navigate
- `offscreen` - File operations
- `https://claude.ai/*` - Inject UI, scrape chats

## Tips

1. **Backup data.json** - Copy your data folder regularly
2. **Use AI organize** - Let Claude categorize your chats
3. **Export regularly** - Markdown exports are searchable offline
4. **Check passive monitor** - Sync when notification appears
5. **Use standalone viewer** - Open index.html for offline access

## Support

- GitHub: https://github.com/lso1/claude-folders
- Donate: https://plexpixel.com/donate
