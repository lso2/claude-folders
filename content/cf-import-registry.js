// content/cf-import-registry.js
// Remembers which shared chats were imported into this account and finds imports done elsewhere.
// Globals: CF_RECONCILE_LIMIT, cfLoadImported, cfRecordImported, cfAttachedSnapshotPrefixes,
//          cfFileReconciledChat, cfFileUnfiledImports, cfReconcileImported
// Depends on: content/cf-account.js (cfImportedKey), content/cf-sync.js (cfHeldChatIds),
//             lib/chat-exporter.js
// Notes: docs/notes/content/cf-import-registry.js.md

// Most conversations read while looking for imports this browser has no record of
const CF_RECONCILE_LIMIT = 200;

async function cfLoadImported() {
  try {
    const stored = await chrome.storage.local.get(cfImportedKey());
    return stored[cfImportedKey()] || {};
  } catch (e) {
    return {};
  }
}

async function cfRecordImported(snapshotId, entry) {
  const imported = await cfLoadImported();
  imported[snapshotId] = { ...entry, recordedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [cfImportedKey()]: imported });
}

// An import's first message carries the export file, named <snapshot prefix>_<title>.md
function cfAttachedSnapshotPrefixes(convo) {
  const first = (convo.chat_messages || []).find(m => m.sender === 'human');
  if (!first) return [];
  const names = [].concat(first.files || [], first.files_v2 || [], first.attachments || [])
    .map(f => String(f.file_name || ''));
  return names
    .map(name => (name.match(/^([0-9a-f]{8})_.*\.md$/i) || [])[1])
    .filter(Boolean)
    .map(prefix => prefix.toLowerCase());
}

// A matched import joins the project folder like any other import
async function cfFileReconciledChat(share, convo) {
  const stamp = convo.updated_at || convo.created_at || new Date().toISOString();
  try {
    await chrome.runtime.sendMessage({
      action: 'fileImportedChat',
      folderId: 'shared-' + (share.projectId || 'links'),
      folderName: share.projectName || 'Shared links',
      category: 'Shared',
      chat: {
        id: convo.uuid,
        title: convo.name || share.title,
        url: `https://claude.ai/chat/${convo.uuid}`,
        date: String(stamp).split('T')[0],
        updatedAt: String(stamp),
        relativeDate: '',
        snippet: '',
        projectId: null,
        starred: false,
        orgId: share.orgId || null,
        orgName: null,
        tags: ['imported'],
        importedFrom: { snapshotId: share.snapshotId, sharedBy: share.creatorName, projectId: share.projectId, projectName: share.projectName }
      }
    });
  } catch (e) {
    console.log('[IMPORT] Could not file', convo.uuid, '-', e.message);
  }
}

// An import recorded with a chat that is missing from every folder is filed in its project folder
async function cfFileUnfiledImports(shares, imported) {
  const held = cfHeldChatIds();
  for (const share of shares) {
    const entry = imported[share.snapshotId];
    if (entry && entry.chatId && !held.has(entry.chatId)) {
      await cfFileReconciledChat(share, { uuid: entry.chatId, name: entry.title, created_at: entry.importedAt || entry.recordedAt });
    }
  }
}

// A conversation older than a share cannot hold its import, so only conversations
// created after the oldest unmatched share are read
async function cfReconcileImported(orgId, shares) {
  const imported = await cfLoadImported();
  const pending = shares.filter(s => !imported[s.snapshotId]);
  if (!pending.length) return { found: 0, read: 0 };

  const byPrefix = new Map(pending.map(s => [s.snapshotId.slice(0, 8).toLowerCase(), s]));
  const sharedTimes = pending.map(s => new Date(s.sharedAt || 0).getTime()).filter(t => Number.isFinite(t) && t > 0);
  const oldest = sharedTimes.length ? Math.min(...sharedTimes) : 0;
  let found = 0;
  let read = 0;

  for (let offset = 0; read < CF_RECONCILE_LIMIT; offset += 50) {
    const res = await fetch(`/api/organizations/${orgId}/chat_conversations?limit=50&offset=${offset}`);
    if (!res.ok) break;
    const page = await res.json();
    if (!Array.isArray(page) || !page.length) break;

    for (const item of page) {
      if (read >= CF_RECONCILE_LIMIT) break;
      if (new Date(item.created_at || 0).getTime() < oldest) continue;
      read++;
      try {
        const convo = await window.chatExporter.fetchConversationData(item.uuid, orgId);
        for (const prefix of cfAttachedSnapshotPrefixes(convo)) {
          const share = byPrefix.get(prefix);
          if (!share || imported[share.snapshotId]) continue;
          await cfRecordImported(share.snapshotId, { chatId: item.uuid, title: item.name || share.title, via: 'reconcile' });
          await cfFileReconciledChat(share, item);
          imported[share.snapshotId] = true;
          found++;
        }
      } catch (e) {
        console.log('[IMPORT] Could not read', item.uuid, 'while matching imports:', e.message);
      }
    }

    // The list is ordered by last update, which is never earlier than creation
    const newestOnPage = Math.max(...page.map(c => new Date(c.updated_at || 0).getTime()));
    if (page.length < 50 || newestOnPage < oldest) break;
  }
  console.log('[IMPORT] Matched', found, 'earlier imports after reading', read, 'conversations');
  return { found, read };
}
