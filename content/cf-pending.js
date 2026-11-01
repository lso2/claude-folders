// content/cf-pending.js
// Finishes work that a previous page or the background started for this tab: a sync or an organize request.
// Globals: CF_ORGANIZE_PASTE_WAIT_MS, checkPendingSync, checkPendingOrganizeData, cfPasteOrganizeRequest
// Depends on: content/cf-composer.js (CF_COMPOSER, cfWaitFor, cfSelectSurface, cfSurfaceChecked, cfInsertPrompt), content/cf-notify.js,
//             content/cf-sync.js (scrapeRecentsPage), lib/organize-tabs.js (background),
//             content/cf-organize-auto.js (cfSendOrganizeRequest)
// Notes: docs/notes/content/cf-pending.js.md

// Longest wait for Claude's message box before the organize request is reported as not pasted
const CF_ORGANIZE_PASTE_WAIT_MS = 30000;

async function checkPendingSync() {
  if (sessionStorage.getItem('cf-pending-sync') !== 'true') return;
  sessionStorage.removeItem('cf-pending-sync');
  console.log('[CONTENT] Running pending sync after navigation to recents');
  if (window.location.pathname.includes('/recents')) {
    setTimeout(() => scrapeRecentsPage(), 2000);
  } else {
    console.log('[CONTENT] Not on recents page, skipping sync');
  }
}

// The background stores the request under the id of the /new tab it opened, until the paste is reported from this tab
async function checkPendingOrganizeData() {
  if (window.location.pathname !== '/new') return;
  let answer = null;
  try {
    answer = await chrome.runtime.sendMessage({ action: 'getOrganizePrompt' });
  } catch (e) {
    console.log('[ORGANIZE] The organize request was not read from the background:', e.message);
    return;
  }
  if (!answer || !answer.prompt) return;
  await cfPasteOrganizeRequest(answer.prompt, answer.auto === true);
}

// auto: the one-click version sends the pasted request and opens the answer (content/cf-organize-auto.js)
async function cfPasteOrganizeRequest(prompt, auto) {
  const started = performance.now();
  cfNotifyAction('organize', 'Waiting for the message box to load before pasting the organize request.', []);
  const input = await cfWaitFor(() => document.querySelector(CF_COMPOSER.input), CF_ORGANIZE_PASTE_WAIT_MS, 200);
  console.log('[ORGANIZE] Message box', input ? 'found' : 'not found', 'after', Math.round(performance.now() - started),
    'ms of waiting,', Math.round(performance.now()), 'ms after the page started loading');
  if (!input) {
    cfNotifyAction('organize', `The message box did not appear within ${CF_ORGANIZE_PASTE_WAIT_MS / 1000} seconds. Reloading this tab pastes the organize request again.`,
      [{ label: 'Reload', primary: true, onClick: () => window.location.reload() }], true);
    return;
  }
  // The request goes to a chat. /new opens on the Surface the person used last, which can be Cowork.
  if (!cfSelectSurface('chat') || !await cfWaitFor(() => cfSurfaceChecked('chat'), 10000, 200)) {
    cfNotifyAction('organize', "The organize request was not pasted: the composer's Chat option was not found or not checked within 10 seconds.", [], true);
    return;
  }
  // The tab is opened for this request. Any text already in the message box is replaced.
  input.focus();
  if (input.innerText.trim()) document.execCommand('selectAll', false, null);
  if (!cfInsertPrompt(input, prompt)) {
    cfNotifyAction('organize', "The organize request was not typed into the message box: the browser's insertText command returned false.", [{
      label: 'Copy request',
      primary: true,
      onClick: () => navigator.clipboard.writeText(prompt)
        .then(() => showNotification('The organize request is copied. Paste it into the message box.'))
        .catch(e => showNotification('The organize request was not copied: ' + e.message, true))
    }], true);
    return;
  }
  try {
    await chrome.runtime.sendMessage({ action: 'organizePromptPasted' });
  } catch (e) {
    console.log('[ORGANIZE] The background was not told about the paste:', e.message);
  }
  console.log('[ORGANIZE] Request pasted', Math.round(performance.now() - started), 'ms after this tab read it');
  if (auto) {
    await cfSendOrganizeRequest(input, prompt);
    return;
  }
  cfNotifyAction('organize', "The organize request is in the message box. Send it, then paste Claude's answer with Apply Claude's Response in the Folders panel.", []);
}
