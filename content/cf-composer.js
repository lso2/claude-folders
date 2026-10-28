// content/cf-composer.js
// Drives Claude's message composer: picks the Chat surface, attaches a file, types and sends.
// Globals: CF_COMPOSER, cfSleep, cfWaitFor, cfComposerReady, cfSelectChatSurface, cfAttachFile,
//          cfInsertPrompt, cfSendWhenReady, cfWaitForNewChat, cfWaitForReplyDone
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

async function cfComposerReady(timeoutMs) {
  return cfWaitFor(() => {
    const input = document.querySelector(CF_COMPOSER.input);
    const file = document.querySelector(CF_COMPOSER.file);
    const send = document.querySelector(CF_COMPOSER.send);
    return input && file && send ? { input, file, send } : null;
  }, timeoutMs, 300);
}

// The composer offers Chat and Cowork; an imported transcript belongs in a chat
function cfSelectChatSurface() {
  const group = document.querySelector(CF_COMPOSER.surface);
  if (!group) return true;
  const chatRadio = Array.from(group.querySelectorAll('[role="radio"]'))
    .find(el => cfStripGlyphs(el.textContent).toLowerCase() === 'chat');
  if (!chatRadio) return false;
  if (chatRadio.getAttribute('aria-checked') !== 'true') chatRadio.click();
  return true;
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

function cfInsertPrompt(input, text) {
  input.focus();
  document.execCommand('insertText', false, text);
  return cfStripGlyphs(input.innerText).startsWith(cfStripGlyphs(text).slice(0, 40));
}

// The send button is disabled while an attachment upload is in progress
async function cfSendWhenReady(timeoutMs) {
  const send = await cfWaitFor(() => {
    const btn = document.querySelector(CF_COMPOSER.send);
    return btn && !btn.disabled ? btn : null;
  }, timeoutMs, 300);
  if (!send) return false;
  send.click();
  return true;
}

// The page address is /chat/<id> once the conversation exists
async function cfWaitForNewChat(timeoutMs) {
  return cfWaitFor(() => {
    const match = window.location.pathname.match(/^\/chat\/([0-9a-f-]{36})/i);
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
