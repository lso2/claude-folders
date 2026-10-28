// content/cf-text.js
// Cleans and escapes text read from Claude's page before it is compared or rendered.
// Globals: CF_GLYPH_CHARS, cfStripGlyphs, cfIsGlyphOnly, cfEscapeHtml, cfSafeUrl, cfHash
// Notes: docs/notes/content/cf-text.js.md

// Claude ships icon glyphs as private-use codepoints inside label text nodes
const CF_GLYPH_CHARS = /[\u{0}-\u{1f}\u{ad}\u{200b}-\u{200f}\u{2060}\u{feff}\u{e000}-\u{f8ff}\u{f0000}-\u{ffffd}\u{100000}-\u{10fffd}]/gu;

function cfStripGlyphs(text) {
  return String(text || '').replace(CF_GLYPH_CHARS, '').replace(/\s+/g, ' ').trim();
}

// True when a text node holds nothing but an icon glyph or invisible padding
function cfIsGlyphOnly(text) {
  return cfStripGlyphs(text).length === 0;
}

// Every user-supplied string goes through here before it reaches innerHTML
function cfEscapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only http(s) and site-relative links reach an href
function cfSafeUrl(url) {
  const s = String(url || '');
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return cfEscapeHtml(s);
  return '#';
}

function cfHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
