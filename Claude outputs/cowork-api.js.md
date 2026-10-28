# lib/cowork-api.js

Reads Cowork sessions from claude.ai's code-session endpoints. The content scripts, the offscreen writer and the access window load it. Added in 1.3.7.

## Endpoints measured 2026-10-28 (Chrome, Claude Team Alpha 2, 4 Cowork sessions)
- Every request needs `anthropic-version: 2023-06-01`. Without it the answer is 400 "anthropic-version: header is required". The claude.ai app also sends `anthropic-beta: ccr-byoc-2025-07-29`, `anthropic-client-feature: ccr`, `anthropic-client-platform: web_claude_ai` and `x-organization-uuid`. Requests with only `anthropic-version` answered the same.
- `GET /v1/code/sessions?limit=50` answered `{data: [], resume_token}`. With `exclude_tags=-` the same request listed all 4 sessions.
- More pages are asked for with `cursor=<next_cursor>`. Measured with `limit=2`: 2 pages, and `next_cursor` was absent on the last one. `before`, `after`, `page_token` and `offset` were ignored. A bad `cursor` answered 400 "invalid cursor".
- A session record has `id` (`cse_` plus 24 letters and digits), `title`, `created_at`, `updated_at`, `last_event_at`, `status`, `tags` and `config`. `config` holds the session's settings, including its system prompt settings, and never goes into an export.
- `GET /v1/code/sessions/<id>` answered `{response_shape: <session>}`.
- `GET /v1/code/sessions/<id>/events?limit=N` answered `{data, resume_cursor}`, newest event first. `cursor=<resume_cursor>` returned the events before it (cursor 3398 returned 3397 down to 3393). `limit=500` answered 500 events in 393 ms. `limit=1000` and `limit=5000` answered 400 "Request validation failed".
- The session "Claude folders extension issues" had 3609 events: 8 pages of 500, 3.6 seconds in all. Its first page was 1,650,303 bytes.
- A session id that does not exist answered 404 `Session <id> not found`. An `x-organization-uuid` of an organization without the session answered 404 "Not found."
- The claude.ai page lists sessions with the same list request, then opens `GET /v1/code/sessions/watch?resume_token=...` for changes. The watch request without a resume token answered "resume_token required — call ListSessions first".
- Opening a session page sent `POST /v1/code/sessions/session_<id after cse_>/mark_read`. After "Test chat" was opened at about 07:08 UTC its `updated_at` read 07:09:06 while `last_event_at` read 07:00:50.

## Ids
`isCoworkSessionId` matches `cse_` followed by letters and digits. The 4 measured ids share their first 8 characters (`cse_016M`); docs/notes/lib/chat-markdown.js.md has the export filename that follows from it.

## Requests added for the Cowork import (1.3.9)
- `coworkRequest(path, orgId, method, body)` sends every request of this file. A failure throws an Error with the message `Cowork endpoint returned <status>: <message>` and the HTTP status in `error.status`. content/cf-cowork-import.js counts a 404 from the list request as no sessions in that organization.
- `coworkTurnFinished(id, orgId)` reads the newest 50 events of a session and is true when one is a `result` event. The measured session's log had 13 `result` events (docs/notes/lib/cowork-markdown.js.md). The import waits for the first one in a task it started.
- `renameCoworkSession(id, title, orgId)` sends `PUT /v1/code/sessions/<id>` with `{"title": "<title>"}`, then `POST /v1/code/sessions/<id>/events` with one `control_request` event of subtype `rename_session` and the same title. Measured 2026-10-28 in Chrome: Claude's Rename dialog for a Cowork session sent these two requests.
- `GET /v1/code/sessions/<id>` for an id outside the tagged format (measured with `cse_016OtherAcctTask00000001`) answered 400 "invalid session ID: must be a cse_… or session_… tagged ID".
