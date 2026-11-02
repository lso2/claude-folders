// lib/html-escape.js
// Escapes text for innerHTML and attribute values.
// Loaded by the organizer, its export view, and the offline library and its view (copied by lib/data-file.js).
// Globals: cfHtmlEscape, esc, safeUrl
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

// The organizer's and the library's name for cfHtmlEscape
function esc(value) {
  return cfHtmlEscape(value);
}

// An http(s) or root-relative address, escaped for an href, or # for anything else
function safeUrl(url) {
  const s = String(url || '');
  return (/^https?:\/\//i.test(s) || s.startsWith('/')) ? esc(s) : '#';
}
