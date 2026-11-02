// lib/account-file-list.js
// Lists the account data files of one folder, data.<account key>.json, with each file's data.
// Loaded by the offscreen document and the access window (through lib/account-files.js) and by the offline library.
// Globals: CF_ACCOUNT_FILE_PATTERN, cfListAccountFiles
// Notes: docs/notes/lib/account-file-list.js.md

// data.json and data.js mirror the active account for the standalone viewer and are not listed
const CF_ACCOUNT_FILE_PATTERN = /^data\.(acct_[a-z0-9_-]+)\.json$/i;

// known maps a file name to the lastModified of the copy the caller holds, or is null. A file with that same time
// is listed without its data. Returns [{ name, key, lastModified, size, data or error }].
async function cfListAccountFiles(handle, known) {
  const files = [];
  for await (const entry of handle.values()) {
    const match = entry.kind === 'file' ? CF_ACCOUNT_FILE_PATTERN.exec(entry.name) : null;
    if (!match) continue;
    const file = await entry.getFile();
    const item = { name: entry.name, key: match[1], lastModified: file.lastModified, size: file.size };
    if (!known || known[entry.name] !== file.lastModified) {
      try {
        item.data = JSON.parse(await file.text());
      } catch (e) {
        item.error = `${e.name}: ${e.message}`;
      }
    }
    files.push(item);
  }
  return files;
}
