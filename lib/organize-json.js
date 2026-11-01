// lib/organize-json.js
// Reads Claude's organize answer, typed, pasted or read from the page, into its JSON object.
// Loaded by the content scripts and the popup.
// Globals: CF_JSON_SPACES, CF_JSON_ZERO_WIDTH, CF_JSON_CATEGORIES_START, CF_JSON_TYPOGRAPHIC_QUOTES, cfParseOrganizeJson
// Notes: docs/notes/lib/organize-json.js.md

// Unicode spaces JSON.parse does not accept as whitespace, turned into plain spaces or removed before the parse
const CF_JSON_SPACES = /[\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/g;
const CF_JSON_ZERO_WIDTH = /[\u200b-\u200d\u2060\ufeff]/g;

// The opening of the categories object, with straight or typographic quotes
const CF_JSON_CATEGORIES_START = /\{\s*["\u201c\u201d]categories["\u201c\u201d]/g;
const CF_JSON_TYPOGRAPHIC_QUOTES = /[\u201c\u201d]/g;

// The JSON runs from the last opening of the categories object to the last }. Text around it, such as a
// language label or a shortened preview of the same answer, is left out.
function cfParseOrganizeJson(text) {
  const clean = String(text || '').replace(CF_JSON_SPACES, ' ').replace(CF_JSON_ZERO_WIDTH, '').trim();
  if (!clean) throw new Error('the text box is empty');
  const starts = Array.from(clean.matchAll(CF_JSON_CATEGORIES_START)).map(m => m.index);
  const start = starts.length ? starts[starts.length - 1] : clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  const body = start >= 0 && end > start ? clean.slice(start, end + 1) : clean;
  let json;
  try {
    json = JSON.parse(body);
  } catch (e) {
    // Text copied from the rendered page has typographic quotes in place of the JSON quotes
    if (body.search(CF_JSON_TYPOGRAPHIC_QUOTES) < 0) throw e;
    try {
      json = JSON.parse(body.replace(CF_JSON_TYPOGRAPHIC_QUOTES, '"'));
    } catch (second) {
      throw e;
    }
  }
  if (!json || !Array.isArray(json.categories)) throw new Error('the JSON has no "categories" list');
  return json;
}
