# content/cf-composer.js

Drives Claude's composer on /new for the import.

## Selectors measured 2026-10-27 on /new
- `[data-testid="chat-input"]`: the tiptap ProseMirror editor, aria-label "Write your prompt to Claude".
- `input[data-testid="file-upload"]` (id `chat-input-file-upload-onpage`, multiple): the upload input.
- `button[data-testid="chat-input-send"]` (aria-label "Send message"): disabled until there is content.
- `[role="radiogroup"][aria-label="Surface"]` with `[role="radio"]` items "Chat" and "Cowork"; the selected one has `aria-checked="true"`.
- `[data-testid="file-thumbnail"]` appears once a file attaches.
- During a reply a button with an aria-label containing "Stop" is present; `[data-testid="assistant-message"]` holds the reply.

## Measured behavior
Setting a markdown `File` on the upload input through a `DataTransfer` and dispatching `change` attached it as an MD chip and enabled Send. `execCommand('insertText')` typed into the editor. Clicking Send moved the page from /new to /chat/<uuid> within 5 seconds and the reply finished in about 30 seconds.

## Send button after Chat is chosen (1.3.8)
Measured 2026-10-28 in Chrome on /new with the Cowork surface selected: `chat-input` and `file-upload` were present, and `button[data-testid="chat-input-send"]` was absent. Dictate and Microphone buttons were in its place. After the Chat radio was clicked the send button was present, empty input or not, with aria-label "Send message". The page also has a second radiogroup, `aria-label="Mode"` (radios "Chat and Cowork" and "Code"), ahead of the Surface group in the DOM.

Through 1.3.7 `cfComposerReady` waited for the input, the file input and the send button before choosing Chat, and a Cowork share on that page ended with "the message composer did not appear within 30 seconds". Since 1.3.8 readiness needs the input and the file input; `cfSendWhenReady` waits up to 60 seconds for an enabled send button after the transcript is attached.

Attaching `cf_measure.md` through the upload input on the same page showed one `[data-testid="file-thumbnail"]`, and its "Remove cf_measure.md" button removed it.

## Cowork surface (1.3.9)
The Cowork import selects the Cowork radio with `cfSelectSurface('cowork')`. Measured 2026-10-28 in Chrome on /new: with Cowork selected, the send button was absent on an empty composer and present once a file was attached. A 1.5 MB markdown file attached in both surfaces before sending.

`cfWaitForNewConversation` returns the id from `/chat/<uuid>` or `/cowork/cse_...`. claude.ai's composer code pushes `/cowork/<session id>` once a Cowork session is created (docs/notes/content/cf-cowork-import.js.md).
