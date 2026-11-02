// lib/page-store.js
// Reads and stores one value in chrome.storage.local for the extension's pages.
// Loaded by the organizer and the settings page. The offline library has standalone/library-store.js with the same names.
// Globals: cfStoreGet, cfStoreSet
// Notes: docs/notes/lib/page-store.js.md

async function cfStoreGet(key) {
  return (await chrome.storage.local.get(key))[key];
}

async function cfStoreSet(key, value) {
  await chrome.storage.local.set({ [key]: value });
}
