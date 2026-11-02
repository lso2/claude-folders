// lib/update-notice.js
// Shows the notice for a newer Claude Folders on GitHub, and the Check for updates button's answer.
// Loaded by the popup, the organizer and the claude.ai content scripts (manifest.json).
// Globals: CF_UPDATE_PAGE_URL, CF_UPDATE_RESULT_MS, cfUpdateAnswer, cfAskForUpdate, cfRenderUpdateNotices,
//          cfWireUpdateCheck
// Depends on: lib/storage-keys.js (UPDATE_DISMISSED_KEY), background.js (checkForUpdate, lib/update-check.js)
// Notes: docs/notes/lib/update-notice.js.md

const CF_UPDATE_PAGE_URL = 'https://github.com/lso2/claude-folders/releases';
// The answer to a click stays on the button this long
const CF_UPDATE_RESULT_MS = 6000;
// The background's last answer in this page
let cfUpdateAnswer = null;

// force asks GitHub again; without it the background reuses an answer from the last 6 hours
async function cfAskForUpdate(force) {
  try {
    cfUpdateAnswer = await chrome.runtime.sendMessage({ action: 'checkForUpdate', force: force === true });
  } catch (e) {
    cfUpdateAnswer = { success: false, error: e.message };
  }
  cfRenderUpdateNotices();
  return cfUpdateAnswer;
}

// Each .cf-update-slot holds the notice while GitHub has a newer version that was not hidden with ×
function cfRenderUpdateNotices() {
  const a = cfUpdateAnswer;
  const show = !!(a && a.success && a.available && !a.dismissed);
  document.querySelectorAll('.cf-update-slot').forEach(slot => {
    slot.replaceChildren();
    if (!show) return;
    const box = document.createElement('div');
    box.className = 'cf-update-notice';
    box.setAttribute('role', 'status');
    const text = document.createElement('span');
    text.className = 'cf-update-text';
    text.textContent = `Claude Folders ${a.latest} is on GitHub. This browser has ${a.current}.`;
    const link = document.createElement('a');
    link.className = 'cf-update-link';
    link.href = CF_UPDATE_PAGE_URL;
    link.target = '_blank';
    link.rel = 'noopener';
    link.textContent = 'Open GitHub';
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'cf-update-close';
    close.title = `Hide until a version after ${a.latest}`;
    close.setAttribute('aria-label', close.title);
    close.textContent = '×';
    close.addEventListener('click', async () => {
      await chrome.storage.local.set({ [UPDATE_DISMISSED_KEY]: a.latest });
      cfUpdateAnswer = { ...a, dismissed: true };
      cfRenderUpdateNotices();
    });
    box.append(text, link, close);
    slot.appendChild(box);
  });
}

// A click asks GitHub again and shows the answer on the button for a few seconds
function cfWireUpdateCheck(button) {
  if (!button || button.dataset.wired) return;
  button.dataset.wired = '1';
  const label = button.textContent;
  button.addEventListener('click', async () => {
    button.disabled = true;
    button.textContent = 'Checking...';
    const a = await cfAskForUpdate(true);
    if (!a || !a.success || a.error) button.textContent = `Check failed: ${(a && a.error) || 'no answer'}`;
    else if (a.available) button.textContent = `${a.latest} is available`;
    else button.textContent = `Up to date (${a.current})`;
    button.disabled = false;
    setTimeout(() => { button.textContent = label; }, CF_UPDATE_RESULT_MS);
  });
}
