// standalone/library-store.js
// Reads and stores one value in this page's localStorage, for the library's view, sort and sidebar choices.
// The extension's pages have lib/page-store.js with the same names.
// Globals: LIBRARY_STORE_PREFIX, cfStoreGet, cfStoreSet
// Notes: docs/notes/standalone/library-store.js.md

// Every page opened from disk shares one localStorage, so the keys carry the library's name
const LIBRARY_STORE_PREFIX = 'claudeFoldersLibrary.';

// A browser that blocks storage for pages opened from disk throws here, and the caller logs it
async function cfStoreGet(key) {
  const text = localStorage.getItem(LIBRARY_STORE_PREFIX + key);
  return text === null ? undefined : JSON.parse(text);
}

async function cfStoreSet(key, value) {
  localStorage.setItem(LIBRARY_STORE_PREFIX + key, JSON.stringify(value));
}
