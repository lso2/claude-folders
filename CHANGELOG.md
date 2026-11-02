# Changelog

All notable changes to Claude Folders.

## 1.6.1

**Organizer**

- View Offline is #a77429, and View chat is #515151 with white text.
- New colors for the top bar buttons, Import from another account, the folder cards, the active category chip and the avatar.
- Categories is the home's first view and opens by default, followed by Cards and List.
- Moved Filter categories and the folder sort up beside the view buttons.
- Filter categories narrows the folder cards too.
- Hid category chips with no folders.
- Fixed the extra row on chat cards with a tag.
- Fixed the layout on narrow windows.
- View Offline opens a page that keeps the chat on reload.

**Popup and claude.ai**

- The option under the pointer in every dropdown has the page's accent color.
- Added the account dropdown to the popup.
- The account choice is shared and remembered by the popup, the Folders panel and the organizer.
- Hid category chips with no folders in the popup.
- Popup category rows and folders have a gray hover with white text.
- Removed the Import Cowork chats button from Chats and tasks.
- A sync stopped by folder access offers Grant access and runs again once access is granted.

**Settings page**

- Added Button color, with six preset circles and a custom picker.
- Every orange in the extension is a CSS relative color of the chosen Button color, with its own offset from the default orange.
- Custom color variants keep the chosen hue and are never more saturated than the chosen color.
- Added Apply to the organizer under Button color, off by default.
- Added the Log tab with syncs, exports, imports, folder changes, folder access and settings changes.
- The log keeps the last 50,000 entries, with pages and a Per page dropdown.
- Added kind chips to the log, which filter its entries by one or more kinds.
- Log entries have their own kinds in place of Settings, entries already logged included.
- Hid the section chips on tabs with one section.
- Fixed the header and footer on narrow windows.

**Offline view**

- The chat view's top bar is #d1861c.
- The offline library's View Offline and View chat buttons use the organizer's colors.
- The offline library has the organizer's Categories, Cards and List views, Filter categories, category counts, Sort by and content search.
- The offline library's folder pages, sidebar, Analytics button and footer match the organizer.
- The offline library in the data folder is updated when the extension is updated or reloaded.
- The offline library has the organizer's account dropdown and shows every account's folders.
- Fixed the offline library keeping old files when one of its files was not written.

**README**

- Added screenshots of the organizer, settings page, offline library and popup.

## 1.6.0

**Markdown export**

- Added the date and time of each message under its Human and Claude heading.
- The Exported line shows the local date and time of the export.
- Sync and Export folder update exports that have no message timestamps or are older than the chat.
- Export Update appears on chats whose export has no message timestamps.
- Sync and Export folder progress reads Updating for exports written again and Exporting for new ones.

**Organizer**

- Added the top bar to the analytics and folder pages.
- Clicking Analytics on the analytics page returns to the folders.
- Added All, Titles and Content to the search's chat list.
- Added a caret that collapses the search's chat list.
- Added a progress bar while the search reads the chat exports.
- Added Sort by to the search's chat list: best match, name, most recent message, oldest message and export date, each ascending or descending.
- The account dropdown filters the search's chat list.
- Titles of another account's chats in the search open their export.
- Chat rows show the date and time of the chat's last change.
- Fixed "CodeUpgrade" in the organizer's sidebar on a free plan.
- Added List, Cards and Categories views to the organizer home, with List as the default.
- The account dropdown filters the List and Cards views.
- Added Sort by to folder pages and to the List and Cards views.
- Folder pages use the home's search bar, which searches the open folder.
- Fixed View offline missing on another account's chats in a folder.
- Added Check for updates to the footer.

**Folders panel and popup**

- Added the sync icon to the popup, orange while new or changed chats are waiting.
- Clicking the sync icon with nothing waiting offers a forced resync.
- The organize steps stay collapsed or shown as last chosen.
- The popup's organize steps are above the search and categories.
- Removed the × from the Folders panel.
- Clicking Folders again closes the Folders panel.
- The Folders row is highlighted while the Folders panel is open.
- Moved the popup's sync icon next to the Folders title.
- The popup and the Folders panel use a softer orange.
- The folder access banner's button is light red.
- The popup, the Folders panel and the organizer show a notice when GitHub has a newer version.
- Added Check for updates to the popup and the Folders panel.

**Sync**

- Sync stores the start time of each chat.
- Fixed the sync not starting in a claude.ai tab opened before the extension was reloaded or added again.
- Folders are restored from the data folder after the extension is removed and added again.
- Fixed exports losing folder access after the folder was chosen in the popup.
- The first browser start after setup asks once for access on every visit.
- The sync result lists the chats behind each failure, as links.
- Failure reasons include Claude's own error message, such as the free plan's limit of 5 recently updated projects.
- Added automatic sync, hourly by default, with an interval of 15 minutes to 4 hours.
- Added Pause, Resume, Stop, Start and × to the sync's progress bar.
- Sync Now on the sync bar syncs on the page it is clicked on.
- A sync started with no claude.ai tab open opens a new chat page.

**Settings page**

- Added a sidebar with Main, Import/Export and Help.
- Added Help with setup steps and screenshots, shown after the extension is installed.
- Help has buttons for each step and shows which setup steps are done.
- Dialog buttons use the extension's orange, and Cancel is a light button.
- Added Automatic sync to Main.
- Added Import/Export with the settings file, the folder lists for Claude and Import from another account.
- The short request is the default for chats imported from another account, listed first.
- Added About with the version, links and attribution.
- Renamed Main to Settings.
- Added the section chips row and the footer.
- The sidebar has the organizer's collapse button, drag edge, width and row colors.
- Second buttons are gray with white text.
- Buttons, the open tab and the checkboxes use the extension's orange.
- The section chips filter the tab to one section, with All first.
- Settings lists Automatic sync first, then Data folder and Claude Folders Helper.
- Added a description of Claude Folders Helper and a GitHub releases button, and a Helper section in Help.
- Added an Organizer button next to the title.
- The settings page uses its own orange, and gray buttons are lighter on hover.
- Fixed the Donate icon's alignment on the About tab.

**Offline library**

- Chat rows show the date and time of the chat's last change.

## 1.5.0

**Organize**

- Added Organize in One Click to the Folders panel and the popup. Clicking Organize in the organizer runs it too.
- Fixed the false "organize request was not pasted" notice.
- Fixed the plural for 1 chat in the organize request and preview.
- Empty word and phrase lists are left out of the organize request.
- Organize in One Click is orange.
- Fixed the "Expected property name" and "Bad control character" errors when previewing Claude's organize answer.
- Organize in One Click reads Claude's answer from the chat's API.
- Organize in One Click sends the request as a chat.
- The organize request asks Claude to place every chat in a folder.

**Import from another account**

- Added the import dialog, with the account choice, the request style and the counts to import.
- Added Pause and Resume to the import.
- Added an optional pause after each batch of chats.
- Added Import from another account to the organizer.
- The Folders panel shows Import from another account whenever another account has chats.
- The popup and the organizer show the import's progress and result.

**Folders panel**

- The setup steps button shows the check-through-square icon, in the popup too.
- Clicking a folder opens its chats in a second pane with full titles.
- The ends of the folder list and the folder pane are visible above the sync and progress bars.

**Organizer**

- Searching also matches the text of exported chats.
- The sidebar is one scroll area.
- Category pills are a full-width row.
- The Import modal fits in the window.
- Fixed the #cf-run address shown when opening sidebar and account menu items.
- Removed the download of a run's exports as one file.
- The run result has square corners and closes on a click outside it.
- The sync result reports whether the offline library's data.js was written.
- Fixed the GitHub link.
- View Offline opens renamed chats and Cowork sessions.

**Popup**

- Added the Folders title back to the header.
- Fixed new chats missing from a sync's exports while the popup was open.
- Fixed folder and category names with HTML characters.

**Other**

- Category pills in the organizer and the popup show folder counts, with empty categories last.
- Replaced the browser's alerts, confirmations and prompts with designed dialogs.
- Light buttons on notices, dialogs, the popup and the sync bar are orange with white text.

## 1.4.0

**Sync**

- Sync in the popup, the organizer and the sync bar is one run in a claude.ai tab.
- The popup and the organizer show each sync's progress and result.
- Added a download of each sync's files to the organizer.
- Added Export folder to this login's folders in the organizer.
- Exporting a large Cowork session is faster, and its progress shows the event count.
- Fixed slow exports and "not found" errors when several logins share an organization.

**Accounts**

- Each Claude login has its own folders.
- Chats of another account are listed only under that account.
- Added importing another account's chats and Cowork sessions from the Folders panel into matching folders.
- Added the choice between a short request and a full reconstruction for imported chats to Options.

**Organizer**

- The sidebar shows Claude's sidebar items and account menu.
- The sidebar spans the full height and can be collapsed or resized.
- Added the account dropdown, Sync and Settings.
- Moved Clear to the Options page.
- The offline library shows new exports with no Build Library step.

**Folders panel**

- The square-check shows and hides the setup steps, and the gear opens Options.

**Popup**

- Rebuilt the header with Organizer, donate, analytics, setup steps and Options buttons.
- Added the last sync time and a Sync button.
- Removed the Sync dialog and Export All.
- Fixed the width, the category chevrons and the active category pill.
- Fixed the folder access banner appearing while access was granted.

**Ask Claude to Organize**

- Fixed the delay after clicking it.
- The request from the popup is pasted into the new chat.
- Fixed missing chat details after applying Claude's response in the popup.

**Other**

- Import runs can be stopped.
- Fixed popup and organizer changes that were not saved to the data file.
- Fixed a constant loop on the Chats and tasks page.
- Buttons, badges, modals and progress bars have solid colors.

## 1.3.15

**Accounts**

- Every organized chat records the account it belongs to.
- Each account's data file records the account's email and name.
- Added the account dropdown to the Folders panel, with each account's organizations under it.
- Removed the organization chips.
- All accounts shows the folders of every account in the data folder together.
- Chats stored without their organization get it at the next sync.

**Settings**

- Added a settings page for the data folder, accounts, the Folders panel's default view, Claude Folders Helper and the version.
- Added Settings buttons to the popup and the Folders panel.

## 1.3.14

**Show in folder**

- Added Claude Folders Helper for Windows, a program with its own setup.
- Removed the PowerShell helper.
- The file name link and Show in folder appear only with the helper installed.
- Without the helper, an exported chat shows Export, which writes over the same file.

**Updates**

- Fixed "Unknown action" errors after the browser restarted with newer extension files.

## 1.3.13

- Show in folder and Export Update appear sooner on chat and Cowork pages.

## 1.3.12

- Fixed Export Update for exports made before 1.3.11.

## 1.3.11

**Exports**

- The Saved notice stays open until closed, and its file name opens the file's folder in File Explorer.
- An exported chat or Cowork session shows Show in folder in place of Export.
- A chat or Cowork session with messages newer than its export shows Export Update. Export Update writes over the same file.
- Every sync exports the stored chats and Cowork sessions missing from the data folder.
- Added the Claude Folders helper for Windows for Show in folder.
- Fixed the organizer's single Download through the offscreen writer.

## 1.3.10

- Importing Cowork chats asks for data folder access when it is missing.
- Fixed folder requests made while the offscreen writer is starting.

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
