// lib/apply-update.js
// Reloads the extension when the manifest version on disk differs from the running one.
// Loaded first by the popup, the organizer and the access window, whose files are read from disk on open.
// Globals: applyDiskUpdate
// Notes: docs/notes/lib/apply-update.js.md

// The running version of an unpacked extension is the one loaded at its last reload
async function applyDiskUpdate() {
  try {
    const res = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    const onDisk = (await res.json()).version;
    const running = chrome.runtime.getManifest().version;
    if (onDisk && onDisk !== running) {
      console.log('[UPDATE] Reloading. Files on disk are version', onDisk, 'and the running extension is', running);
      chrome.runtime.reload();
      return true;
    }
  } catch (e) {
    console.log('[UPDATE] Could not compare the manifest on disk:', e.message);
  }
  return false;
}

applyDiskUpdate();
