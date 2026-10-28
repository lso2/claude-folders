# background.js

The service worker answers every extension message against `cachedData`, the active account's folder data.

## Added in 1.3.0
- `checkWriteAccess` asks the offscreen writer for the data folder state.
- `openFolderAccess` opens access/index.html in a small popup window, or focuses the one already open.
- `folderAccessChanged` relays the access window's result to every claude.ai tab.
- `fileImportedChat` files an imported chat under a folder named for its project (id `shared-<project uuid>`, category `Shared`), creating the folder and category when needed.
- `saveExport` returns the writer's full result, including `code` and `error`.

## Offscreen document
`ensureOffscreen` checks `chrome.offscreen.hasDocument()` on every call. 1.2.0 trusted a flag set at creation, and a closed document then left messages without a receiver.

## Account slots (1.3.5)
`setAccount` loads `cfData_<key>`. Before 1.3.5 an account without folders of its own received the richest dataset stored under any key, including another account's slot and the `cachedData` mirror of whichever account was active before. Since 1.3.5 that copy is limited to folders saved before per-account slots existed (`cfData_default`, then `cachedData`), and only while no other account has a slot.

## Flag page (1.3.5)
`openFlagsPage` opens a `chrome://flags/#<flag>` URL in a new tab for the content scripts, the popup and the access window. Content scripts have no `chrome.tabs`. Measured 2026-10-28 in Playwright's Chromium: `chrome.tabs.create({ url: 'chrome://flags/#file-system-access-api' })` from an extension page opened the tab with the title "Experiments".

## Folder requests (1.3.2)
`askFolderWorker` sends each data-folder request to the access window when its `folder-writer` port is connected, and to the offscreen document otherwise. The port reconnects when the service worker restarts. Measurement in docs/notes/lib/folder-ops.js.md.

## Tab reload after an update (1.3.6)
`reloadClaudeTabs` runs on `chrome.runtime.onInstalled` with reason `update` and reloads every claude.ai tab. A tab opened before an update keeps the old content scripts, cut off from the extension. On 2026-10-28 the user reported the 1.3.4 panel button and no shared-chat buttons in Chrome, while a new tab measured the same day booted 1.3.5 with both. Measured the same day in Chrome: text typed into the composer on /new was still there after a reload.

## Export reads (1.3.9)
The `readExportFile` message is passed to `askFolderWorker` as `folderReadExportFile`, with the filename and `maxBytes`. The Cowork import reads the start of each Cowork export with it, then the whole file it attaches.
