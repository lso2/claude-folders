// content/cf-organize-auto.js
// The one-click organize: sends the pasted organize request, waits for Claude's answer and opens it for applying.
// Globals: CF_ORGANIZE_AUTO_KEY, CF_ORGANIZE_SEND_WAIT_MS, CF_ORGANIZE_REPLY_WAIT_MS, cfSendOrganizeRequest,
//          cfResumeOrganizeAuto, cfFinishOrganizeAuto, cfOpenOrganizeAnswer, cfOrganizeReplyText
// Depends on: content/cf-composer.js (cfSendWhenReady, cfWaitForNewConversation, cfWaitForReplyDone),
//             lib/chat-exporter.js (window.chatExporter.fetchConversationData), lib/cowork-api.js (isCoworkSessionId,
//             fetchCoworkEvents), lib/cowork-markdown.js (coworkEventsToMessages),
//             content/cf-notify.js (cfNotifyAction, cfClearNotice), content/cf-data.js (loadData),
//             content/cf-account.js (cfAccountReady), content/cf-organize-modal.js (showApplyCategoriesModal)
// Notes: docs/notes/content/cf-organize-auto.js.md

// The chat whose answer this tab opens for applying. A reload of the tab while Claude answers reads it again.
const CF_ORGANIZE_AUTO_KEY = 'cf-organize-auto';
// Longest wait for the send button and then for the new chat's address
const CF_ORGANIZE_SEND_WAIT_MS = 60000;
// Longest wait for the answer. Claude's answer for 2,000 titles is a long JSON reply.
const CF_ORGANIZE_REPLY_WAIT_MS = 10 * 60 * 1000;

// input: the message box holding the pasted request (content/cf-pending.js)
async function cfSendOrganizeRequest(input, prompt) {
  cfNotifyAction('organize', 'Sending the organize request to Claude.', []);
  if (!await cfSendWhenReady(CF_ORGANIZE_SEND_WAIT_MS, input, prompt)) {
    cfNotifyAction('organize', `The organize request was not sent: for ${CF_ORGANIZE_SEND_WAIT_MS / 1000} seconds, the send button was missing or disabled, or the message box did not show the request. The request is in the message box for sending by hand, and Claude's answer can be pasted into Apply Claude's Response in the Folders panel.`, [], true);
    return;
  }
  const chatId = await cfWaitForNewConversation(CF_ORGANIZE_SEND_WAIT_MS);
  if (!chatId) {
    cfNotifyAction('organize', `The page address did not change to a new chat within ${CF_ORGANIZE_SEND_WAIT_MS / 1000} seconds of sending. Claude's answer can be pasted into Apply Claude's Response in the Folders panel.`, [], true);
    return;
  }
  sessionStorage.setItem(CF_ORGANIZE_AUTO_KEY, chatId);
  console.log('[ORGANIZE] Request sent in chat', chatId);
  await cfFinishOrganizeAuto(chatId);
}

// Called on every page load. A tab that left the chat drops the one-click run.
async function cfResumeOrganizeAuto() {
  const chatId = sessionStorage.getItem(CF_ORGANIZE_AUTO_KEY);
  if (!chatId) return;
  if (window.location.pathname !== (isCoworkSessionId(chatId) ? `/cowork/${chatId}` : `/chat/${chatId}`)) {
    sessionStorage.removeItem(CF_ORGANIZE_AUTO_KEY);
    return;
  }
  console.log('[ORGANIZE] Waiting again for the answer in chat', chatId, 'after the tab was reloaded');
  await cfFinishOrganizeAuto(chatId);
}

async function cfFinishOrganizeAuto(chatId) {
  cfNotifyAction('organize', 'Claude is answering the organize request. The preview of the folders is shown here when the answer is finished.', []);
  if (!await cfWaitForReplyDone(CF_ORGANIZE_REPLY_WAIT_MS)) {
    cfNotifyAction('organize', `Claude's answer was not finished within ${CF_ORGANIZE_REPLY_WAIT_MS / 60000} minutes.`, [
      { label: 'Read the answer now', primary: true, onClick: () => cfOpenOrganizeAnswer(chatId) }
    ], true);
    return;
  }
  await cfOpenOrganizeAnswer(chatId);
}

// The preview opens with the answer in its box, and Apply & Save stays a click of the person's
async function cfOpenOrganizeAnswer(chatId) {
  sessionStorage.removeItem(CF_ORGANIZE_AUTO_KEY);
  let text;
  try {
    text = await cfOrganizeReplyText(chatId);
  } catch (e) {
    cfNotifyAction('organize', `Claude's answer was not read from chat ${chatId}: ${e.message}`, [], true);
    return;
  }
  cfClearNotice('organize');
  // The preview resolves Claude's numbers through this login's stored index (content/cf-organize-modal.js)
  await cfAccountReady;
  await loadData();
  console.log('[ORGANIZE] Answer read from chat', chatId + ':', text.length, 'characters');
  await showApplyCategoriesModal(text);
}

// The text Claude wrote in its last answer, read from the chat's API or the Cowork session's event log.
// The rendered answer on the page starts with a "Claude responded:" preview and shows typographic quotes.
async function cfOrganizeReplyText(chatId) {
  const messages = isCoworkSessionId(chatId)
    ? coworkEventsToMessages(await fetchCoworkEvents(chatId, null))
    : (await window.chatExporter.fetchConversationData(chatId)).chat_messages;
  const answers = messages.filter(m => m && m.sender === 'assistant');
  const last = answers[answers.length - 1];
  if (!last) throw new Error('the chat has no answer of Claude\'s');
  const blocks = Array.isArray(last.content) ? last.content : [];
  const text = blocks.filter(b => b && b.type === 'text' && b.text).map(b => b.text).join('\n\n')
    || (typeof last.text === 'string' ? last.text : '');
  if (!text) throw new Error('Claude\'s last answer has no text block');
  return text;
}
