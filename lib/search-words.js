// lib/search-words.js
// Turns export text and search box text into the lowercase words the content search compares.
// Loaded by the access window and the offscreen writer (indexing) and by the organizer (searching).
// Globals: CF_SEARCH_WORDS_VERSION, CF_SEARCH_WORD_RE, CF_SEARCH_WORD_MIN, CF_SEARCH_WORD_MAX, cfSearchWords,
//          cfSearchTokens
// Notes: docs/notes/lib/search-words.js.md

// Stored with each indexed file. A file indexed under another version is read again.
const CF_SEARCH_WORDS_VERSION = 1;
// Runs of letters and digits in any script. Spaces, punctuation and underscores end a word.
const CF_SEARCH_WORD_RE = /[\p{L}\p{N}]+/gu;
const CF_SEARCH_WORD_MIN = 2;
const CF_SEARCH_WORD_MAX = 40;

// The text's distinct words of 2 to 40 characters, as one string with a space before each word and after the last
function cfSearchWords(text) {
  const words = new Set();
  for (const match of String(text || '').toLowerCase().matchAll(CF_SEARCH_WORD_RE)) {
    const word = match[0];
    if (word.length >= CF_SEARCH_WORD_MIN && word.length <= CF_SEARCH_WORD_MAX) words.add(word);
  }
  return ' ' + Array.from(words).join(' ') + ' ';
}

// The search box text as words. A file matches when each of them is part of one of its words.
function cfSearchTokens(query) {
  const tokens = Array.from(String(query || '').toLowerCase().matchAll(CF_SEARCH_WORD_RE), m => m[0]);
  return Array.from(new Set(tokens.filter(t => t.length >= CF_SEARCH_WORD_MIN && t.length <= CF_SEARCH_WORD_MAX)));
}
