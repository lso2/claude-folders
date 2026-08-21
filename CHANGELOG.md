# Changelog

All notable changes to Claude Folders.

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
