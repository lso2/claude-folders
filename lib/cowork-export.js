// lib/cowork-export.js
// Builds the markdown export of one Cowork session from its id.
// Loaded by the content scripts, the offscreen writer and the access window.
// Globals: exportCoworkSession
// Depends on: lib/chat-markdown.js (generateExportFilename), lib/cowork-api.js,
//             lib/cowork-markdown.js
// Notes: docs/notes/lib/cowork-export.js.md

// The result holds no events: it crosses the extension message channel to the organizer.
// A title passed in names the file; without one the session's own title is read.
// The mark is the session's newest turn event number (coworkTurnMark).
// onProgress(text) gets the event count while the events are read.
async function exportCoworkSession(sessionId, title, orgId, onProgress) {
  try {
    const events = await fetchCoworkEvents(sessionId, orgId, onProgress
      ? (read, total) => onProgress(`${read.toLocaleString('en-US')} of ${Math.max(read, total).toLocaleString('en-US')} events`)
      : null);
    if (!coworkEventsToMessages(events).length) return { success: false, error: 'No messages' };
    const name = title || (await fetchCoworkSession(sessionId, orgId)).title || 'Untitled Cowork session';
    return {
      success: true,
      markdown: coworkToMarkdown({ id: sessionId, title: name }, events),
      filename: generateExportFilename(sessionId, name),
      mark: coworkTurnMark(events)
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}
