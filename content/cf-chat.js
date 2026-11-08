// content/cf-chat.js
// Places the extension's buttons on chat, Cowork, Claude Code and shared-chat pages.
// Globals: CF_EXPORT_ICON, CF_IMPORT_ICON, CF_FOLDER_BTN_ICON, CF_FOLDER_OPEN_ICON, CF_EXPORT_UPDATE_ICON,
//          cfMakeButton, cfClearChatButtons, injectChatButton, cfInjectShareButtons
// Depends on: content/cf-routes.js, content/cf-export.js, content/cf-export-state.js, content/cf-picker.js,
//             content/cf-import.js, inject.css (button styles)
// Notes: docs/notes/content/cf-chat.js.md

const CF_EXPORT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
const CF_IMPORT_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>';
const CF_FOLDER_BTN_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z"/></svg>';
const CF_FOLDER_OPEN_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 14l1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2"/></svg>';
const CF_EXPORT_UPDATE_ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 0 1-15.5 6.2"/><path d="M3 12a9 9 0 0 1 15.5-6.2"/><polyline points="21 3 21 9 15 9"/><polyline points="3 21 3 15 9 15"/></svg>';

function cfMakeButton(className, icon, label) {
  const btn = document.createElement('button');
  btn.className = className;
  btn.innerHTML = `${icon}<span>${cfEscapeHtml(label)}</span>`;
  return btn;
}

// Removes every button and bar this file injects
function cfClearChatButtons() {
  document.querySelectorAll('.claude-folders-btn, .claude-export-btn, .cf-share-actions').forEach(el => el.remove());
}

function injectChatButton() {
  cfClearChatButtons();

  const ref = cfConversationRef();
  if (!ref) return;
  if (ref.kind === 'share') {
    cfInjectShareButtons(ref.id);
    return;
  }

  // Chat pages anchor to the header's actions group; Cowork pages to their trailing slot
  const header = document.querySelector('[data-testid="chat-header"]') || document.querySelector('header');
  const actionsGroup = header && header.querySelector('[data-testid="wiggle-controls-actions-group"]');
  const usableActions = actionsGroup && actionsGroup.getBoundingClientRect().width > 0 ? actionsGroup : null;
  const coworkTrailing = document.querySelector('[data-testid="cowork-title-row-trailing"]');
  // A Claude Code page has no header element. Its title is an h2 in this group, which holds the buttons.
  const codeTitleGroup = ref.product === 'code' ? document.querySelector('.cc-lined-title-group') : null;
  const titleControl = document.querySelector('[data-testid="chat-title-split"]')
    || document.querySelector('[data-testid="session-title-split"]')
    || (header && header.querySelector('h1'));

  const titleContainer = usableActions
    || (coworkTrailing && coworkTrailing.parentElement)
    || codeTitleGroup
    || (titleControl && titleControl.parentElement)
    || header;
  const placeFirst = !!usableActions;

  if (!titleContainer) {
    // The mutation observer calls back once the header mounts
    if (chatButtonRetries++ < 40) setTimeout(injectChatButton, 500);
    return;
  }
  chatButtonRetries = 0;

  const place = (el) => {
    if (placeFirst) titleContainer.insertBefore(el, titleContainer.firstChild);
    else titleContainer.appendChild(el);
  };

  // Export until the state is read, then Show in folder or Export Update (content/cf-export-state.js).
  // A state already read for this conversation is on the button before it is placed.
  const exportBtn = cfMakeButton('claude-folders-btn claude-export-btn' + (placeFirst ? ' in-header' : ''), CF_EXPORT_ICON, 'Export');
  exportBtn.setAttribute('data-cf-page-export', '');
  cfApplyKnownExportState(exportBtn, ref);
  exportBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await cfPageExportClick(exportBtn, ref);
  });

  const folderBtn = cfMakeButton('claude-folders-btn' + (placeFirst ? ' in-header' : ''), CF_FOLDER_BTN_ICON, 'Add to folder');
  folderBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    showFolderPicker(folderBtn);
  });

  const order = [exportBtn, folderBtn];
  // With placeFirst, place() inserts each button at the front of the actions group
  const placed = placeFirst ? order.slice().reverse() : order;
  placed.forEach(place);
  cfRefreshPageExportButton();
}

// Shared chat pages have no header. Their buttons sit in a fixed bar at the top right.
function cfInjectShareButtons(snapshotId) {
  const bar = document.createElement('div');
  bar.className = 'cf-share-actions';

  const exportBtn = cfMakeButton('claude-folders-btn claude-export-btn in-header', CF_EXPORT_ICON, 'Export');
  exportBtn.title = 'Save this shared chat as markdown in your data folder';
  exportBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await handleExportSharePage(exportBtn, snapshotId);
  });

  const importBtn = cfMakeButton('claude-folders-btn claude-import-btn in-header', CF_IMPORT_ICON, 'Import');
  importBtn.title = 'Export this shared chat and open it as a new chat in your account';
  importBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    await cfImportSharePage(importBtn, snapshotId);
  });

  bar.appendChild(exportBtn);
  bar.appendChild(importBtn);
  document.body.appendChild(bar);
}
