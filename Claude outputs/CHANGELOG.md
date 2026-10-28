# Changelog

All notable changes to Claude Folders.

## 1.3.9

**Cowork sessions**

- Cowork exports from another account can be imported as Cowork tasks.
- Imported Cowork tasks keep their original titles and are filed in an Imported Cowork chats folder.
- Exports of the account's own sessions and of tasks made by an earlier import are never offered for import.
- Removed the Share button from Cowork pages.

**Other**

- The import buttons use the gray of the Add to folder button.
- Fixed read errors in the organizer's offline view.

## 1.3.8

- Fixed shared-chat imports and Cowork copies on Claude's current new-chat page.

## 1.3.7

**Cowork sessions**

- Cowork sessions can be exported to markdown from their page.
- Syncing stores Cowork sessions in the folders and exports them with the chats.
- New Cowork sessions are counted in the sync bar.
- Cowork sessions can be shared through a chat copy.
- Cowork exports are named with the whole session id.
- Cowork rows in the folders panel have a Cowork label.

**Other**

- Organizing with Claude keeps each chat's organization, update time and import source.
- Export filenames in the offline viewer are built by the extension's own helpers.

## 1.3.6

- The orange import button appears above the shared chats in a project's Activity tab whenever others shared chats there.
- With every shared chat already imported, the button offers to import them again.
- Open claude.ai tabs are reloaded after an update.
- Fixed data syncs written through the offscreen writer.

## 1.3.5

**Exporting**

- Only the chats being exported are counted in export progress, after one check against the files on disk.
- Chats already on disk are marked exported in one storage write.
- Stored chats from organizations this login cannot read are counted separately and not fetched.

**Syncing**

- Syncing needs a writable data folder.
- The sync bar shows the folder state and an access button while access is missing.
- A sync requested without access is started once access is granted.

**Brave**

- In a browser without window.showDirectoryPicker, folder selection shows the reason, and Brave has an Open flag button for the file-system-access-api flag.

**Importing shared chats**

- An orange import button appears above the shared chats in a project's Activity tab when some are not imported yet.
- Removed the Import Shared Chats button from the Folders panel.
- The share page's Import button is orange.

**Accounts**

- Only the active account's data file is read from the data folder.
- A new account has empty folders when another account already has its own.

## 1.3.4

- Missing chats are counted as "not found on the account" in export and sync summaries.
- The boot log line shows the extension version.
- Reworded the access window note, the Import Shared Chats confirmation and the import failure reasons.

## 1.3.3

- The sync bar count is limited to chats outside every folder.

## 1.3.2

- Exports, syncs and organizer downloads are saved to the data folder while the access window is open.
- The access window shows each saved export.

## 1.3.1

- Imported chats have the shared chat's title.
- Imported chats missing from the folders are filed in their project folder on the next Import Shared Chats run.
- Notices are stacked in one column above the progress readout and the sync bar.
- The folder access notice shows the permission state.
- The access window is left open after access is granted.

## 1.3.0

**Exporting**

- Fixed Export on regular chats.
- Shared chats have an Export button.
- Export notices show the reason a file was not written.
- Exports made while the data folder needs permission are queued and written once access is granted.
- Clicking Grant access opens the folder access window.
- Folder access is checked before folder, popup, organizer and sync exports.
- Each chat in folder and popup exports is fetched from the organization that owns it.
- In organizer exports, files are written only for exported chats.
- Exports contain tool results, thinking, attachment names and only the branch shown on screen.

**Importing shared chats**

- Shared chats have an Import button for opening the transcript as a new chat in your account with a request to reconstruct it.
- Import Shared Chats in the Folders panel is for importing every chat shared with you in your projects.
- Imported chats are filed under Shared in a folder named for their project.
- Shared chats already imported are recognized, including imports made in another browser.

**Donations**

- Donate links and buttons go to https://plexpixel.com/donate.

**Updates**

- Opening the popup or the organizer applies extension files updated on disk.

**Internal**

- Every source file is under 30 KB and has a header and a notes file under `docs/notes/`.
- Added `node tools/check-project.js` for checking load lists, syntax, file sizes, headers and duplicate names.
- The markdown format, export filenames and folder access code are shared by every page.

## 1.2.0

Claude rebuilt its sidebar and chat header without the elements this extension anchored to, and the conversation list now comes from Claude's own web endpoint instead of the rendered page.

**Sidebar and chat pages**

- Cowork pages get the chat buttons. Only `/chat/<uuid>` counted as a conversation page, so `/cowork/<session id>` was skipped entirely, and a Cowork page has no `chat-header`, an empty actions group, and its own trailing slot to anchor to.
- Export is disabled on a Cowork page with the reason shown, because no endpoint returns a Cowork transcript.
- A stored Cowork session is counted as unavailable during an export pass instead of attempted and reported as a failure.
- Injecting the chat buttons clears every previous pair. It cleared only the first match, and since the export button carries both classes it was usually what got removed, so each pass left the folder button behind and added another beside it.
- The export button keeps its own colour. Its rules were duplicated into the runtime stylesheet, which lands later in the cascade at equal specificity, so it went grey moments after the page styled it green. `inject.css` is now the only place the chat buttons are styled.

- The Folders row renders in the Claude sidebar again.
- Row labels are read past the private-use icon glyph Claude embeds in the row text.
- The Export and Add to folder buttons render on chat pages, in the header's actions cluster next to Share.
- Chat titles are read from the header's title control.
- The account name, initial and team are read from the account row by its text.
- The flyout panel measures the sidebar element for its left edge.
- Retries for the sidebar row and the chat buttons are bounded.

**Importing**

- The conversation list is read from Claude's web endpoint, the same one the site and the exporter already use.
- A sync reads every organization on the login it can reach, not only whichever one is active, so the total no longer changes when you switch accounts.
- Each chat records the organization it came from, and each organization keeps its own coverage watermark.
- A chat belonging to one of the other organizations on the login carries a short label in the folders panel, so it is not indistinguishable from a chat in the organization you are signed into.
- The folders panel has an account filter. Chips list each account with its chat count, selections persist per account, and folder counts, chat lists, paging and the analytics chart all follow the filter.
- Chat records carry the full timestamp the endpoint reports rather than a date inferred from relative wording.
- A sync that already has contiguous history reads back one month past its watermark and stops, and requires three consecutive pages with nothing unimported before it does, so a gap in older history is still reached.
- Syncing runs from any Claude page and reuses the open Claude tab instead of opening a second one.
- The rendered page is read only when the endpoint is unreachable. That path covers about thirty rows, because Claude's list pins its scroll container at the bottom without loading more, so it now stops there and reports the count instead of scrolling indefinitely.
- The page-reading fallback matches load-more controls exactly, so the word "Folders" is no longer treated as one.

**Exporting**

- The export check reads the folder once per sync and matches on chat id, so a renamed chat is not written twice.
- Export failures report their reason instead of being counted as empty chats.
- A chat is fetched from the organization that owns it. Asking the active organization for another organization's chat answers 404, which is what stopped chats from the other accounts on the login from exporting.
- A chat stored before organizations were recorded is looked up across the readable organizations once, and the answer is reused. A 403 triggers the same lookup as a 404, because a stored organization id from another login is refused rather than missing.
- A conversation still refused after that is re-requested with a plainer query, dropping tool rendering and then rendering mode. All three shapes return the same messages, so this recovers a transcript instead of losing one.
- A refusal names the organization it was refused by, so the reason identifies where to look.
- Chats with no messages are reported on their own line and not repeated in the reason tally.
- A stored chat the account no longer has is recorded once and reported as "no longer on the account", rather than retried and counted as a failure on every sync.
- The sync summary lists each organization and its conversation count, because Claude's own list page shows only the active organization.
- The sync summary reports the account total, the failure reasons, and any chats that could not be written to disk.

**Storage**

- Each signed-in account writes its own `data.<account>.json`, so two accounts sharing one data folder no longer overwrite each other.

**Monitor**

- The sync bar appears for a single new chat, down from thirty, and reads "1 new chat detected" when there is one.
- The monitor logs how many chat links it scanned, how many are already stored, and how many are waiting to import, and logs when the bar is held back because a chat is open.

**Progress readout**

- The sync readout no longer blurs while counting. Its box was sized by `min-width`, so it grew with each message and a transform-centred box re-centred on every count, and the proportional digits changed width as the number climbed. The box is a fixed width, the text clips instead of stretching it, and the digits are tabular. The update rate, the message, and the position are unchanged.

**Internal**

- The content script ships as parts under `content/`, each under 30 KB.
- The organizer footer reports the running version.
- Removed the duplicate monitor functions.

## 1.1.2

- The Folders row keeps Claude's icon box and label layout, and hides its label when the sidebar collapses.
- The flyout panel opens flush against the sidebar edge whether the sidebar is expanded or collapsed.

## 1.1.1

- Disk writes run in the offscreen document instead of the popup.

## 1.1.0

- The sidebar entry renders its icon and full label.
- Sync auto-scrolls the recents list.
- Re-syncing refreshes an existing chat in place and adds only new ones.
- Re-organizing reuses folders by name, keeps chats already filed, and reassigns only where the new rules match.
- A one-click Build Library button in the Organizer embeds each exported chat into `data.js`.
- Library files refresh on every save.
- The active organization id is re-read on each export.

## 1.0.x

- Initial release: folder organization, markdown export, offline viewing, passive chat monitor, analytics and local storage.
