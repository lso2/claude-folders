# content/cf-core.js

`init()` starts every part: account key, data load, pending work, the new-chat monitor, the import resume, the sidebar and buttons, the URL watchers, and two runtime listeners.

`cfOnRuntimeMessage` answers `dataUpdated`, `startScrape` and `folderAccessChanged`, and returns `false` for anything else. The 1.2.0 listener returned `true` for every message without answering most of them, which held each sender's channel open until the page unloaded.

## 1.3.5
`folderAccessChanged` also refreshes the sync bar and starts the sync this tab asked for before access was granted (`cfTakeSyncRequest`).

## 1.3.7
`cfOpenPendingShare` runs once the account is ready, for a chat whose Share popover was asked for from a Cowork page (docs/notes/content/cf-chat.js.md).

## 1.3.9
`cfOpenPendingShare` was removed with the Cowork Share button (docs/notes/content/cf-chat.js.md).
