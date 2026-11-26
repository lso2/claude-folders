// content/cf-group-sync.js
// Syncs Claude's sidebar groups and their linked folders from a claude.ai tab: reads the groups for the
// background, and writes the group changes that folder edits queued.
// Globals: CF_GROUP_READ_GAP_MS, CF_GROUP_READ_EVERY_MS, cfGroupLinkOn, cfGroupsReadAt, cfGroupSyncRunning,
//          cfGroupPushesWaiting, cfGroupTitlesRead, cfGroupMemberTitles, cfReportGroups, cfApplyGroupOp, cfApplyGroupPushes, cfSyncGroupsNow, cfStartGroupSync
// Depends on: lib/claude-groups.js, lib/storage-keys.js (GROUP_FOLDER_SYNC_KEY, GROUP_PUSH_KEY), lib/chat-exporter.js
//             (window.chatExporter), lib/cowork-api.js (isCoworkSessionId, fetchCoworkSession), content/cf-state.js (allChats), background.js (claudeGroupsRead, takeGroupPushes,
//             groupPushesApplied)
// Notes: docs/notes/content/cf-group-sync.js.md

// A read on focus waits this long after the last read, and a visible tab reads this often
const CF_GROUP_READ_GAP_MS = 30000;
const CF_GROUP_READ_EVERY_MS = 120000;
let cfGroupLinkOn = true;
let cfGroupsReadAt = 0;
let cfGroupSyncRunning = false;
// True while folder edits wait in the queue for a claude.ai tab that is in view
let cfGroupPushesWaiting = false;
// The titles read for group members no folder holds with a title, by id, read once per page load
const cfGroupTitlesRead = new Map();

// { [id]: title } of the group members whose stored record has no title. A chat's title is its conversation's name,
// a Cowork session's its session title. A title that was not read stays out.
async function cfGroupMemberTitles(orgId, ids) {
  const titles = {};
  for (const id of ids) {
    if (allChats.some(c => c.id === id && c.title)) continue;
    if (!cfGroupTitlesRead.has(id)) {
      let title = '';
      try {
        if (isCoworkSessionId(id)) title = String((await fetchCoworkSession(id, orgId)).title || '');
        else {
          const res = await fetch(`/api/organizations/${orgId}/chat_conversations/${id}`);
          if (!res.ok) throw new Error(`the conversation request returned ${res.status}`);
          title = String((await res.json()).name || '');
        }
      } catch (e) {
        console.log('[GROUPS] Title of group member', id, 'not read:', e.message);
      }
      cfGroupTitlesRead.set(id, title);
    }
    if (cfGroupTitlesRead.get(id)) titles[id] = cfGroupTitlesRead.get(id);
  }
  return titles;
}

// The groups read or written here are sent to the background, and the linked folders are matched to them there.
// Keys of other kinds than chat and cowork (Claude Code sessions, projects) have no folder.
async function cfReportGroups(orgId, store) {
  cfGroupsReadAt = Date.now();
  if (!cfGroupLinkOn || !orgId) return;
  const groups = cfGroupsOfStore(store).map(g => ({
    id: g.id,
    name: g.name,
    mode: g.mode,
    chatIds: g.keys.filter(key => /^(chat|cowork):/.test(key)).map(cfGroupKeyId)
  }));
  try {
    const titles = await cfGroupMemberTitles(orgId, groups.flatMap(g => g.chatIds));
    const answer = await chrome.runtime.sendMessage({ action: 'claudeGroupsRead', orgId, groups, titles });
    if (answer && answer.changes) console.log('[GROUPS] Folders brought in line with the groups:', answer.changes, 'changes');
  } catch (e) {
    console.log('[GROUPS] The groups were not sent to the background:', e.message);
  }
}

// One queued change on the state read from Claude. A change to a group missing from the state is left out.
// With its key in Claude's store not measured, a Claude Code session is left out.
function cfApplyGroupOp(state, op) {
  const exists = (id) => (state.customGroups || []).some(g => g && g.id === id);
  if (op.type === 'rename' && exists(op.groupId)) cfRenameGroup(state, op.groupId, op.name);
  if (op.type === 'delete' && exists(op.groupId)) cfDeleteGroup(state, op.groupId);
  if (op.type !== 'assign') return;
  const chat = allChats.find(c => c.id === op.chatId);
  if (chat && (chat.tags || []).includes('claude-code')) {
    console.log('[GROUPS] Group change for Claude Code session', op.chatId, 'left out');
    return;
  }
  if (op.groupId && !exists(op.groupId)) {
    console.log('[GROUPS] Group change for', op.chatId, 'left out: group', op.groupId, 'is not in Claude\'s groups');
    return;
  }
  cfPutInGroup(state, cfGroupKey(op.chatId), op.groupId);
}

// Writes the changes queued for this tab's organization in one write, then the background drops them
async function cfApplyGroupPushes(orgId) {
  const answer = await chrome.runtime.sendMessage({ action: 'takeGroupPushes', orgId });
  const ops = (answer && answer.ops) || [];
  if (!ops.length) return null;
  const store = await cfChangeGroups(orgId, state => ops.forEach(op => cfApplyGroupOp(state, op)));
  await chrome.runtime.sendMessage({ action: 'groupPushesApplied', seqs: ops.map(op => op.seq) });
  console.log('[GROUPS] Wrote', ops.length, 'queued group changes to Claude');
  return store;
}

// The read runs after the write of the queued changes and contains them
async function cfSyncGroupsNow() {
  if (!cfGroupLinkOn || cfGroupSyncRunning) return;
  cfGroupSyncRunning = true;
  try {
    const orgId = await window.chatExporter.getActiveOrganizationId();
    if (!orgId) return;
    const written = await cfApplyGroupPushes(orgId);
    cfGroupPushesWaiting = false;
    await cfReportGroups(orgId, written || (await cfReadGroupStore(orgId)).store);
  } catch (e) {
    console.log('[GROUPS] Groups not synced with the folders:', e.message);
  } finally {
    cfGroupSyncRunning = false;
  }
}

// Reads the link setting, then syncs on start, on a return to the tab, on a timer while visible and on every change
// queued by a folder edit. A tab out of view writes queued changes once it is in view again.
function cfStartGroupSync() {
  chrome.storage.local.get(GROUP_FOLDER_SYNC_KEY)
    .then(stored => {
      cfGroupLinkOn = stored[GROUP_FOLDER_SYNC_KEY] !== false;
      cfSyncGroupsNow();
    })
    .catch(e => console.log('[GROUPS] Link setting not read:', e.message));
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[GROUP_FOLDER_SYNC_KEY]) {
      cfGroupLinkOn = changes[GROUP_FOLDER_SYNC_KEY].newValue !== false;
      if (cfGroupLinkOn) cfSyncGroupsNow();
    }
    const queued = changes[GROUP_PUSH_KEY] && changes[GROUP_PUSH_KEY].newValue;
    cfGroupPushesWaiting = !!(queued && Array.isArray(queued.ops) && queued.ops.length);
    if (cfGroupPushesWaiting && document.visibilityState === 'visible') cfSyncGroupsNow();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (cfGroupPushesWaiting || Date.now() - cfGroupsReadAt > CF_GROUP_READ_GAP_MS) cfSyncGroupsNow();
  });
  setInterval(() => {
    if (document.visibilityState === 'visible') cfSyncGroupsNow();
  }, CF_GROUP_READ_EVERY_MS);
}
