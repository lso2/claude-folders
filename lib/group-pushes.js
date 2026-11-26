// lib/group-pushes.js
// Turns folder edits on folders linked to Claude's groups into group changes queued for a claude.ai tab to send.
// Loaded by the service worker (CF_BACKGROUND_FILES in background.js).
// Globals: cfGroupSyncOn, cfGroupFolderOfChat, cfGroupOpsOfMove, cfGroupOpsOfEdit, cfReadGroupPushes,
//          cfQueueGroupPushes, cfPendingGroupSets, cfDropGroupPushes
// Depends on: lib/storage-keys.js (GROUP_FOLDER_SYNC_KEY, GROUP_PUSH_KEY), lib/activity-log.js (cfLogActivity)
// Notes: docs/notes/lib/group-pushes.js.md

// Nothing stored counts as on
async function cfGroupSyncOn() {
  return (await chrome.storage.local.get(GROUP_FOLDER_SYNC_KEY))[GROUP_FOLDER_SYNC_KEY] !== false;
}

// The linked folder holding the chat in data, or null
function cfGroupFolderOfChat(data, chatId) {
  return ((data && data.folders) || []).find(f => f.groupId && (f.chats || []).some(c => c.id === chatId)) || null;
}

// A chat moved from one folder to another. toFolder null is a chat taken out of the folders.
function cfGroupOpsOfMove(chatId, fromFolder, toFolder) {
  const fromGroup = fromFolder && fromFolder.groupId ? fromFolder : null;
  const toGroup = toFolder && toFolder.groupId ? toFolder : null;
  if (!fromGroup && !toGroup) return [];
  if (fromGroup && toGroup && fromGroup.groupId === toGroup.groupId) return [];
  const owner = toGroup || fromGroup;
  return [{ type: 'assign', orgId: owner.orgId || null, chatId, groupId: toGroup ? toGroup.groupId : null }];
}

// edit: the one change a page made, sent with its whole data. { type: 'move', chatId, folderId } (folderId null for a
// chat taken out of the folders), { type: 'rename', folderId } or { type: 'delete', folderId }. before is the data
// the background held, after the data the page sent. Only the described edit becomes a group change. A page's data
// older than the background's changes no group.
function cfGroupOpsOfEdit(edit, before, after) {
  if (!edit || !before || !after) return [];
  const beforeFolder = (before.folders || []).find(f => f.id === edit.folderId) || null;
  const afterFolder = (after.folders || []).find(f => f.id === edit.folderId) || null;
  if (edit.type === 'move') return cfGroupOpsOfMove(edit.chatId, cfGroupFolderOfChat(before, edit.chatId), afterFolder);
  if (!beforeFolder || !beforeFolder.groupId) return [];
  if (edit.type === 'rename' && afterFolder && afterFolder.name && afterFolder.name !== beforeFolder.name) {
    return [{ type: 'rename', orgId: beforeFolder.orgId || null, groupId: beforeFolder.groupId, name: afterFolder.name }];
  }
  if (edit.type === 'delete' && !afterFolder) return [{ type: 'delete', orgId: beforeFolder.orgId || null, groupId: beforeFolder.groupId }];
  return [];
}

// { seq, ops: [{ seq, type, orgId, chatId, groupId, name, at }] }
async function cfReadGroupPushes() {
  const stored = (await chrome.storage.local.get(GROUP_PUSH_KEY))[GROUP_PUSH_KEY];
  return stored && Array.isArray(stored.ops) ? stored : { seq: 0, ops: [] };
}

// A later change replaces a queued one for the same chat, or the same group's name. A deleted group's queued
// changes are dropped. Nothing is queued while the link is off.
async function cfQueueGroupPushes(ops) {
  if (!ops.length || !(await cfGroupSyncOn())) return;
  const queue = await cfReadGroupPushes();
  for (const op of ops) {
    const sameOrg = q => q.orgId === op.orgId;
    if (op.type === 'assign') queue.ops = queue.ops.filter(q => !(sameOrg(q) && q.type === 'assign' && q.chatId === op.chatId));
    if (op.type === 'rename') queue.ops = queue.ops.filter(q => !(sameOrg(q) && q.type === 'rename' && q.groupId === op.groupId));
    if (op.type === 'delete') queue.ops = queue.ops.filter(q => !(sameOrg(q) && q.groupId === op.groupId));
    queue.seq += 1;
    queue.ops.push({ ...op, seq: queue.seq, at: new Date().toISOString() });
  }
  await chrome.storage.local.set({ [GROUP_PUSH_KEY]: queue });
  cfLogActivity('Groups', `${ops.length} group change${ops.length === 1 ? '' : 's'} queued for Claude's sidebar`);
}

// The chats and groups of orgId with queued changes. Their folders are left as they are by a groups read.
async function cfPendingGroupSets(orgId) {
  const ops = (await cfReadGroupPushes()).ops.filter(op => op.orgId === orgId);
  return {
    chats: new Set(ops.filter(op => op.type === 'assign').map(op => op.chatId)),
    renamed: new Set(ops.filter(op => op.type === 'rename').map(op => op.groupId)),
    deleted: new Set(ops.filter(op => op.type === 'delete').map(op => op.groupId))
  };
}

// seqs: the changes a claude.ai tab wrote to Claude's groups
async function cfDropGroupPushes(seqs) {
  const done = new Set(seqs || []);
  const queue = await cfReadGroupPushes();
  const before = queue.ops.length;
  queue.ops = queue.ops.filter(op => !done.has(op.seq));
  await chrome.storage.local.set({ [GROUP_PUSH_KEY]: queue });
  return before - queue.ops.length;
}
