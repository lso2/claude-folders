// content/cf-drag.js
// Lets a chat link on a claude.ai page, such as a row of the Chats page, be dragged onto a folder or a group: the rows
// of the Folders and Groups panels, their open panes, a group's expanded list, and the group sections of Claude's sidebar.
// Globals: cfDragChat, cfDropTarget, cfChatOfLink, cfSidebarGroupSection, cfGroupTarget, cfDropTargetOf, cfMarkDropTarget,
//          cfShowDropTarget, cfDropOnFolder, cfDropOnGroupName, cfDropChat, cfOnDragStart, cfOnDragOver, cfOnDrop, cfOnDragEnd
// Depends on: content/cf-state.js (allChats, folders), content/cf-text.js (cfStripGlyphs), content/cf-data.js (loadData),
//             content/cf-notify.js (showNotification), content/cf-panel.js (toggleFoldersPanel), content/cf-groups-panel.js
//             (toggleGroupsPanel, groupsPanelOpen, cfGroupsView, cfGroupShownKeys, cfWriteGroupEdit), content/cf-group-drop.js,
//             lib/claude-groups.js, lib/cowork-api.js (isCoworkSessionId), background.js (assignChatToFolder), inject.css
// Notes: docs/notes/content/cf-drag.js.md

// The chat being dragged: { id, url, title, stored }. Claude's own sidebar rows are not draggable (draggable="false").
let cfDragChat = null;
// The element showing the drop highlight
let cfDropTarget = null;

// A link to a chat or a Cowork session on this site, or null. The stored record gives the title; without one the
// link's label or the first line of its row does.
function cfChatOfLink(a) {
  let url;
  try {
    url = new URL(a.getAttribute('href'), location.href);
  } catch (e) {
    return null;
  }
  if (url.origin !== location.origin) return null;
  const chat = url.pathname.match(/^\/chat\/([0-9a-f-]{36})(?:\/|$)/i);
  const session = url.pathname.match(/^\/cowork\/(cse_[A-Za-z0-9]+)(?:\/|$)/);
  const id = chat ? chat[1] : session ? session[1] : null;
  if (!id) return null;
  const stored = allChats.find(c => c.id === id) || null;
  const row = a.closest('tr, li, [role="row"]') || a;
  const label = a.getAttribute('aria-label') || cfStripGlyphs(row.innerText || a.textContent).split('\n').map(s => s.trim()).find(Boolean);
  return { id, url: url.origin + url.pathname, title: (stored && stored.title) || label || 'Untitled', stored };
}

// The group section of Claude's sidebar holding el: { header, section }, or null. The section is the nearest
// ancestor holding exactly one group header (measured: aside.dframe-sidebar, button[data-group-toggle]).
function cfSidebarGroupSection(el) {
  const aside = el.closest('aside');
  if (!aside) return null;
  for (let node = el; node && node !== aside; node = node.parentElement) {
    const headers = node.querySelectorAll('button[data-group-toggle]');
    if (headers.length === 1) return { header: headers[0], section: node };
    if (headers.length > 1) return null;
  }
  return null;
}

function cfGroupTarget(el, groupId) {
  const group = cfGroupsView && cfGroupsView.groups.find(g => g.id === groupId);
  return { kind: 'group', el, id: groupId, name: group ? group.name : '' };
}

// { kind: 'folder' | 'group' | 'section' | 'open', el, id, name } under the pointer, or null. y is the pointer's height
// and draggedKey the dragged chat's group key. Over a group's list the target also has list and place: the chat goes
// between the list's chats (content/cf-group-drop.js).
function cfDropTargetOf(el, y, draggedKey) {
  if (!(el instanceof Element)) return null;
  const inList = cfGroupListOf(el);
  const listGroup = inList && cfGroupsView && cfGroupsView.groups.find(g => g.id === inList.groupId);
  if (listGroup) {
    const shownKeys = cfGroupShownKeys(listGroup);
    const place = { ...cfPlaceInList(inList, y, draggedKey, shownKeys), shownKeys };
    return { kind: 'group', el: inList.list, id: listGroup.id, name: listGroup.name, list: inList, place };
  }
  // An open pane takes the drop for its folder or its group
  const pane = el.closest('.claude-folders-panel .cf-folder-pane, .claude-groups-panel .cf-folder-pane');
  if (pane && pane.dataset.groupId) return cfGroupTarget(pane, pane.dataset.groupId);
  if (pane && pane.dataset.folderId) {
    const folder = folders.find(f => f.id === pane.dataset.folderId);
    return folder ? { kind: 'folder', el: pane, id: folder.id, name: folder.name } : null;
  }
  const folderRow = el.closest('.claude-folders-panel .folder-panel-item[data-folder-id]');
  if (folderRow) {
    const folder = folders.find(f => f.id === folderRow.dataset.folderId);
    return folder ? { kind: 'folder', el: folderRow, id: folder.id, name: folder.name } : null;
  }
  // A group's row in the Groups panel
  const block = el.closest('.claude-groups-panel .cf-group-block[data-group-id]');
  if (block) return cfGroupTarget(block.querySelector('.cf-group-item') || block, block.dataset.groupId);
  // Holding a chat over the Folders or Groups row opens that panel, and the chat can then be dropped on its rows
  const ownRow = el.closest('a[data-folders-link="true"], a[data-groups-link="true"]');
  if (ownRow) return { kind: 'open', el: ownRow, id: ownRow.hasAttribute('data-groups-link') ? 'groups' : 'folders' };
  const found = cfSidebarGroupSection(el);
  if (!found) return null;
  const name = cfStripGlyphs(found.header.innerText || found.header.textContent).split('\n').map(t => t.trim()).find(Boolean) || '';
  // Pinned is Claude's pin list, not a group
  if (/^pinned$/i.test(name)) return null;
  const toggle = found.header.getAttribute('data-group-toggle') || '';
  return { kind: 'section', el: found.section, id: /^cg-/.test(toggle) ? toggle : null, name };
}

function cfMarkDropTarget(el) {
  if (cfDropTarget === el) return;
  if (cfDropTarget) cfDropTarget.classList.remove('cf-drop-over');
  cfDropTarget = el;
  if (el) el.classList.add('cf-drop-over');
}

// Shows the target under a dragged chat: the slot at its place in a group's list, or the highlight of a row, a pane or
// a sidebar section. null clears both.
function cfShowDropTarget(target) {
  if (target && target.place) {
    cfMarkDropTarget(null);
    cfShowDropSlot(target.list, target.place);
    return;
  }
  cfHideDropSlot();
  cfMarkDropTarget(target ? target.el : null);
}

// A chat of this login is put in one of its folders. A chat in no folder yet is filed with what the link shows.
async function cfDropOnFolder(chat, target) {
  const record = chat.stored || {
    id: chat.id,
    title: chat.title,
    url: chat.url,
    tags: isCoworkSessionId(chat.id) ? ['cowork'] : [],
    date: new Date().toISOString().split('T')[0],
    relativeDate: 'Today'
  };
  const answer = await chrome.runtime.sendMessage({ action: 'assignChatToFolder', chat: record, folderId: target.id });
  if (!answer || !answer.success) throw new Error((answer && answer.error) || 'the background answered nothing');
  await loadData();
  showNotification(`"${chat.title}" moved to "${target.name}".`);
}

// A section of Claude's sidebar is matched to its group by its id when the header carries one, else by its name.
// Ungrouped takes the chat out of its group.
async function cfDropOnGroupName(chat, target) {
  const key = cfGroupKey(chat.id);
  if (/^ungrouped$/i.test(target.name)) {
    await cfWriteGroupEdit(state => cfPutInGroup(state, key, null), `"${chat.title}" taken out of its group.`);
    return;
  }
  const orgId = await window.chatExporter.getActiveOrganizationId();
  const groups = cfGroupsOfStore((await cfReadGroupStore(orgId)).store);
  const group = groups.find(g => g.id === target.id) || groups.find(g => g.name === target.name);
  if (!group) throw new Error(`no group named "${target.name}" is in Claude's groups`);
  await cfWriteGroupEdit(state => cfPutInGroup(state, key, group.id), `"${chat.title}" put in "${group.name}".`);
}

// A drop at a place in a group's list sets the group's order (lib/claude-groups.js cfPlaceInGroup). A drop on a group's
// row or pane puts the chat first in the group's stored order.
async function cfDropChat(chat, target) {
  const key = cfGroupKey(chat.id);
  try {
    if (target.kind === 'folder') await cfDropOnFolder(chat, target);
    if (target.kind === 'group' && target.place) {
      await cfWriteGroupEdit(state => cfPlaceInGroup(state, key, target.id, target.place.shownKeys, target.place.beforeKey), `"${chat.title}" put in "${target.name}".`);
    }
    if (target.kind === 'group' && !target.place) await cfWriteGroupEdit(state => cfPutInGroup(state, key, target.id), `"${chat.title}" put in "${target.name}".`);
    if (target.kind === 'section') await cfDropOnGroupName(chat, target);
  } catch (e) {
    console.log('[DRAG] Drop of', chat.id, 'not saved:', e.message);
    showNotification('The chat was not moved: ' + e.message, true);
  }
}

function cfOnDragStart(e) {
  const a = e.target instanceof Element ? e.target.closest('a[href]') : null;
  cfDragChat = a ? cfChatOfLink(a) : null;
}

function cfOnDragOver(e) {
  if (!cfDragChat) return;
  cfHoldOverGroup(e.target instanceof Element ? e.target.closest('.claude-groups-panel .cf-group-item') : null);
  const target = cfDropTargetOf(e.target, e.clientY, cfGroupKey(cfDragChat.id));
  if (target && target.kind === 'open') {
    if (target.id === 'folders' && !panelExpanded) toggleFoldersPanel();
    if (target.id === 'groups' && !groupsPanelOpen) toggleGroupsPanel();
    cfShowDropTarget(null);
    return;
  }
  cfShowDropTarget(target);
  if (!target) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = 'move';
}

// The target is read before the slot is taken away: the place is the one the slot showed
function cfOnDrop(e) {
  if (!cfDragChat) return;
  const target = cfDropTargetOf(e.target, e.clientY, cfGroupKey(cfDragChat.id));
  cfShowDropTarget(null);
  cfEndHold();
  if (!target || target.kind === 'open') return;
  e.preventDefault();
  e.stopPropagation();
  const chat = cfDragChat;
  cfDragChat = null;
  cfDropChat(chat, target);
}

function cfOnDragEnd() {
  cfShowDropTarget(null);
  cfEndHold();
  cfDragChat = null;
}

document.addEventListener('dragstart', cfOnDragStart, true);
document.addEventListener('dragover', cfOnDragOver, true);
document.addEventListener('drop', cfOnDrop, true);
document.addEventListener('dragend', cfOnDragEnd, true);
