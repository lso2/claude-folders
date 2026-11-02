// lib/html-escape.js
// Escapes text for innerHTML and attribute values.
// Loaded by the organizer, its export view, and the offline library and its view (copied by lib/data-file.js).
// Globals: cfHtmlEscape
// Notes: docs/notes/lib/html-escape.js.md

function cfHtmlEscape(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
