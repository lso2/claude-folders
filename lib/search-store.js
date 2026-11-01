// lib/search-store.js
// Keeps the content search index in IndexedDB: each export file's size, modification time and distinct words.
// Loaded by the access window and the offscreen writer (indexing) and by the organizer (searching).
// Globals: CF_SEARCH_DB_NAME, CF_SEARCH_DB_VERSION, cfSearchDb, cfOpenSearchDb, cfSearchStoreAll, cfSearchWrite
// Notes: docs/notes/lib/search-store.js.md

const CF_SEARCH_DB_NAME = 'cfSearchIndex';
const CF_SEARCH_DB_VERSION = 1;
let cfSearchDb = null;

// 'meta' holds { name, size, lastModified, v } and 'words' holds { name, words }, both keyed by the export file name.
// The words are kept apart so the index can be compared with the folder without reading them.
function cfOpenSearchDb() {
  if (cfSearchDb) return Promise.resolve(cfSearchDb);
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(CF_SEARCH_DB_NAME, CF_SEARCH_DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains('meta')) db.createObjectStore('meta', { keyPath: 'name' });
      if (!db.objectStoreNames.contains('words')) db.createObjectStore('words', { keyPath: 'name' });
    };
    request.onsuccess = () => {
      cfSearchDb = request.result;
      cfSearchDb.onversionchange = () => {
        cfSearchDb.close();
        cfSearchDb = null;
      };
      resolve(cfSearchDb);
    };
    request.onerror = () => reject(request.error);
  });
}

// Every record of 'meta' or 'words'
async function cfSearchStoreAll(storeName) {
  const db = await cfOpenSearchDb();
  return new Promise((resolve, reject) => {
    const request = db.transaction(storeName, 'readonly').objectStore(storeName).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// entries: [{ meta, words }] to write. removed: file names to delete. Both in one transaction.
async function cfSearchWrite(entries, removed) {
  const db = await cfOpenSearchDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['meta', 'words'], 'readwrite');
    const meta = tx.objectStore('meta');
    const words = tx.objectStore('words');
    entries.forEach(entry => {
      meta.put(entry.meta);
      words.put({ name: entry.meta.name, words: entry.words });
    });
    removed.forEach(name => {
      meta.delete(name);
      words.delete(name);
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
