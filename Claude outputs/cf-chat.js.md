# content/cf-chat.js

Places the extension's buttons on conversation pages.

- Chat pages: Export and Add to folder go first in the header's `[data-testid="wiggle-controls-actions-group"]` beside Share.
- Cowork pages: Export and Add to folder are placed after `[data-testid="cowork-title-row-trailing"]`. Until 1.3.7 Export was disabled there.
- Shared chat pages (`/share/<uuid>`, added in 1.3.0): the page has no header (measured 2026-10-27: no `header`, `chat-header` or title control). Export and Import sit in a fixed bar at the top right.

`cfClearChatButtons` removes every match before injecting. 1.2.0 removed only the first match, and the export button carries both classes, so each pass left a folder button behind.

## Share on Cowork pages (1.3.7 to 1.3.8)
1.3.7 added an orange Share button on Cowork pages. Claude has no Share for Cowork sessions, and the button copied the session into a new chat in the same account (a brief transcript attached on /new), then opened Claude's Share popover on that chat. The copy was filed beside the session.

Removed in 1.3.9. The user's goal was getting Cowork chats into another account, and a chat copy of each session in the same account was not wanted. That goal is met by exporting with Export or a sync and importing in the other account (docs/notes/content/cf-cowork-import.js.md). content/cf-cowork-share.js, `cfOpenPendingShare`, the brief copy functions of lib/cowork-markdown.js and `.claude-share-btn` were removed with the button.

Measured 2026-10-28 for the Share button, kept for reference:
- The Cowork title menu lists Schedule, Turn into skill, Copy session ID, Pin, Rename, Add to project, Archive and Delete.
- A chat's header has `button[data-testid="wiggle-controls-actions-share"]`. Clicking it shows `[data-testid="share-popover"]` (role dialog) with "Share chat", "Only messages up until now will be shared", an invite field, "Who has access: Only people invited" and Copy link. Opening the popover creates no link.
