// content/cf-build-check.js
// Opens the extension's update page in a hidden frame when the background is older than these page scripts.
// Globals: cfCheckBackgroundBuild
// Notes: docs/notes/content/cf-build-check.js.md

// The update page (update/index.html) runs lib/apply-update.js, which reloads the extension. The new
// background then reloads the claude.ai tabs (reloadClaudeTabs in background.js).
async function cfCheckBackgroundBuild() {
  const scripts = chrome.runtime.getManifest().version;
  let answer;
  try {
    answer = await chrome.runtime.sendMessage({ action: 'backgroundBuild' });
  } catch (e) {
    console.log('[UPDATE] The background did not answer for its build:', e.message);
    return;
  }
  const build = answer && answer.build;
  if (build === scripts) return;
  console.log(`[UPDATE] The background is ${build || 'a build without a number'} and these page scripts are ${scripts}: opening the update page`);
  const frame = document.createElement('iframe');
  frame.src = chrome.runtime.getURL('update/index.html');
  frame.style.display = 'none';
  frame.dataset.cfUpdate = 'true';
  document.documentElement.appendChild(frame);
}
