// content/cf-composer.js
// Drives Claude's message composer on /new for an import run and the organize request.
// Globals: CF_COMPOSER, cfSleep, cfWaitFor, cfComposerReady, cfSelectSurface, cfSurfaceChecked, cfAttachFile,
//          cfInsertPrompt, cfSendWhenReady, cfWaitForNewConversation, cfWaitForReplyDone
// Depends on: content/cf-text.js (cfStripGlyphs)
// Notes: docs/notes/content/cf-composer.js.md

// Selectors measured on claude.ai's /new page; see the notes for the measurement
const CF_COMPOSER = {
  input: '[data-testid="chat-input"]',
  file: 'input[data-testid="file-upload"]',
  send: 'button[data-testid="chat-input-send"]',
  surface: '[role="radiogroup"][aria-label="Surface"]',
  thumbnail: '[data-testid="file-thumbnail"]',
  stop: 'button[aria-label*="Stop" i]',
  reply: '[data-testid="assistant-message"]'
};

function cfSleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Polls until check() returns something truthy, or returns null at the timeout
async function cfWaitFor(check, timeoutMs, intervalMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = check();
    if (value) return value;
    await cfSleep(intervalMs || 250);
  }
  return null;
}

// Ready means the input and the file input are on the page. The send button is
// waited for later, in cfSendWhenReady.
async function cfComposerReady(timeoutMs) {
  return cfWaitFor(() => {
    const input = document.querySelector(CF_COMPOSER.input);
    const file = document.querySelector(CF_COMPOSER.file);
    return input && file ? { input, file } : null;
  }, timeoutMs, 300);
}

// The composer's Surface group has Chat and Cowork. A page without the group
// counts as the Chat surface.
function cfSelectSurface(label) {
  const group = document.querySelector(CF_COMPOSER.surface);
  if (!group) return label === 'chat';
  const radio = Array.from(group.querySelectorAll('[role="radio"]'))
    .find(el => cfStripGlyphs(el.textContent).toLowerCase() === label);
  if (!radio) return false;
  if (radio.getAttribute('aria-checked') !== 'true') radio.click();
  return true;
}

// True once the Surface group shows the label as checked, or when the page has no Surface group
function cfSurfaceChecked(label) {
  const group = document.querySelector(CF_COMPOSER.surface);
  if (!group) return label === 'chat';
  return Array.from(group.querySelectorAll('[role="radio"]'))
    .some(el => cfStripGlyphs(el.textContent).toLowerCase() === label && el.getAttribute('aria-checked') === 'true');
}

// Sets the file on Claude's own upload input; the page's change handler attaches it
async function cfAttachFile(fileInput, filename, text) {
  const before = document.querySelectorAll(CF_COMPOSER.thumbnail).length;
  const transfer = new DataTransfer();
  transfer.items.add(new File([text], filename, { type: 'text/markdown' }));
  fileInput.files = transfer.files;
  fileInput.dispatchEvent(new Event('change', { bubbles: true }));
  const attached = await cfWaitFor(() => document.querySelectorAll(CF_COMPOSER.thumbnail).length > before, 20000, 250);
  return !!attached;
}

// The result is the browser's own answer for the insert: false means the text was not inserted.
// On a /new tab that had just loaded, Claude's editor drew the inserted text 100 ms after insertText
// returned true (measured 2026-10-31). The box's text is therefore not read back to judge the insert.
function cfInsertPrompt(input, text) {
  input.focus();
  return document.execCommand('insertText', false, text);
}

// Sends once the send button is enabled and the message box shows the typed request. The button is
// disabled while an attachment uploads; with an attachment it is enabled before the editor has drawn
// the request, and a click then sent the attachment alone (harness, 2026-11-01).
async function cfSendWhenReady(timeoutMs, input, text) {
  const start = cfStripGlyphs(text || '').slice(0, 40);
  const send = await cfWaitFor(() => {
    const btn = document.querySelector(CF_COMPOSER.send);
    const shown = !start || cfStripGlyphs(input.innerText).startsWith(start);
    return btn && !btn.disabled && shown ? btn : null;
  }, timeoutMs, 300);
  if (!send) return false;
  send.click();
  return true;
}

// The page address is /chat/<uuid> once a chat exists and /cowork/<id> once a Cowork task does
async function cfWaitForNewConversation(timeoutMs) {
  return cfWaitFor(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/chat\/([0-9a-f-]{36})/i) || path.match(/^\/cowork\/(cse_[A-Za-z0-9]+)/);
    return match ? match[1] : null;
  }, timeoutMs, 300);
}

// A reply is done once a reply is on the page and the stop button is absent for two checks in a row
async function cfWaitForReplyDone(timeoutMs) {
  let quietChecks = 0;
  const done = await cfWaitFor(() => {
    const streaming = !!document.querySelector(CF_COMPOSER.stop);
    const replied = !!document.querySelector(CF_COMPOSER.reply);
    quietChecks = !streaming && replied ? quietChecks + 1 : 0;
    return quietChecks >= 2;
  }, timeoutMs, 1000);
  return !!done;
}
