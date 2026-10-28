# content/cf-import.js

Imports chats shared with the user as new chats in two steps: export, then import. Since 1.3.9 it also imports Cowork exports from another account as Cowork tasks (docs/notes/content/cf-cowork-import.js.md).

## One import
1. Fetch the snapshot and convert it with `snapshotToMarkdown`.
2. Save the markdown to the data folder (queued when folder access is missing, without blocking the import).
3. On /new: select the Chat surface, attach the markdown file, type the reconstruction request, send.
4. Wait for /chat/<uuid>, record the import, file the chat under the project's folder (category Shared).

## The request sent with each transcript
"Attached is an exported transcript of "<title>", a conversation <sharer> shared with me in the "<project>" project. Reconstruct it here as our working context. Summarize what was asked and what was concluded, list the key facts, decisions and open questions, and keep any code, documents or drafts from it intact. Then treat that conversation as ours and continue from where it ended."

## Entry points
- Import on a /share/ page. A share already imported offers Open chat or Import again.
- The import button in a project's Activity tab (content/cf-project-import.js) since 1.3.5. The 1.3.0 Import Shared Chats button in the folders panel read every project's feed and was removed.
- The Cowork import button on /recents (content/cf-cowork-import.js) since 1.3.9.

## Run state
The queue (`importQueue__<account>`) survives the navigation to /new. Only the tab holding the run token in sessionStorage resumes it. The next import starts after the reply finishes, up to 5 minutes. A reload during sending records the item as interrupted and never sends it twice.

## Measured 2026-10-27
The prototype of this flow, run by hand in the user's Chrome, created chat 263bbbc0 from Ken's "Reporting a customer's unsanitary business" share; Claude's reply listed what was asked and concluded.

## Titles (1.3.1)
Claude titles a new chat from its first exchange, and the third import on 2026-10-27 came out as "Transcript reconstruction request". After the reply finishes, the import waits up to 20 seconds for Claude's title to appear in the conversation list, then sets the shared chat's own title with `PUT /api/organizations/<org>/chat_conversations/<id>` and body `{"name": "<title>"}`. Measured 2026-10-27: the rename control in Claude's header sends that PUT and gets 202, and the same PUT sent from the page renamed chat 263bbbc0.

## Failure reasons (1.3.4)
Each reason is the condition measured by its check:
- `the message composer did not appear within 30 seconds`: `cfComposerReady(30000)` found no composer.
- `the Chat option was not found in the composer`: no Chat radio in the Surface group.
- `the message composer disappeared after choosing Chat`: `cfComposerReady(10000)` found no composer after the switch.
- `no attachment thumbnail appeared within 20 seconds`: the `file-thumbnail` count did not rise after the file input's change event.
- `the request could not be typed into the composer`: the composer text does not start with the request.
- `the send button was missing or disabled for 60 seconds`: no enabled send button.
- `the page address did not change to a new chat within 60 seconds of sending`: the path never matched `/chat/<uuid>`.
- `the page was reloaded while the message was being sent`: the queue stage was `sending` when a page loaded.

The 1.3.0 wording ("the transcript did not attach", "the send button stayed disabled", "the new chat did not open", "the page reloaded") described the same checks.

## Filing earlier imports (1.3.1)
Every recorded import whose chat is not in any folder is filed in its project folder, since 1.3.5 by `cfFileUnfiledImports` when a project page is read. The prototype import of 2026-10-27 (chat 263bbbc0) was recorded by the 1.3.0 reconcile without being filed, and the new-chat monitor kept offering it for sync.

## Sources (1.3.7)
An item is a shared chat or, with `kind: 'cowork'`, a Cowork session. `cfImportSource` returns what one item needs: the file attached on /new, the request, the registry key, `importedFrom`, the folder for the new conversation and, for a shared chat, the export written to the data folder first. Shared chats attach the same file they export.

In 1.3.7 and 1.3.8 a Cowork item was the Share copy of a session in the same account: a brief transcript attached in the Chat surface, and for a run whose one item had `share: true`, Claude's Share popover was opened at the end. Both were removed in 1.3.9 (docs/notes/content/cf-chat.js.md).

## Cowork exports (1.3.9)
A Cowork item is an export from another account. Its export file is attached as it is on disk, in the Cowork surface. The page address after sending is `/cowork/<session id>`. The end of Claude's turn is read from the session's events (`cfWaitForCoworkTurn`), and the task is renamed with `renameCoworkSession`. The finish notice reads `Imported "<title>" as a Cowork task.` for one item and `Imported N of M Cowork chats.` for more.

Each failure reason has the name of the surface the item uses:
- `the Chat option was not found in the composer` or `the Cowork option was not found in the composer`: no radio with that name in the Surface group.
- `the message composer disappeared after choosing Chat` or `... after choosing Cowork`.
- `the page address did not change to a new chat or Cowork task within 60 seconds of sending`: the path never matched `/chat/<uuid>` or `/cowork/cse_...`.
