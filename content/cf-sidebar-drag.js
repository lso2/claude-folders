// content/cf-sidebar-drag.js
// Lets a chat dragged in Claude's own sidebar be dropped on the Folders and Groups panels: their rows, an open pane
// and a group's expanded list. Claude's sidebar drag is dnd-kit's pointer drag, with no HTML5 drag events.
// Globals: CF_DRAG_START_PX, CF_CLICK_AFTER_DRAG_MS, cfSidebarDrag, cfPointerDown, cfDragEndedAt, cfSidebarRowChat,
//          cfOwnElementAt, cfCancelClaudeDrag, cfDragJustEnded, cfOnPointerDownForDrag, cfOnPointerMoveForDrag,
//          cfOnPointerUpForDrag, cfOnPointerCancelForDrag
// Depends on: content/cf-drag.js (cfChatOfLink, cfDropTargetOf, cfShowDropTarget, cfDropChat), content/cf-group-drop.js
//             (cfHoldOverGroup, cfEndHold), content/cf-panel.js (toggleFoldersPanel, panelExpanded), content/cf-groups-panel.js
//             (toggleGroupsPanel, groupsPanelOpen), lib/claude-groups.js (cfGroupKey), inject.css (html.cf-claude-drag)
// Notes: docs/notes/content/cf-sidebar-drag.js.md

// The distance a pressed pointer moves before the press counts as a drag
const CF_DRAG_START_PX = 6;
// A click this soon after a drag ends is the drag's release
const CF_CLICK_AFTER_DRAG_MS = 500;

// The chat pressed in Claude's sidebar: { chat, x, y, active }, or null
let cfSidebarDrag = null;
// Where the last press started, for any drag on the page: { x, y }
let cfPointerDown = null;
let cfDragEndedAt = 0;

// A row of Claude's sidebar for a chat or a Cowork session (measured: a[data-row-main-button] in aside.dframe-sidebar)
function cfSidebarRowChat(el) {
  if (!(el instanceof Element) || el.closest('.claude-folders-panel, .claude-groups-panel')) return null;
  const link = el.closest('aside a[data-row-main-button][href]');
  return link ? cfChatOfLink(link) : null;
}

// The element of the extension's panels or sidebar rows under the point, or null. Claude's drag preview has
// pointer-events: none. Claude's drag shield (div[data-drag-chrome]) is over the whole page while its drag runs, and it
// is skipped in the element list.
function cfOwnElementAt(x, y) {
  const el = document.elementsFromPoint(x, y).find(node => !node.closest('[data-drag-chrome]'));
  return el && el.closest('.claude-folders-panel, .claude-groups-panel, a[data-folders-link="true"], a[data-groups-link="true"]') ? el : null;
}

// Escape ends Claude's drag (measured: its preview and drop boxes reset). The panes ignore an Escape not typed.
function cfCancelClaudeDrag() {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', code: 'Escape', keyCode: 27, bubbles: true, cancelable: true }));
}

// True for the click that ends a drag: it is no click outside a panel
function cfDragJustEnded() {
  return Date.now() - cfDragEndedAt < CF_CLICK_AFTER_DRAG_MS;
}

function cfOnPointerDownForDrag(e) {
  cfPointerDown = { x: e.clientX, y: e.clientY };
  cfSidebarDrag = null;
  if (e.button !== 0 || !e.isPrimary) return;
  const chat = cfSidebarRowChat(e.target);
  if (chat) cfSidebarDrag = { chat, x: e.clientX, y: e.clientY, active: false };
}

function cfOnPointerMoveForDrag(e) {
  const drag = cfSidebarDrag;
  if (!drag || !(e.buttons & 1)) return;
  if (!drag.active) {
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < CF_DRAG_START_PX) return;
    drag.active = true;
    // Claude raises its sidebar, which draws the drag ghost, to z-index 9001. The panels go under it.
    document.documentElement.classList.add('cf-claude-drag');
  }
  const el = cfOwnElementAt(e.clientX, e.clientY);
  cfHoldOverGroup(el ? el.closest('.claude-groups-panel .cf-group-item') : null);
  const target = el ? cfDropTargetOf(el, e.clientY, cfGroupKey(drag.chat.id)) : null;
  if (target && target.kind === 'open') {
    if (target.id === 'folders' && !panelExpanded) toggleFoldersPanel();
    if (target.id === 'groups' && !groupsPanelOpen) toggleGroupsPanel();
    cfShowDropTarget(null);
    return;
  }
  cfShowDropTarget(target);
}

// The target is read before the slot is taken away: the place is the one the slot showed
function cfOnPointerUpForDrag(e) {
  const start = cfPointerDown;
  cfPointerDown = null;
  if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= CF_DRAG_START_PX) cfDragEndedAt = Date.now();
  const drag = cfSidebarDrag;
  cfSidebarDrag = null;
  if (!drag || !drag.active) return;
  document.documentElement.classList.remove('cf-claude-drag');
  const el = cfOwnElementAt(e.clientX, e.clientY);
  const target = el ? cfDropTargetOf(el, e.clientY, cfGroupKey(drag.chat.id)) : null;
  cfShowDropTarget(null);
  cfEndHold();
  if (!target || target.kind === 'open') return;
  cfCancelClaudeDrag();
  cfDropChat(drag.chat, target);
}

// The browser cancels the pointer when it starts its own drag of a link, as on the Chats page (content/cf-drag.js)
function cfOnPointerCancelForDrag() {
  if (cfSidebarDrag && cfSidebarDrag.active) {
    document.documentElement.classList.remove('cf-claude-drag');
    cfShowDropTarget(null);
    cfEndHold();
  }
  cfSidebarDrag = null;
  cfPointerDown = null;
}

window.addEventListener('pointerdown', cfOnPointerDownForDrag, true);
window.addEventListener('pointermove', cfOnPointerMoveForDrag, true);
window.addEventListener('pointerup', cfOnPointerUpForDrag, true);
window.addEventListener('pointercancel', cfOnPointerCancelForDrag, true);
