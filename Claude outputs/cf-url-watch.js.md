# content/cf-url-watch.js

One MutationObserver on the document, coalesced to one check per animation frame. Each check re-injects the sidebar row when React removed it, re-injects the chat buttons when the header re-rendered on the same URL, and on a URL change either schedules the buttons for the new conversation page or clears the shared-chat bar when leaving one.

Since 1.3.5 every check also calls `cfCheckProjectImport`. React re-renders the Activity tab, and with that call the import button is placed above a project's shared chats again.

Since 1.3.9 every check also calls `cfCheckCoworkImport` for the Cowork import button on /recents (docs/notes/content/cf-cowork-import.js.md).
