# lib/cowork-markdown.js

Converts a Cowork event log into the export format of lib/chat-markdown.js (`## Human`, `## Claude`, `---` between turns). Added in 1.3.7.

## Event log measured 2026-10-28 ("Claude folders extension issues", 3609 events)
Event types: assistant 1295, user 877, system 582 (status 529, init 18, turn_handoff_available 9, permission checks 16, hooks 6, compact_boundary 2, background_tasks_changed 2), control_request 352, control_response 352, env_manager_log 59, rate_limit_event 49, tool_progress 23, result 13, control_cancel_request 4, composer_notice 1, composer_notice_dismissed 1 and autocompact_state 1. Only `user` and `assistant` events carry the conversation.

## Turns
- A person's message is a `user` event with `source: "client"`.
- Context the app adds by itself is left out: `isSynthetic: true` (skill text, the compaction summary), `shouldQuery: false` (folder and timezone notices) and text opening with `<system-reminder>`.
- A message the client sent again carries `synthetic_message: true`. It reached Claude as a message and is kept.
- Each `assistant` event carries one content block. Consecutive events form one Claude turn.
- Tool results arrive as worker `user` events holding `tool_result` blocks and are added to Claude's turn.
- `[Request interrupted by user]` arrives as worker user text and is kept as an italic note in Claude's turn.
- Events with `parent_tool_use_id` belong to a subagent and are left out. The parent tool result carries their outcome.
- All 447 thinking blocks had empty `thinking` text with only a signature, and print nothing.
- Claude's messages to the person are `SendUserMessage` tool calls. Their `input.message` prints as text, and their "Message delivered to user." results are dropped.
- A message with `file_attachments` prints `*Image: <file_name>*` lines in place of its base64 image blocks.

## Sizes (same session at 3790 events)
42 turns, 21 of them the person's. The full export was 1,512,678 characters: tool results 1,323,667, tool calls 159,924, text 24,518. In 1.3.7 and 1.3.8 `coworkToBriefMarkdown` left out tool results and the file bodies in tool inputs, and came to 108,494 characters. That brief copy was attached by the Cowork Share button.

## 1.3.9
The brief copy functions were removed with the Share button (docs/notes/content/cf-chat.js.md). The Cowork import attaches the full export file (docs/notes/content/cf-cowork-import.js.md).

A person's message keeps its text blocks next to its attachment lines. The source id in the first message of an imported task is read from that text.
