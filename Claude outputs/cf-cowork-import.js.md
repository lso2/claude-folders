# content/cf-cowork-import.js

Imports Cowork sessions exported from another Claude account. Added in 1.3.9 together with the removal of the 1.3.7 Share copy (docs/notes/content/cf-chat.js.md).

## Button placement
The button is on /recents ("Chats and tasks"), above `main table`. Measured 2026-10-28 in Chrome on Claude Team Alpha 2: the page's `main` has the h1 "Chats and tasks" and one `table` with 12 rows, inside `div.-m-2.p-2.overflow-x-auto.scroll-fade-x`. The bar is inserted before the table, inside that div. It reads "Import N Cowork chats" and is on the page only while N is above 0. Its palette is the Add to folder button's (docs/notes/inject.css.md).

## Exports offered
The data folder is read once per visit to /recents:
1. Every `cse_` export in chats/, by `exportIdOfFilename`.
2. This account's sessions: `listCoworkSessions` for each organization `listAccessibleOrganizations` returns. A 404 for an organization is counted as no sessions there. Any other failure is logged as `[IMPORT] No Cowork exports are offered: <organization> Cowork sessions were not listed: <endpoint answer>`, and nothing is offered on that visit.
3. The first 16,384 bytes of each export have its title (`# <title>`) and its source: the `(session cse_...)` id in its first "## Human" message.
4. An export is left out when its session is this account's own, when this browser recorded its import (`importedShares__<account>`), or when the export of a task in this account has it as source. An export whose source is one of those is left out too.
5. An export whose source is another offered export is left for that export.

The console line `[IMPORT] Data folder has N Cowork exports, M not from this account and not imported` has the counts.

## Example
Account A syncs, and its sessions a1 and a2 are exported. Account B shows "Import 2 Cowork chats". The import starts tasks b1 and b2 with "(session a1)" and "(session a2)" in their first messages. When B syncs, b1 and b2 are exported too. Back in account A, a1 and a2 are its own, b1 and b2 have them as sources, and nothing is offered. A task made in B by hand, b3, is offered to A.

## One import
Each item is run through the queue of content/cf-import.js:
- the Cowork radio of the Surface group is selected on /new;
- the export file is attached as it is on disk, with the request below;
- after sending, the page address is `/cowork/<new session id>`; the id is recorded in the queue, and the task is filed in "Imported Cowork chats" (category Imported, tags cowork and imported);
- the new session's events are polled every 3 seconds, for up to 5 minutes, until a `result` event is in them; the task is then renamed to the source title with the two requests Claude's Rename dialog sends (docs/notes/lib/cowork-api.js.md).

## Request sent with the export
"Attached is the exported transcript of my Cowork session "<title>" (session <source id>) from another Claude account. Read it and reconstruct the session here as our working context. Summarize what was asked and what was concluded, list the key facts, decisions and open questions, and keep any code, documents or drafts from it intact. Then treat that session as ours and continue from where it ended."

The task's own export has this request text, and with it the source id read in step 3. The name an attachment gets in a Cowork session's events was not measured, and the id in the request does not depend on it.

## Measured 2026-10-28
- claude.ai's composer code (bundle shared-18) logs `claudeai.yukon_gold.session_created` once a Cowork session is created, then pushes `${ZY}/${sessionId}`. `ZY` is exported by bundle shared-l-p-m-2 as `"/cowork"`.
- Before the session exists, the same code pushes `${ZY}/${vt}` with a client-minted id (``vt = `local_${...}` ``), and replaces it with the real session id once `onRemoteSessionIdAssigned` runs. `cfWaitForNewConversation` matches only `/cowork/cse_...` and passes over the `local_` address.
- `GET /v1/code/sessions?limit=1&exclude_tags=-` with the `x-organization-uuid` of an organization this account is not a member of answered 404 "Not found.". Claude Team Alpha 2, the account's only organization, answered 200.
- `GET /v1/code/sessions/cse_016OtherAcctTask00000001` answered 400 "invalid session ID: must be a cse_… or session_… tagged ID". Real ids have a tagged format the harness ids do not match.

## Not run live
Sending from /new in the Cowork surface was not run, and whether Claude retitles a task after its first turn is not known. Every Cowork export in the data folder is Claude Team Alpha 2's own, and the second account was not signed in. Harness tests TI1 to TI5 cover the import with a mock composer and mock endpoints.
