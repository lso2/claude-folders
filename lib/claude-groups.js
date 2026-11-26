// lib/claude-groups.js
// Reads and changes the groups of Claude's sidebar in Claude's user settings store, entry ccd/dframe-store.
// Loaded by the claude.ai content scripts, after lib/cowork-api.js (isCoworkSessionId).
// Globals: CF_GROUPS_ENTRY, CF_GROUPS_WRITE_TRIES, cfGroupsUrl, cfGroupKey, cfGroupKeyId, cfReadGroupStore,
//          cfGroupsOfStore, cfChangeGroups, cfCreateGroup, cfRenameGroup, cfDeleteGroup, cfPutInGroup, cfPlaceInGroup
// Notes: docs/notes/lib/claude-groups.js.md

const CF_GROUPS_ENTRY = 'ccd/dframe-store';
// The writes allowed for one change. A write refused for a stale checksum (Claude or another tab wrote first) is
// read and applied again.
const CF_GROUPS_WRITE_TRIES = 3;

function cfGroupsUrl(orgId) {
  return `/api/claude_code/organizations/${encodeURIComponent(orgId)}/user_settings`;
}

// The store keys a chat as chat:<uuid> and a Cowork session as cowork:<session id>
function cfGroupKey(chatId) {
  return (isCoworkSessionId(chatId) ? 'cowork:' : 'chat:') + chatId;
}

// The id after the key's prefix
function cfGroupKeyId(key) {
  const at = String(key).indexOf(':');
  return at < 0 ? String(key) : String(key).slice(at + 1);
}

// { store, checksum, entries }. The answer is { checksum, content: { entries }, lastModified, userId, version }.
// store is { state, version, updatedAt } parsed from the entry, or an empty store when the entry is missing. entries
// are every entry of the answer, sent back with a write.
async function cfReadGroupStore(orgId) {
  const res = await fetch(cfGroupsUrl(orgId), { credentials: 'include' });
  if (!res.ok) throw new Error(`the user settings request returned ${res.status}`);
  const body = await res.json();
  const entries = body && body.content && body.content.entries;
  if (!entries || typeof entries !== 'object') throw new Error('the user settings answer has no content.entries object');
  if (!body.checksum) throw new Error('the user settings answer has no checksum');
  const raw = entries[CF_GROUPS_ENTRY];
  let store = { state: {}, version: 1 };
  if (typeof raw === 'string' && raw) store = JSON.parse(raw);
  if (!store.state || typeof store.state !== 'object') store.state = {};
  return { store, checksum: body.checksum, entries };
}

// The groups in the store's order, each with its keys in the group's order: [{ id, name, mode, ordered, keys }].
// A key assigned to a group and missing from the group's order is listed after the ordered ones. ordered is true for a
// group in customGroupOrderedIds: Claude's sidebar shows such a group in its stored order and sorts the others itself.
function cfGroupsOfStore(store) {
  const state = (store && store.state) || {};
  const groups = Array.isArray(state.customGroups) ? state.customGroups : [];
  const assignments = state.customGroupAssignments || {};
  const order = state.customGroupOrder || {};
  const orderedIds = Array.isArray(state.customGroupOrderedIds) ? state.customGroupOrderedIds : [];
  return groups.filter(g => g && g.id).map(g => {
    const listed = (Array.isArray(order[g.id]) ? order[g.id] : []).filter(key => assignments[key] === g.id);
    const rest = Object.keys(assignments).filter(key => assignments[key] === g.id && !listed.includes(key));
    return { id: g.id, name: String(g.name || ''), mode: g.mode || null, ordered: orderedIds.includes(g.id), keys: listed.concat(rest) };
  });
}

// change(state) edits the state in place. Every other entry is sent back unchanged. Returns the store as written.
// The write body is { entries }, without the content wrapper of the read answer.
async function cfChangeGroups(orgId, change) {
  for (let attempt = 1; attempt <= CF_GROUPS_WRITE_TRIES; attempt++) {
    const { store, checksum, entries } = await cfReadGroupStore(orgId);
    change(store.state);
    // The store's own time of its last change, in epoch milliseconds as Claude writes it
    if (typeof store.updatedAt === 'number') store.updatedAt = Date.now();
    const res = await fetch(cfGroupsUrl(orgId), {
      method: 'PUT',
      credentials: 'include',
      headers: { 'content-type': 'application/json', 'if-match': checksum },
      body: JSON.stringify({ entries: { ...entries, [CF_GROUPS_ENTRY]: JSON.stringify(store) } })
    });
    if (res.ok) return store;
    if (res.status !== 412 || attempt === CF_GROUPS_WRITE_TRIES) throw new Error(`the user settings write returned ${res.status}`);
    console.log('[GROUPS] Claude\'s groups changed after the read. Reading them again after write', attempt, 'of', CF_GROUPS_WRITE_TRIES);
  }
  return null;
}

// The state edits below are applied inside cfChangeGroups. mode is kept as given: 'cowork' or null.
function cfCreateGroup(state, id, name, mode) {
  if (!Array.isArray(state.customGroups)) state.customGroups = [];
  state.customGroups.push(mode ? { id, name, mode } : { id, name });
  if (!state.customGroupOrder || typeof state.customGroupOrder !== 'object') state.customGroupOrder = {};
  state.customGroupOrder[id] = [];
}

function cfRenameGroup(state, id, name) {
  const group = (state.customGroups || []).find(g => g && g.id === id);
  if (group) group.name = name;
}

// The group's chats stay in Claude and show as ungrouped
function cfDeleteGroup(state, id) {
  state.customGroups = (state.customGroups || []).filter(g => g && g.id !== id);
  const assignments = state.customGroupAssignments || {};
  Object.keys(assignments).forEach(key => { if (assignments[key] === id) delete assignments[key]; });
  if (state.customGroupOrder) delete state.customGroupOrder[id];
  if (Array.isArray(state.customGroupOrderedIds)) state.customGroupOrderedIds = state.customGroupOrderedIds.filter(groupId => groupId !== id);
}

// groupId null takes the key out of every group. A key put in a group is placed first in that group's order.
function cfPutInGroup(state, key, groupId) {
  if (!state.customGroupAssignments || typeof state.customGroupAssignments !== 'object') state.customGroupAssignments = {};
  if (!state.customGroupOrder || typeof state.customGroupOrder !== 'object') state.customGroupOrder = {};
  const order = state.customGroupOrder;
  Object.keys(order).forEach(id => {
    if (Array.isArray(order[id])) order[id] = order[id].filter(k => k !== key);
  });
  if (!groupId) {
    delete state.customGroupAssignments[key];
    return;
  }
  state.customGroupAssignments[key] = groupId;
  order[groupId] = [key].concat(Array.isArray(order[groupId]) ? order[groupId] : []);
}

// Puts the key in the group before beforeKey in shownKeys, the group's keys as the lists show them, or last when
// beforeKey is null. The group's order becomes that list, and the group joins customGroupOrderedIds, so Claude's
// sidebar shows the same order. Keys of the group missing from shownKeys follow in their stored order.
function cfPlaceInGroup(state, key, groupId, shownKeys, beforeKey) {
  cfPutInGroup(state, key, groupId);
  const assignments = state.customGroupAssignments;
  const members = Object.keys(assignments).filter(k => assignments[k] === groupId);
  const order = shownKeys.filter(k => k !== key && members.includes(k));
  const at = beforeKey ? order.indexOf(beforeKey) : -1;
  order.splice(at < 0 ? order.length : at, 0, key);
  state.customGroupOrder[groupId].concat(members).forEach(k => { if (members.includes(k) && !order.includes(k)) order.push(k); });
  state.customGroupOrder[groupId] = order;
  if (!Array.isArray(state.customGroupOrderedIds)) state.customGroupOrderedIds = [];
  if (!state.customGroupOrderedIds.includes(groupId)) state.customGroupOrderedIds.push(groupId);
}
