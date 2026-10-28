# lib/folder-ops.js

`runFolderOp(request)` performs one data-folder request from the service worker: write an export, check access, list or read exports, read one export by its filename, check that an export exists, write `data.json`, or fetch and write one chat for the organizer's Download button.

Two pages load it:
- the access window, which performs requests while it is open, over its `folder-writer` port;
- the offscreen document, which performs them otherwise.

## Why two
Measured 2026-10-27 in the user's Chrome:
1. Chrome's prompt for this extension offered only Allow and Block, with no "Allow on every visit".
2. After Allow in the access window, the window wrote 6 queued exports.
3. With the window still open, an export through the offscreen document reported the permission as "prompt".

The offscreen document never sees the grant, so requests go to the access window whenever it is connected.

Moved out of offscreen.js in 1.3.2. The request names start with `folder`; 1.3.0 named them `offscreen*`.

## folderSyncToDisk (1.3.6)
The request carries the folder data and the account key from the service worker. Offscreen documents have only `chrome.runtime`, and the 1.3.5 case read `chrome.storage.local` there: measured 2026-10-28 in Playwright's Chromium, a data sync through the offscreen writer logged `[BG] syncToDisk: false TypeError: Cannot read properties of undefined (reading 'local')`. In the user's Chrome the offscreen writer never had folder permission (see above), and those syncs went through the access window, which has `chrome.storage`.

## Cowork sessions (1.3.7)
`handleExportChatById` sends a `cse_` id to `exportCoworkSession`, with the stored `activeOrgId` as the organization header when there is one. `writeChatExport` writes the file and stamps `exportedChats` for both kinds. offscreen.html and access/index.html load lib/cowork-api.js, lib/cowork-markdown.js and lib/cowork-export.js for it.

The Playwright harness cannot answer these requests: its `context.route` mocks did not reach the offscreen document, which got 403 from the network. The path is checked in the user's Chrome instead.

## folderReadExportFile (1.3.9)
Reads one export by the bare filename `folderListExports` returns, for the Cowork import. A name with a slash or backslash, or one not ending in `.md`, is refused with `not an export filename: <name>`. `maxBytes` limits the read to the start of the file. Both read cases return the result of `readExportFileChecked`, with the real exception text on failure.
