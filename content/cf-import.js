// content/cf-import.js
// Imports shared chats as new chats: exports each transcript, attaches it on /new and asks Claude to reconstruct it.
// Globals: CF_IMPORT_OWNER_KEY, CF_REPLY_WAIT_MS, cfImportOwnerToken, cfLoadImportQueue,
//          cfSaveImportQueue, cfImportPrompt, cfImportSharePage, cfImportAllShared,
//          cfStartImportRun, cfResumeImport, cfRunImportStep, cfRenameImportedChat,
//          cfFinishImportStep, cfAdvanceImport, cfFinishImportRun
// Depends on: lib/share-snapshots.js, lib/chat-markdown.js, content/cf-composer.js,
//             content/cf-import-registry.js, content/cf-disk.js, content/cf-notify.js,
//             content/cf-sync.js (cfHeldChatIds)
// Notes: docs/notes/content/cf-import.js.md

// A run is resumed only in the tab whose sessionStorage has this token
const CF_IMPORT_OWNER_KEY = 'cf-import-owner';

// Longest wait for Claude's reply before the run moves to the next shared chat
const CF_REPLY_WAIT_MS = 5 * 60 * 1000;

function cfImportOwnerToken(create) {
  let token = sessionStorage.getItem(CF_IMPORT_OWNER_KEY);
  if (!token && create) {
    token = 'run_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem(CF_IMPORT_OWNER_KEY, token);
  }
  return token;
}

async function cfLoadImportQueue() {
  const stored = await chrome.storage.local.get(cfImportQueueKey());
  return stored[cfImportQueueKey()] || null;
}

async function cfSaveImportQueue(queue) {
  if (queue) await chrome.storage.local.set({ [cfImportQueueKey()]: queue });
  else await chrome.storage.local.remove(cfImportQueueKey());
}

function cfImportPrompt(item, snapshot) {
  const title = snapshot.snapshot_name || item.title;
  const who = item.creatorName || (snapshot.creator && snapshot.creator.full_name) || '';
  const sharer = who ? `a conversation ${who} shared with me` : 'a conversation shared with me';
  const where = item.projectName ? ` in the "${item.projectName}" project` : '';
  return `Attached is an exported transcript of "${title}", ${sharer}${where}. ` +
    'Reconstruct it here as our working context. Summarize what was asked and what was concluded, ' +
    'list the key facts, decisions and open questions, and keep any code, documents or drafts from it intact. ' +
    'Then treat that conversation as ours and continue from where it ended.';
}

// The Import button on a /share/ page
async function cfImportSharePage(btn, snapshotId) {
  const restore = cfSetButtonBusy(btn, 'Preparing...');
  try {
    const orgId = await window.chatExporter.getActiveOrganizationId();
    const snapshot = await fetchSnapshot(orgId, snapshotId);
    const item = {
      snapshotId,
      orgId,
      title: snapshot.snapshot_name || 'Shared chat',
      creatorName: (snapshot.creator && snapshot.creator.full_name) || snapshot.created_by || '',
      projectId: snapshot.project_uuid || null,
      projectName: await cfShareProjectName(orgId, snapshot.project_uuid),
      sharedAt: snapshot.created_at || null
    };

    let imported = await cfLoadImported();
    if (!imported[snapshotId]) {
      await cfReconcileImported(orgId, [item]);
      imported = await cfLoadImported();
    }
    const earlier = imported[snapshotId];
    if (earlier && earlier.chatId) {
      cfNotifyAction('import', `"${item.title}" is already imported.`, [
        { label: 'Open chat', primary: true, onClick: () => window.location.assign(`/chat/${earlier.chatId}`) },
        { label: 'Import again', onClick: () => cfStartImportRun([item]) }
      ]);
      return;
    }
    await cfStartImportRun([item]);
  } catch (e) {
    showNotification('Import failed: ' + e.message, true);
  } finally {
    restore();
  }
}

// The panel's Import Shared Chats button: every chat shared into the user's projects
async function cfImportAllShared() {
  showNotification('Looking for chats shared with you...');
  try {
    const orgId = await window.chatExporter.getActiveOrganizationId();
    const ownId = await fetchAccountUuid();
    const listing = await listSharedChats(orgId);
    listing.failures.forEach(reason => console.log('[IMPORT] Project activity could not be read:', reason));

    const candidates = listing.shares.filter(s => !ownId || s.creatorId !== ownId);
    if (!candidates.length) {
      showNotification(`No chats are shared with you in your ${listing.projectsRead} projects.`);
      return;
    }
    await cfReconcileImported(orgId, candidates);
    const imported = await cfLoadImported();
    // Imports recorded before 1.3.1 filed their chats can still be missing from the folders
    const held = cfHeldChatIds();
    for (const share of candidates) {
      const entry = imported[share.snapshotId];
      if (entry && entry.chatId && !held.has(entry.chatId)) {
        await cfFileReconciledChat(share, { uuid: entry.chatId, name: entry.title, created_at: entry.importedAt || entry.recordedAt });
      }
    }
    const todo = candidates.filter(s => !imported[s.snapshotId]);
    if (!todo.length) {
      showNotification(`All ${candidates.length} shared chats are already imported.`);
      return;
    }

    const n = todo.length;
    const confirmed = await cfConfirm(
      `Import ${n} shared chat${n === 1 ? '' : 's'}?`,
      `Each one is opened as a new chat in your account with its transcript attached and a request to reconstruct it. ` +
      (n === 1 ? '1 message will be sent. ' : `${n} messages will be sent one at a time. `) +
      `${candidates.length - n} already imported.` +
      (listing.failures.length ? ` Activity could not be read for ${listing.failures.length} project${listing.failures.length === 1 ? '' : 's'}.` : ''),
      `Import ${n}`
    );
    if (confirmed) await cfStartImportRun(todo);
  } catch (e) {
    showNotification('Could not list shared chats: ' + e.message, true);
  }
}

async function cfStartImportRun(items) {
  const queue = {
    owner: cfImportOwnerToken(true),
    items,
    index: 0,
    stage: 'compose',
    chatId: null,
    results: [],
    startedAt: new Date().toISOString()
  };
  await cfSaveImportQueue(queue);
  document.querySelector('.claude-folders-panel')?.remove();
  panelExpanded = false;
  if (window.location.pathname === '/new') await cfRunImportStep(queue);
  else window.location.assign('/new');
}

// Called on every page load once the account key is known
async function cfResumeImport() {
  const queue = await cfLoadImportQueue();
  if (!queue || queue.owner !== cfImportOwnerToken(false)) return;
  const path = window.location.pathname;
  if (queue.stage === 'compose') {
    if (path === '/new') await cfRunImportStep(queue);
    else window.location.assign('/new');
    return;
  }
  if (queue.stage === 'sent' && path === `/chat/${queue.chatId}`) {
    await cfFinishImportStep(queue);
    return;
  }
  // A reload mid-send leaves the message's fate unknown. The item is recorded as
  // interrupted and never sent twice.
  if (queue.stage === 'sending') {
    queue.results.push({ snapshotId: queue.items[queue.index].snapshotId, title: queue.items[queue.index].title, error: 'the page was reloaded while the message was being sent' });
  }
  await cfAdvanceImport(queue);
}

async function cfRunImportStep(queue) {
  const item = queue.items[queue.index];
  const position = `${queue.index + 1} of ${queue.items.length}`;
  syncInProgress = true;
  showSyncProgressBar(`Importing ${position}: ${item.title}`);
  try {
    const snapshot = await fetchSnapshot(item.orgId, item.snapshotId);
    const markdown = snapshotToMarkdown(snapshot, item.projectName);
    const filename = generateExportFilename(item.snapshotId, snapshot.snapshot_name || item.title);
    await cfSaveExport(filename, markdown, null);

    let composer = await cfComposerReady(30000);
    if (!composer) throw new Error('the message composer did not appear within 30 seconds');
    if (!cfSelectChatSurface()) throw new Error('the Chat option was not found in the composer');
    composer = await cfComposerReady(10000);
    if (!composer) throw new Error('the message composer disappeared after choosing Chat');
    if (!await cfAttachFile(composer.file, filename, markdown)) throw new Error('no attachment thumbnail appeared within 20 seconds');
    if (!cfInsertPrompt(composer.input, cfImportPrompt(item, snapshot))) throw new Error('the request could not be typed into the composer');

    queue.stage = 'sending';
    await cfSaveImportQueue(queue);
    if (!await cfSendWhenReady(60000)) throw new Error('the send button was missing or disabled for 60 seconds');
    const chatId = await cfWaitForNewChat(60000);
    if (!chatId) throw new Error('the page address did not change to a new chat within 60 seconds of sending');

    queue.stage = 'sent';
    queue.chatId = chatId;
    await cfSaveImportQueue(queue);
    const now = new Date().toISOString();
    await cfRecordImported(item.snapshotId, { chatId, title: item.title, via: 'import', importedAt: now });
    await chrome.runtime.sendMessage({
      action: 'fileImportedChat',
      folderId: 'shared-' + (item.projectId || 'links'),
      folderName: item.projectName || 'Shared links',
      category: 'Shared',
      chat: {
        id: chatId,
        title: item.title,
        url: `https://claude.ai/chat/${chatId}`,
        date: now.split('T')[0],
        updatedAt: now,
        relativeDate: 'Just now',
        snippet: '',
        projectId: null,
        starred: false,
        orgId: item.orgId,
        orgName: null,
        tags: ['imported'],
        importedFrom: {
          snapshotId: item.snapshotId,
          conversationId: snapshot.conversation_uuid || null,
          sharedBy: item.creatorName,
          projectId: item.projectId,
          projectName: item.projectName
        }
      }
    });
    queue.results.push({ snapshotId: item.snapshotId, title: item.title, chatId });
    await cfSaveImportQueue(queue);
    await cfFinishImportStep(queue);
  } catch (e) {
    console.log('[IMPORT]', item.title, '-', e.message);
    queue.results.push({ snapshotId: item.snapshotId, title: item.title, error: e.message });
    await cfAdvanceImport(queue);
  }
}

// Claude titles a new chat from its first exchange. The import waits for that title
// to land, then replaces it with the shared chat's own title.
async function cfRenameImportedChat(orgId, chatId, title) {
  for (let i = 0; i < 20; i++) {
    const res = await fetch(`/api/organizations/${orgId}/chat_conversations?limit=20&offset=0`);
    const list = res.ok ? await res.json() : [];
    const entry = Array.isArray(list) ? list.find(c => c.uuid === chatId) : null;
    if (entry && entry.name) break;
    await cfSleep(1000);
  }
  const put = await fetch(`/api/organizations/${orgId}/chat_conversations/${chatId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: title })
  });
  if (!put.ok) console.log('[IMPORT] Renaming', chatId, 'returned', put.status);
  return put.ok;
}

// The next import starts only after Claude finishes replying in this one
async function cfFinishImportStep(queue) {
  const item = queue.items[queue.index];
  showSyncProgressBar(`Waiting for Claude's reply to ${item.title}`);
  const done = await cfWaitForReplyDone(CF_REPLY_WAIT_MS);
  if (!done) console.log('[IMPORT] Reply still running after', CF_REPLY_WAIT_MS / 60000, 'minutes; moving on');
  try {
    await cfRenameImportedChat(item.orgId, queue.chatId, item.title);
  } catch (e) {
    console.log('[IMPORT] Could not rename', queue.chatId, '-', e.message);
  }
  await cfAdvanceImport(queue);
}

async function cfAdvanceImport(queue) {
  queue.index++;
  queue.stage = 'compose';
  queue.chatId = null;
  if (queue.index >= queue.items.length) {
    await cfFinishImportRun(queue);
    return;
  }
  await cfSaveImportQueue(queue);
  window.location.assign('/new');
}

async function cfFinishImportRun(queue) {
  await cfSaveImportQueue(null);
  syncInProgress = false;
  hideSyncProgressBar();
  const done = queue.results.filter(r => r.chatId);
  const failed = queue.results.filter(r => r.error);
  failed.forEach(r => console.log('[IMPORT] Not imported:', r.title, '-', r.error));
  const total = queue.items.length;
  let message = total === 1 && done.length === 1
    ? `Imported "${done[0].title}" as a new chat.`
    : `Imported ${done.length} of ${total} shared chats.`;
  if (failed.length) message += ` ${failed.length} failed: ${failed[0].title}: ${failed[0].error}`;
  cfNotifyAction('import', message, [], failed.length > 0);
}
