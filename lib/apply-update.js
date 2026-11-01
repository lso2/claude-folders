// lib/apply-update.js
// Reloads the extension when its files on disk or its running background differ from the running manifest.
// Loaded right after lib/build-reload.js by the popup, the organizer, the access window and
// update/index.html, whose files are read from disk each time one opens.
// Globals: applyDiskUpdate
// Depends on: lib/build-reload.js (cfReloadForBuild)
// Notes: docs/notes/lib/apply-update.js.md

// The running manifest of an unpacked extension is the one loaded at its last reload or browser start.
// A background older than 1.3.14 has no backgroundBuild action and answers with an error.
async function applyDiskUpdate() {
  const running = chrome.runtime.getManifest().version;
  try {
    const res = await fetch(chrome.runtime.getURL('manifest.json'), { cache: 'no-store' });
    const onDisk = (await res.json()).version;
    if (onDisk && onDisk !== running) return cfReloadForBuild(running, onDisk, 'extension');
  } catch (e) {
    console.log('[UPDATE] Could not compare the manifest on disk:', e.message);
  }
  try {
    const answer = await chrome.runtime.sendMessage({ action: 'backgroundBuild' });
    const build = (answer && answer.build) || 'a build without a number';
    if (build !== running) return cfReloadForBuild(build, running, 'background');
  } catch (e) {
    console.log('[UPDATE] The background did not answer for its build:', e.message);
  }
  return false;
}

applyDiskUpdate();
