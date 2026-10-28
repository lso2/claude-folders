# lib/chat-markdown.js

Converts conversation JSON and shared-snapshot JSON into the markdown export format.

## Format
- Sender headings are `## Human` and `## Claude`. Version 1.2.0 used emoji headings; 1.3.0 drops the emoji.
- `text` blocks print as written. `thinking` blocks print inside a `<details>` block labelled Thinking.
- `tool_use` blocks print the tool name and its query, command, url or path. Artifact and file-creation tools print their full content inside `<details>`.
- `tool_result` blocks print each result as a markdown link. Before 1.3.0 an array result printed as `[object Object]`.
- Attachments from `files`, `files_v2` and `attachments` print as one line each with the file name. 1.2.0 read only `files_v2`, and the measured API returns uploads in `files` (`file_kind: "blob"`).

## Filenames
`generateExportFilename(id, title)` returns `<id prefix>_<sanitized title>.md`. Every export check matches on the prefix, and a renamed chat is still recognized.

- A chat or snapshot uuid gives its first 8 characters.
- A Cowork session gives its whole id (1.3.7). The 4 Cowork ids measured on 2026-10-28 all start with `cse_016M`, and 8 characters would have given them one filename.

`exportIdPrefix(id)` returns the prefix for an id, and `exportPrefixOfFilename(name)` reads it back from a filename, lowercased. content/cf-export-run.js and organizer/export-md.js match with them. Before 1.3.7 both matched `[a-f0-9]{8}` and `slice(0, 8)` on their own.

Since 1.3.9 `exportIdOfFilename(name)` returns the id prefix with its case kept, and `exportPrefixOfFilename` lowercases that. A `cse_` id is case-sensitive, and the Cowork import (content/cf-cowork-import.js) uses the id as it is.

## Branches
`currentBranchMessages` walks `parent_message_uuid` back from `current_leaf_message_uuid`. A `tree=True` response holds every branch, and the export follows the one shown on screen.

## Dedupe
The same converter and filename helpers previously existed in offscreen.js, organizer/app.js and handle-storage.js with three different output formats. All of them now load this file.

## Tool lines (1.3.7)
`mdToolUseText` also reads `file_path` and `pattern` for its one-line detail and `file_path` for the label of a tool that carries a file body. Cowork's Read, Write, Edit, Grep and Glob calls name their file that way.

## Standalone viewer (1.3.7)
lib/data-file.js copies this file into the data folder as `chat-markdown.js`, and standalone/index.html loads it before app.js. standalone/app.js kept its own copies of `sanitizeFilename` and `generateExportFilename` until 1.3.7.
