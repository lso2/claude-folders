// lib/build-reload.js
// Reloads the extension once when the code running is older than the extension's files.
// Loaded by the service worker (CF_BACKGROUND_FILES in background.js) and by every page that loads
// lib/apply-update.js.
// Globals: CF_BUILD_RELOAD_KEY, CF_BUILD_RELOAD_WINDOW_MS, cfReloadForBuild
// Notes: docs/notes/lib/build-reload.js.md

// The last reload started here: { pair, by, at }
const CF_BUILD_RELOAD_KEY = 'cfBuildReload';
// The same two versions found again inside this time mean the last reload did not replace the code
const CF_BUILD_RELOAD_WINDOW_MS = 10 * 60 * 1000;

// running: the version of the code running now. files: the version of the extension's files.
// by: what found the difference. True when a reload was started.
async function cfReloadForBuild(running, files, by) {
  const pair = `${running} -> ${files}`;
  let last = null;
  try {
    last = (await chrome.storage.local.get(CF_BUILD_RELOAD_KEY))[CF_BUILD_RELOAD_KEY] || null;
  } catch (e) {
    console.log('[UPDATE] The last reload was not read:', e.message);
  }
  if (last && last.pair === pair && Date.now() - Date.parse(last.at) < CF_BUILD_RELOAD_WINDOW_MS) {
    console.log(`[UPDATE] Not reloading: the ${by} is ${running} with files ${files} again after the reload at ${last.at}`);
    return false;
  }
  try {
    await chrome.storage.local.set({ [CF_BUILD_RELOAD_KEY]: { pair, by, at: new Date().toISOString() } });
  } catch (e) {
    console.log('[UPDATE] The reload was not recorded:', e.message);
  }
  console.log(`[UPDATE] Reloading the extension: the ${by} is ${running} and the files are ${files}`);
  chrome.runtime.reload();
  return true;
}
