// lib/group-folders.js
// Matches the folders linked to Claude's sidebar groups to the groups a claude.ai tab read.
// Loaded by the service worker (CF_BACKGROUND_FILES in background.js).
// Globals: CF_GROUP_CATEGORY, cfGroupFolderId, cfGroupChatRecord, cfApplyGroupsRead, cfRememberGroupsRead, cfTakeGroupsRead,
//          cfReapplyGroups
// Depends on: lib/storage-keys.js (GROUP_READ_KEY), lib/group-pushes.js (cfGroupSyncOn, cfPendingGroupSets)
// Notes: docs/notes/lib/group-folders.js.md

const CF_GROUP_CATEGORY = 'Claude groups';

function cfGroupFolderId(groupId) {
  return 'claude-group-' + groupId;
}

// A chat of a group that is in no folder. The title is copied from the record known before a page's write; without
// that record the title stays empty until the next sync lists the chat.
function cfGroupChatRecord(chatId, known) {
  if (known && known.has(chatId)) return known.get(chatId);
  const session = /^cse_[A-Za-z0-9]+$/.test(chatId);
  return {
    id: chatId,
    title: '',
    url: session ? `https://claude.ai/cowork/${chatId}` : `https://claude.ai/chat/${chatId}`,
    date: '',
    tags: session ? ['cowork'] : []
  };
}

// groups: [{ id, name, chatIds }] read from orgId's store. pending (lib/group-pushes.js cfPendingGroupSets) lists the
// chats and groups with queued changes. Their folders are left as they are. known maps chat ids to stored records.
// A chat added to a group is moved from its folder to the group's folder, and that folder is recorded in groupedFrom.
// A chat taken out of the group is moved back to that folder, or to Unsorted when that folder is missing. Returns the
// number of changes.
function cfApplyGroupsRead(data, orgId, groups, pending, known) {
  if (!data || !Array.isArray(data.folders)) return 0;
  const folders = data.folders;
  let changes = 0;
  const folderOfChat = new Map();
  folders.forEach(f => (f.chats || []).forEach(c => folderOfChat.set(c.id, f)));
  const unsorted = () => {
    let f = folders.find(x => x.id === 'unsorted');
    if (!f) {
      f = { id: 'unsorted', category: 'Personal', name: 'Unsorted Chats', chats: [] };
      folders.push(f);
    }
    return f;
  };
  const move = (chat, from, to) => {
    from.chats = from.chats.filter(c => c.id !== chat.id);
    to.chats.push(chat);
    folderOfChat.set(chat.id, to);
    changes++;
  };
  for (const group of groups) {
    if (pending.deleted.has(group.id)) continue;
    let folder = folders.find(f => f.groupId === group.id);
    if (!folder) {
      folder = { id: cfGroupFolderId(group.id), category: CF_GROUP_CATEGORY, name: group.name || 'Untitled group', groupId: group.id, orgId, chats: [] };
      folders.push(folder);
      changes++;
    }
    if (!Array.isArray(folder.chats)) folder.chats = [];
    if (group.name && folder.name !== group.name && !pending.renamed.has(group.id)) {
      folder.name = group.name;
      changes++;
    }
    const members = new Set(group.chatIds);
    for (const chatId of group.chatIds) {
      if (pending.chats.has(chatId)) continue;
      const from = folderOfChat.get(chatId);
      if (from === folder) continue;
      if (!from) {
        folder.chats.push(cfGroupChatRecord(chatId, known));
        folderOfChat.set(chatId, folder);
        changes++;
        continue;
      }
      const chat = from.chats.find(c => c.id === chatId);
      // groupedFrom is set only on a move out of an ordinary folder, and is unchanged by a move between two groups
      if (!from.groupId) chat.groupedFrom = from.id;
      move(chat, from, folder);
    }
    for (const chat of folder.chats.slice()) {
      if (members.has(chat.id) || pending.chats.has(chat.id)) continue;
      const back = chat.groupedFrom ? folders.find(f => f.id === chat.groupedFrom && !f.groupId) : null;
      delete chat.groupedFrom;
      move(chat, folder, back || unsorted());
    }
  }
  // A linked folder of this organization whose group is missing from the read stays as an ordinary folder with its chats
  const read = new Set(groups.map(g => g.id));
  folders.forEach(f => {
    if (!f.groupId || f.orgId !== orgId || read.has(f.groupId) || pending.deleted.has(f.groupId)) return;
    delete f.groupId;
    delete f.orgId;
    (f.chats || []).forEach(c => { delete c.groupedFrom; });
    changes++;
  });
  if (!Array.isArray(data.categories)) data.categories = [];
  if (folders.some(f => f.category === CF_GROUP_CATEGORY) && !data.categories.includes(CF_GROUP_CATEGORY)) {
    data.categories.push(CF_GROUP_CATEGORY);
    changes++;
  }
  return changes;
}

// The groups last read for this account and organization, re-applied after a page writes its folders
async function cfRememberGroupsRead(accountKey, orgId, groups) {
  const all = (await chrome.storage.local.get(GROUP_READ_KEY))[GROUP_READ_KEY] || {};
  all[accountKey] = { ...(all[accountKey] || {}), [orgId]: { at: new Date().toISOString(), groups } };
  await chrome.storage.local.set({ [GROUP_READ_KEY]: all });
}

// A claude.ai tab's read: { orgId, groups, titles } (content/cf-group-sync.js). The groups are remembered for later
// writes, the titles fill records stored without one, and the linked folders follow the groups. Returns the changes.
async function cfTakeGroupsRead(data, accountKey, read) {
  const groups = Array.isArray(read.groups) ? read.groups : [];
  await cfRememberGroupsRead(accountKey, read.orgId, groups);
  const titles = read.titles || {};
  let changes = 0;
  data.folders.forEach(f => (f.chats || []).forEach(c => {
    if (!c.title && titles[c.id]) {
      c.title = titles[c.id];
      changes++;
    }
  }));
  const known = new Map(Object.keys(titles).map(id => [id, { ...cfGroupChatRecord(id, null), title: titles[id] }]));
  return changes + cfApplyGroupsRead(data, read.orgId, groups, await cfPendingGroupSets(read.orgId), known);
}

// A page's write can carry folders older than the last groups read. Every linked folder is brought back in line with
// the groups last read for this account, except the chats and groups with queued changes. known: chat records
// before the write.
async function cfReapplyGroups(data, accountKey, known) {
  if (!(await cfGroupSyncOn())) return 0;
  const read = ((await chrome.storage.local.get(GROUP_READ_KEY))[GROUP_READ_KEY] || {})[accountKey] || {};
  let changes = 0;
  for (const orgId of Object.keys(read)) {
    changes += cfApplyGroupsRead(data, orgId, read[orgId].groups || [], await cfPendingGroupSets(orgId), known);
  }
  return changes;
}
