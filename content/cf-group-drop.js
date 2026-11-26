// content/cf-group-drop.js
// The place a dragged chat takes in a group's list, shown by a slot, with the groups that open while a chat is held on them.
// Globals: CF_SPRING_OPEN_MS, cfSpring, cfDropSlot, cfGroupListOf, cfPlaceInList, cfShowDropSlot, cfHideDropSlot,
//          cfHoldOverGroup, cfEndHold
// Depends on: content/cf-groups-panel.js (cfGroupsExpanded, cfSetGroupExpanded), inject.css (.cf-drop-slot)
// Notes: docs/notes/content/cf-group-drop.js.md

// A chat held this long on a closed group's row in the Groups panel lists that group's chats
const CF_SPRING_OPEN_MS = 700;

// The row a chat is held on, while its timer runs: { groupId, timer }, or null
let cfSpring = null;
// The element showing where a dropped chat goes, made on the first drag
let cfDropSlot = null;

// The group list holding el: the chats listed under a group's row, or the open pane's list. { groupId, list, items },
// where items are the list's chat rows, each with its key in data-key. null outside a group list.
function cfGroupListOf(el) {
  const inline = el.closest('.claude-groups-panel .cf-group-chats');
  if (inline) {
    return { groupId: inline.closest('.cf-group-block').dataset.groupId, list: inline, items: Array.from(inline.querySelectorAll('.cf-group-inline-chat[data-key]')) };
  }
  const paneList = el.closest('.claude-groups-panel .cf-folder-pane[data-group-id] .cf-folder-pane-list');
  if (paneList) {
    return { groupId: paneList.closest('.cf-folder-pane').dataset.groupId, list: paneList, items: Array.from(paneList.querySelectorAll('.cf-group-chat[data-key]')) };
  }
  return null;
}

// The chat row the dragged chat goes before: the first row whose middle is below the pointer, with the dragged chat's
// own row skipped. Below the last row shown, the chat goes before the first chat not shown yet (shownKeys, the group's
// keys in list order), or last. { beforeKey, beforeEl, afterEl }
function cfPlaceInList(found, y, draggedKey, shownKeys) {
  const items = found.items.filter(item => item.dataset.key !== draggedKey);
  const before = items.find(item => {
    const box = item.getBoundingClientRect();
    return y < box.top + box.height / 2;
  });
  if (before) return { beforeKey: before.dataset.key, beforeEl: before, afterEl: null };
  const last = items[items.length - 1] || null;
  const next = last ? shownKeys.slice(shownKeys.indexOf(last.dataset.key) + 1).find(key => key !== draggedKey) : null;
  return { beforeKey: next || null, beforeEl: null, afterEl: last };
}

// Puts the slot at the place: before a row, after the last row, or first in an empty list
function cfShowDropSlot(found, place) {
  if (!cfDropSlot) {
    cfDropSlot = document.createElement('div');
    cfDropSlot.className = 'cf-drop-slot';
    cfDropSlot.setAttribute('aria-hidden', 'true');
  }
  cfDropSlot.classList.toggle('cf-drop-slot-pane', found.list.classList.contains('cf-folder-pane-list'));
  if (place.beforeEl) {
    if (place.beforeEl.previousElementSibling !== cfDropSlot) place.beforeEl.before(cfDropSlot);
  } else if (place.afterEl) {
    if (place.afterEl.nextElementSibling !== cfDropSlot) place.afterEl.after(cfDropSlot);
  } else if (found.list.firstElementChild !== cfDropSlot) {
    found.list.prepend(cfDropSlot);
  }
}

function cfHideDropSlot() {
  if (cfDropSlot) cfDropSlot.remove();
}

// row is the Groups panel row under a dragged chat, or null. Holding the chat on a closed group's row for
// CF_SPRING_OPEN_MS lists the group's chats. Any other row, or none, stops the timer.
function cfHoldOverGroup(row) {
  const groupId = row ? row.dataset.groupId : null;
  if (cfSpring && cfSpring.groupId === groupId) return;
  cfEndHold();
  if (!groupId || cfGroupsExpanded.has(groupId)) return;
  const timer = setTimeout(() => {
    cfSpring = null;
    const panel = document.querySelector('.claude-groups-panel');
    if (panel) cfSetGroupExpanded(panel, groupId, true);
  }, CF_SPRING_OPEN_MS);
  cfSpring = { groupId, timer };
}

function cfEndHold() {
  if (cfSpring) clearTimeout(cfSpring.timer);
  cfSpring = null;
}
