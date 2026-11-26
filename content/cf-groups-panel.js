// content/cf-groups-panel.js
// The Groups flyout beside Claude's sidebar, listing Claude's sidebar groups with each group's chats expandable in place.
// Globals: groupsPanelOpen, cfGroupsView, cfGroupsExpanded, CF_GROUP_MODES, CF_GROUP_CARET, CF_GROUP_PANE_ICON, toggleGroupsPanel,
//          cfCloseGroupsPanel, closeGroupsPanelOnOutsideClick, cfLoadGroupsView, cfGroupMember, cfGroupShownKeys, cfGroupInlineHtml,
//          cfGroupRowHtml, cfRenderGroupsPanel, cfSetGroupExpanded, cfWireGroupInline, cfNewGroupMode, cfWriteGroupEdit
// Depends on: lib/claude-groups.js, lib/chat-exporter.js, content/cf-text.js (cfStripGlyphs), content/cf-notify.js, content/cf-folder-pane.js
//             (CF_FOLDER_PANE_STEP), content/cf-group-pane.js, content/cf-panel.js, content/cf-panel-host.js, content/cf-row-hover.js,
//             content/cf-sidebar.js (CF_GROUPS_ICON), content/cf-group-sync.js, content/cf-push.js, content/cf-sidebar-drag.js, inject.css
// Notes: docs/notes/content/cf-groups-panel.js.md

let groupsPanelOpen = false;
// The groups as last read: { orgId, groups: [{ id, name, mode, ordered, keys }], error }
let cfGroupsView = null;
// The groups whose chats are listed under their row, each with the number of chats shown
const cfGroupsExpanded = new Map();
// The panel's sections: a group without a mode is shown in Claude's chats sidebar, a 'cowork' group in its Cowork sidebar
const CF_GROUP_MODES = [{ mode: null, label: 'Chats' }, { mode: 'cowork', label: 'Cowork' }];
// The caret after a group's name, drawn like the caret of Claude's sidebar section headers: 14px and pointing down
// for an open group. inject.css turns it a quarter left for a closed group.
const CF_GROUP_CARET = '<svg class="cf-group-caret" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" ' +
  'stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 6l3.5 3.5 3.5-3.5"/></svg>';
// The pane button's icon: a box with a pane at its right side and an arrow pointing into it
const CF_GROUP_PANE_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" ' +
  'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="2"/>' +
  '<path d="M15 3v18"/><path d="M7 9l3 3-3 3"/></svg>';

// Clicking the Groups row opens the panel, and clicking it again closes it. One flyout is open at a time.
function toggleGroupsPanel() {
  if (document.querySelector('.claude-groups-panel')) {
    cfCloseGroupsPanel();
    return;
  }
  cfClosePanel();
  const panel = document.createElement('div');
  panel.className = 'claude-groups-panel';
  groupsPanelOpen = true;
  cfPanelHost().appendChild(panel);
  cfSetSidebarRowOpen('data-groups-link', true);
  // The flyout's left edge is the right edge of the sidebar holding the Groups row
  const ownRow = document.querySelector('a[data-groups-link="true"]');
  const sidebarEl = ownRow ? (ownRow.closest('aside') || ownRow.closest('[data-sidebar]') || ownRow.parentElement) : null;
  const right = sidebarEl ? Math.round(sidebarEl.getBoundingClientRect().right) : 0;
  if (right > 0) panel.style.left = right + 'px';
  cfRenderGroupsPanel(panel);
  cfUpdatePush();
  cfLoadGroupsView().then(() => { if (document.body.contains(panel)) cfRenderGroupsPanel(panel); });
  setTimeout(() => document.addEventListener('click', closeGroupsPanelOnOutsideClick), 100);
}

function cfCloseGroupsPanel() {
  const panel = document.querySelector('.claude-groups-panel');
  if (panel) {
    cfCloseGroupPane(panel);
    panel.remove();
  }
  groupsPanelOpen = false;
  cfSetSidebarRowOpen('data-groups-link', false);
  document.removeEventListener('click', closeGroupsPanelOnOutsideClick);
  cfUpdatePush();
}

// Clicking inside the panel, on the Groups row or button or in a dialog over the page does not close the panel, and
// neither does the release that ends a drag
function closeGroupsPanelOnOutsideClick(e) {
  const panel = document.querySelector('.claude-groups-panel');
  const row = document.querySelector('a[data-groups-link="true"]');
  const path = e.composedPath();
  if (!panel || path.includes(panel) || (row && path.includes(row)) || cfDragJustEnded()) return;
  if (path.some(el => el instanceof Element && el.classList.contains('cf-header-buttons'))) return;
  if (path.some(el => el instanceof Element && (el.classList.contains('cf-confirm-overlay') || el.classList.contains('cf-pd-overlay')))) return;
  cfCloseGroupsPanel();
}

// Reads the groups of the organization this tab uses, and hands them to the folder link (content/cf-group-sync.js)
async function cfLoadGroupsView() {
  let orgId = null;
  try {
    orgId = await window.chatExporter.getActiveOrganizationId();
    const { store } = await cfReadGroupStore(orgId);
    cfGroupsView = { orgId, groups: cfGroupsOfStore(store), error: null };
    cfReportGroups(orgId, store);
  } catch (e) {
    console.log('[GROUPS] Groups not read:', e.message);
    cfGroupsView = { orgId, groups: (cfGroupsView && cfGroupsView.groups) || [], error: e.message };
  }
  return cfGroupsView;
}

// One key of a group: { kind, id, title, url }. The stored chat gives the title, then the key's row in Claude's sidebar
// (measured: [data-row-key] holding span[data-row-label]). A member with neither shows its kind and the start of its id.
function cfGroupMember(key) {
  const id = cfGroupKeyId(key);
  const kind = String(key).split(':')[0];
  const chat = allChats.find(c => c.id === id);
  const url = chat && chat.url ? chat.url : kind === 'chat' ? `https://claude.ai/chat/${id}` : kind === 'cowork' ? `https://claude.ai/cowork/${id}` : '';
  const label = chat && chat.title ? null : document.querySelector(`aside [data-row-key="${CSS.escape(key)}"] [data-row-label]`);
  const title = (chat && chat.title) || (label && cfStripGlyphs(label.textContent).trim()) || `${kind === 'cowork' ? 'Session' : 'Chat'} ${id.slice(0, 12)}`;
  return { kind, id, title, url };
}

// The group's keys in the order Claude's sidebar shows them. A group in customGroupOrderedIds keeps its stored order.
// Claude sorts any other group itself, and its sidebar list of the group (measured: aside [data-group-list="<id>"]
// [data-row-key]) gives that order. Keys missing from that list follow in their stored order.
function cfGroupShownKeys(group) {
  if (group.ordered) return group.keys;
  const list = document.querySelector(`aside [data-group-list="${CSS.escape(group.id)}"]`);
  if (!list) return group.keys;
  const listed = Array.from(list.querySelectorAll('[data-row-key]')).map(row => row.getAttribute('data-row-key')).filter(key => group.keys.includes(key));
  return listed.concat(group.keys.filter(key => !listed.includes(key)));
}

// The chats of an expanded group under its row, the way Claude's sidebar lists a section. Each row carries its key for
// a drop between chats (content/cf-group-drop.js).
function cfGroupInlineHtml(group, shown) {
  const keys = cfGroupShownKeys(group);
  const rows = keys.slice(0, shown).map(key => {
    const member = cfGroupMember(key);
    const title = cfEscapeHtml(member.title);
    const attrs = `class="cf-group-inline-chat" data-key="${cfEscapeHtml(key)}" title="${title}"`;
    return member.url ? `<a ${attrs} href="${cfSafeUrl(member.url)}" target="_blank">${title}</a>` : `<div ${attrs}>${title}</div>`;
  }).join('');
  const remaining = Math.max(0, keys.length - shown);
  const next = Math.min(CF_FOLDER_PANE_STEP, remaining);
  const more = remaining ? `<button class="cf-group-inline-more">Load ${next} more${next < remaining ? ` (${remaining} left)` : ''}</button>` : '';
  const empty = keys.length ? '' : '<div class="cf-group-inline-empty">No chats in this group</div>';
  return `<div class="cf-group-chats">${rows}${empty}${more}</div>`;
}

// A click on the row lists the group's chats under it, or hides them. The button at the row's right edge opens the
// group's pane (content/cf-group-pane.js). paneGroupId is the group of the open pane.
function cfGroupRowHtml(group, paneGroupId) {
  const shown = cfGroupsExpanded.get(group.id);
  const open = shown !== undefined;
  const inPane = paneGroupId === group.id;
  const id = cfEscapeHtml(group.id);
  const name = cfEscapeHtml(group.name || 'Untitled group');
  return `
    <div class="cf-group-block" data-group-id="${id}">
      <div class="folder-panel-item cf-group-item${inPane ? ' active' : ''}" data-group-id="${id}" role="button" tabindex="0" aria-expanded="${open}">
        <svg class="cf-group-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${CF_GROUPS_ICON}</svg>
        <span class="cf-group-label"><span class="folder-panel-name" title="${name}">${name}</span>${CF_GROUP_CARET}</span>
        <span class="folder-panel-count">${group.keys.length}</span>
        <button class="panel-btn cf-group-pane-btn" aria-pressed="${inPane}" title="${inPane ? 'Close the pane' : 'Open in a pane'}" aria-label="Pane: ${name}">${CF_GROUP_PANE_ICON}</button>
      </div>${open ? cfGroupInlineHtml(group, shown) : ''}
    </div>`;
}

// The header, the new group form and the groups by sidebar. The open pane and the list's scroll position are kept.
function cfRenderGroupsPanel(panel) {
  const view = cfGroupsView;
  const paneGroupId = panel.querySelector('.cf-folder-pane')?.dataset.groupId || null;
  const scrollTop = panel.querySelector('.folders-panel-content')?.scrollTop || 0;
  const rowsOf = list => list.map(g => cfGroupRowHtml(g, paneGroupId)).join('');
  let body;
  if (!view) body = '<div class="folders-empty"><p>Reading the groups...</p></div>';
  else if (!view.groups.length && !view.error) body = '<div class="folders-empty"><p>No groups yet</p><p class="cf-groups-hint">New groups appear in Claude\'s sidebar.</p></div>';
  else {
    body = view.error ? `<div class="cf-groups-error">Groups not read: ${cfEscapeHtml(view.error)}</div>` : '';
    CF_GROUP_MODES.forEach(({ mode, label }) => {
      const list = view.groups.filter(g => (g.mode || null) === mode);
      if (list.length) body += `<div class="folder-category-group"><div class="folder-category-header">${label}</div>${rowsOf(list)}</div>`;
    });
    const other = view.groups.filter(g => !CF_GROUP_MODES.some(m => m.mode === (g.mode || null)));
    if (other.length) body += `<div class="folder-category-group"><div class="folder-category-header">Other</div>${rowsOf(other)}</div>`;
  }
  panel.innerHTML = `
    <div class="folders-panel-header">
      <h2>Groups</h2>
      <div class="panel-actions">
        <button class="panel-btn cf-groups-new-btn" title="New group" aria-label="New group">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>
        </button>
        <button class="panel-btn cf-groups-refresh-btn" title="Read the groups again" aria-label="Read the groups again">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/></svg>
        </button>
      </div>
    </div>
    <form class="cf-groups-form cf-groups-new" hidden>
      <input class="cf-groups-input" type="text" maxlength="100" placeholder="Group name" aria-label="New group name">
      <button type="submit" class="cf-groups-submit">Create</button>
    </form>
    <div class="folders-panel-content">${body}</div>`;
  panel.querySelector('.folders-panel-content').scrollTop = scrollTop;
  const form = panel.querySelector('.cf-groups-new');
  panel.querySelector('.cf-groups-new-btn').addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('input').focus();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.querySelector('input').value.trim();
    if (!name) return;
    const id = 'cg-' + crypto.randomUUID();
    const mode = cfNewGroupMode();
    cfWriteGroupEdit(state => cfCreateGroup(state, id, name, mode), `Group "${name}" created.`);
  });
  panel.querySelector('.cf-groups-refresh-btn').addEventListener('click', () => {
    cfLoadGroupsView().then(() => { if (document.body.contains(panel)) cfRenderGroupsPanel(panel); });
  });
  panel.querySelectorAll('.cf-group-item').forEach(item => {
    item.addEventListener('click', () => cfSetGroupExpanded(panel, item.dataset.groupId, item.getAttribute('aria-expanded') !== 'true'));
    item.addEventListener('keydown', (e) => {
      if (e.target !== item || (e.key !== 'Enter' && e.key !== ' ')) return;
      e.preventDefault();
      item.click();
    });
  });
  // The pane button's click is stopped at the button: the row does not expand, and the pane's outside click does not run
  panel.querySelectorAll('.cf-group-pane-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      cfToggleGroupPane(panel, btn.closest('.cf-group-item').dataset.groupId);
    });
  });
  panel.querySelectorAll('.cf-group-block').forEach(block => cfWireGroupInline(panel, block));
  if (paneGroupId) cfOpenGroupPane(panel, paneGroupId, CF_FOLDER_PANE_STEP);
}

// Lists the group's chats under its row, or hides them. Only that group's block is drawn again, and the other blocks
// and the open pane are left as they are during a drag.
function cfSetGroupExpanded(panel, groupId, open) {
  const block = panel.querySelector(`.cf-group-block[data-group-id="${CSS.escape(groupId)}"]`);
  const group = cfGroupsView && cfGroupsView.groups.find(g => g.id === groupId);
  if (!block || !group) return;
  block.querySelector('.cf-group-chats')?.remove();
  block.querySelector('.cf-group-item').setAttribute('aria-expanded', String(open));
  if (!open) {
    cfGroupsExpanded.delete(groupId);
    return;
  }
  cfGroupsExpanded.set(groupId, cfGroupsExpanded.get(groupId) || CF_FOLDER_PANE_STEP);
  block.insertAdjacentHTML('beforeend', cfGroupInlineHtml(group, cfGroupsExpanded.get(groupId)));
  cfWireGroupInline(panel, block);
}

// Load more under a group shows its next chats
function cfWireGroupInline(panel, block) {
  block.querySelector('.cf-group-inline-more')?.addEventListener('click', () => {
    const id = block.dataset.groupId;
    cfGroupsExpanded.set(id, (cfGroupsExpanded.get(id) || CF_FOLDER_PANE_STEP) + CF_FOLDER_PANE_STEP);
    cfSetGroupExpanded(panel, id, true);
  });
}

// A new group is made for the sidebar this page shows: Cowork pages make Cowork groups
function cfNewGroupMode() {
  return location.pathname.startsWith('/cowork') ? 'cowork' : null;
}

// Writes one edit to Claude's group store. The open panel draws the groups as written, and the folder link reads them.
// Used by the panel, the pane and a chat dropped on a group (content/cf-drag.js). Returns true once written.
async function cfWriteGroupEdit(edit, doneText) {
  const busy = document.querySelector('.claude-groups-panel');
  if (busy) busy.classList.add('cf-groups-busy');
  try {
    const orgId = (cfGroupsView && cfGroupsView.orgId) || await window.chatExporter.getActiveOrganizationId();
    const store = await cfChangeGroups(orgId, edit);
    cfGroupsView = { orgId, groups: cfGroupsOfStore(store), error: null };
    cfReportGroups(orgId, store);
    showNotification(doneText);
    return true;
  } catch (e) {
    console.log('[GROUPS] Group change not saved:', e.message);
    showNotification('The group change was not saved: ' + e.message, true);
    return false;
  } finally {
    if (busy) busy.classList.remove('cf-groups-busy');
    const panel = document.querySelector('.claude-groups-panel');
    if (panel) cfRenderGroupsPanel(panel);
  }
}
