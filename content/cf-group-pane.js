// content/cf-group-pane.js
// The pane at the Groups panel's right edge listing one group's chats, with its rename, delete and take-out buttons.
// Globals: cfGroupPaneRowHtml, cfToggleGroupPane, cfOpenGroupPane, cfMarkGroupPaneRow, cfCloseGroupPane,
//          cfGroupPaneOutsideClick, cfGroupPaneKeydown
// Depends on: content/cf-groups-panel.js (cfGroupsView, cfGroupMember, cfGroupShownKeys, cfWriteGroupEdit), lib/claude-groups.js,
//             content/cf-folder-pane.js (CF_FOLDER_PANE_STEP, cfPlaceFolderPane), content/cf-text.js, content/cf-notify.js
//             (cfConfirm), content/cf-push.js (cfUpdatePush), content/cf-sidebar-drag.js (cfDragJustEnded), inject.css
// Notes: docs/notes/content/cf-group-pane.js.md

// One key of the group in the pane, with its take-out button
function cfGroupPaneRowHtml(key) {
  const { kind, title, url } = cfGroupMember(key);
  const tag = kind === 'cowork' ? '<span class="folder-chat-org">Cowork</span>' : kind !== 'chat' ? `<span class="folder-chat-org">${cfEscapeHtml(kind)}</span>` : '';
  const body = `<span class="cf-pane-chat-title">${cfEscapeHtml(title)}</span>${tag ? `<span class="cf-pane-chat-meta">${tag}</span>` : ''}`;
  const link = url ? `<a class="cf-pane-chat" href="${cfSafeUrl(url)}" target="_blank">${body}</a>` : `<div class="cf-pane-chat">${body}</div>`;
  return `<div class="cf-group-chat" data-key="${cfEscapeHtml(key)}">${link}
    <button class="panel-btn cf-group-chat-remove" title="Take out of this group" aria-label="Take out of this group">×</button></div>`;
}

// The pane button opens the group's pane, or closes the pane when that group is the one open
function cfToggleGroupPane(panel, groupId) {
  if (panel.querySelector('.cf-folder-pane')?.dataset.groupId === groupId) cfCloseGroupPane(panel);
  else cfOpenGroupPane(panel, groupId, CF_FOLDER_PANE_STEP);
}

function cfOpenGroupPane(panel, groupId, shown) {
  const group = cfGroupsView && cfGroupsView.groups.find(g => g.id === groupId);
  if (!group) {
    cfCloseGroupPane(panel);
    return;
  }
  let pane = panel.querySelector('.cf-folder-pane');
  if (!pane) {
    pane = document.createElement('div');
    pane.className = 'cf-folder-pane';
    pane.setAttribute('role', 'region');
    panel.appendChild(pane);
  }
  pane.dataset.groupId = groupId;
  pane.setAttribute('aria-label', group.name);
  const keys = cfGroupShownKeys(group);
  const count = keys.length;
  const remaining = Math.max(0, count - shown);
  const next = Math.min(CF_FOLDER_PANE_STEP, remaining);
  const more = remaining ? `<button class="cf-folder-pane-more">Load ${next} more${next < remaining ? ` (${remaining} left)` : ''}</button>` : '';
  const mode = group.mode ? `<span class="folder-chat-org">${group.mode === 'cowork' ? 'Cowork' : cfEscapeHtml(group.mode)}</span>` : '';
  pane.innerHTML = `
    <div class="cf-folder-pane-header">
      <div class="cf-folder-pane-heading">
        <h3 class="cf-folder-pane-title">${cfEscapeHtml(group.name || 'Untitled group')}</h3>
        <div class="cf-folder-pane-sub">${mode}<span>${count} ${count === 1 ? 'chat' : 'chats'}</span></div>
      </div>
      <button class="panel-btn cf-group-rename" title="Rename group" aria-label="Rename group">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>
      </button>
      <button class="panel-btn cf-group-delete" title="Delete group" aria-label="Delete group">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>
      <button class="panel-btn cf-folder-pane-close" title="Close" aria-label="Close">×</button>
    </div>
    <form class="cf-groups-form cf-group-rename-form" hidden>
      <input class="cf-groups-input" type="text" maxlength="100" aria-label="Group name" value="${cfEscapeHtml(group.name)}">
      <button type="submit" class="cf-groups-submit">Save</button>
    </form>
    <div class="cf-folder-pane-list">${keys.slice(0, shown).map(cfGroupPaneRowHtml).join('')}${count ? '' : '<div class="cf-folder-pane-empty">No chats in this group</div>'}${more}</div>`;
  pane.querySelector('.cf-folder-pane-close').addEventListener('click', () => cfCloseGroupPane(panel));
  pane.querySelector('.cf-folder-pane-more')?.addEventListener('click', () => cfOpenGroupPane(panel, groupId, shown + CF_FOLDER_PANE_STEP));
  const form = pane.querySelector('.cf-group-rename-form');
  pane.querySelector('.cf-group-rename').addEventListener('click', () => {
    form.hidden = !form.hidden;
    if (!form.hidden) form.querySelector('input').select();
  });
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = form.querySelector('input').value.trim();
    if (name && name !== group.name) cfWriteGroupEdit(state => cfRenameGroup(state, groupId, name), `Group renamed to "${name}".`);
  });
  pane.querySelector('.cf-group-delete').addEventListener('click', async () => {
    const ok = await cfConfirm(`Delete the group "${group.name}"?`, 'Its chats stay in Claude and show as ungrouped.', 'Delete group');
    if (ok) cfWriteGroupEdit(state => cfDeleteGroup(state, groupId), `Group "${group.name}" deleted.`);
  });
  pane.querySelectorAll('.cf-group-chat-remove').forEach(btn => {
    btn.addEventListener('click', () => {
      const key = btn.closest('.cf-group-chat').dataset.key;
      cfWriteGroupEdit(state => cfPutInGroup(state, key, null), 'Taken out of the group.');
    });
  });
  cfMarkGroupPaneRow(panel, groupId);
  document.addEventListener('keydown', cfGroupPaneKeydown);
  document.addEventListener('click', cfGroupPaneOutsideClick);
  window.addEventListener('resize', cfPlaceFolderPane);
  cfPlaceFolderPane();
  cfUpdatePush();
}

// The row of the group in the pane is highlighted and its pane button pressed. groupId null clears them.
function cfMarkGroupPaneRow(panel, groupId) {
  panel.querySelectorAll('.cf-group-item').forEach(item => {
    const inPane = item.dataset.groupId === groupId;
    const btn = item.querySelector('.cf-group-pane-btn');
    item.classList.toggle('active', inPane);
    btn.setAttribute('aria-pressed', String(inPane));
    btn.title = inPane ? 'Close the pane' : 'Open in a pane';
  });
}

function cfCloseGroupPane(panel) {
  panel.querySelector('.cf-folder-pane')?.remove();
  cfMarkGroupPaneRow(panel, null);
  document.removeEventListener('keydown', cfGroupPaneKeydown);
  document.removeEventListener('click', cfGroupPaneOutsideClick);
  window.removeEventListener('resize', cfPlaceFolderPane);
  cfUpdatePush();
}

// A click anywhere outside the open pane closes it, in the Groups panel too. The release that ends a drag and a click
// in a dialog over the page leave it open.
function cfGroupPaneOutsideClick(e) {
  const panel = document.querySelector('.claude-groups-panel');
  const pane = panel && panel.querySelector('.cf-folder-pane');
  if (!pane) return;
  const path = e.composedPath();
  if (path.includes(pane) || cfDragJustEnded()) return;
  if (path.some(el => el instanceof Element && (el.classList.contains('cf-confirm-overlay') || el.classList.contains('cf-pd-overlay')))) return;
  cfCloseGroupPane(panel);
}

// A typed Escape closes the pane. The Escape sent to end Claude's sidebar drag is not typed (content/cf-sidebar-drag.js).
function cfGroupPaneKeydown(e) {
  if (e.key !== 'Escape' || !e.isTrusted) return;
  const panel = document.querySelector('.claude-groups-panel');
  if (panel) cfCloseGroupPane(panel);
}
