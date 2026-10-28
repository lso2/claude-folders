// content/cf-cowork-share.js
// Shares a Cowork session through a chat copy that is opened in Claude's Share dialog.
// Globals: CF_SHARE_BUTTON, CF_SHARE_POPOVER, CF_SHARE_WAIT_MS, CF_OPEN_SHARE_KEY,
//          cfCoworkFolderFor, cfCoworkPrompt, cfCoworkImportSource, cfShareCoworkPage,
//          cfOpenShareFor, cfOpenShareDialog, cfOpenPendingShare
// Depends on: lib/cowork-api.js, lib/cowork-markdown.js, content/cf-import.js,
//             content/cf-import-registry.js, content/cf-composer.js (cfWaitFor), content/cf-notify.js
// Notes: docs/notes/content/cf-cowork-share.js.md

// Measured on a /chat/ page: the header's Share button and its popover
const CF_SHARE_BUTTON = 'button[data-testid="wiggle-controls-actions-share"]';
const CF_SHARE_POPOVER = '[data-testid="share-popover"]';
const CF_SHARE_WAIT_MS = 20000;
// Id of the chat whose Share dialog is opened on that chat's next page load
const CF_OPEN_SHARE_KEY = 'cf-open-share';

// The copy is filed in the session's folder, or in Unsorted when the session is in none
function cfCoworkFolderFor(sessionId) {
  const folder = folders.find(f => (f.chats || []).some(c => c.id === sessionId));
  return folder
    ? { folderId: folder.id, folderName: folder.name, category: folder.category }
    : { folderId: 'unsorted', folderName: 'Unsorted Chats', category: 'Personal' };
}

function cfCoworkPrompt(item) {
  return `Attached is an exported transcript of my Cowork session "${item.title}". It has the messages and tool calls without the tool results. ` +
    'Reconstruct it here as our working context. Summarize what was asked and what was concluded, ' +
    'list the key facts, decisions and open questions, and keep any code, documents or drafts from it intact. ' +
    'Then treat that session as ours and continue from where it ended.';
}

// The full export is written to the data folder. The attached copy has the messages and
// tool calls only.
async function cfCoworkImportSource(item) {
  const events = await fetchCoworkEvents(item.sessionId, item.orgId);
  if (!coworkEventsToMessages(events).length) throw new Error('the Cowork session has no messages');
  const session = { id: item.sessionId, title: item.title };
  return {
    sourceId: item.sessionId,
    filename: generateExportFilename(item.sessionId, item.title),
    exportMarkdown: coworkToMarkdown(session, events),
    attachMarkdown: coworkToBriefMarkdown(session, events),
    prompt: cfCoworkPrompt(item),
    importedFrom: { coworkSessionId: item.sessionId },
    folderId: item.folderId,
    folderName: item.folderName,
    category: item.category
  };
}

// The Share button on a /cowork/ page
async function cfShareCoworkPage(btn, sessionId) {
  const restore = cfSetButtonBusy(btn, 'Preparing...');
  try {
    const orgId = await window.chatExporter.getActiveOrganizationId();
    const session = await fetchCoworkSession(sessionId, orgId);
    const item = {
      kind: 'cowork',
      sessionId,
      orgId,
      title: session.title || cfCurrentChatTitle(),
      share: true,
      ...cfCoworkFolderFor(sessionId)
    };
    const earlier = (await cfLoadImported())[sessionId];
    if (earlier && earlier.chatId) {
      const day = String(earlier.importedAt || earlier.recordedAt || '').split('T')[0];
      cfNotifyAction('import', `"${item.title}" has a chat copy from ${day}.`, [
        { label: 'Share that copy', primary: true, onClick: () => cfOpenShareFor(earlier.chatId) },
        { label: 'Make a new copy', onClick: () => cfStartImportRun([item]) }
      ]);
      return;
    }
    const confirmed = await cfConfirm(
      `Share "${item.title}"?`,
      'Claude\'s Share works on chats. A new chat is started with this session\'s messages and tool calls attached, and Claude\'s Share dialog is opened for that chat once Claude replies.',
      'Copy and share'
    );
    if (confirmed) await cfStartImportRun([item]);
  } catch (e) {
    showNotification('Share failed: ' + e.message, true);
  } finally {
    restore();
  }
}

function cfOpenShareFor(chatId) {
  sessionStorage.setItem(CF_OPEN_SHARE_KEY, chatId);
  if (window.location.pathname === `/chat/${chatId}`) cfOpenPendingShare();
  else window.location.assign(`/chat/${chatId}`);
}

// Returns whether the popover is showing
async function cfOpenShareDialog() {
  const button = await cfWaitFor(() => document.querySelector(CF_SHARE_BUTTON), CF_SHARE_WAIT_MS, 300);
  if (!button) return false;
  if (!document.querySelector(CF_SHARE_POPOVER)) button.click();
  return !!await cfWaitFor(() => document.querySelector(CF_SHARE_POPOVER), 5000, 200);
}

// Called on every page load. The request is dropped on any other page.
async function cfOpenPendingShare() {
  const chatId = sessionStorage.getItem(CF_OPEN_SHARE_KEY);
  if (!chatId) return;
  sessionStorage.removeItem(CF_OPEN_SHARE_KEY);
  if (window.location.pathname !== `/chat/${chatId}`) return;
  if (!await cfOpenShareDialog()) {
    showNotification(`Claude's Share button did not appear on this chat within ${CF_SHARE_WAIT_MS / 1000} seconds.`, true);
  }
}
