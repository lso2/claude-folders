// content/cf-notify.js
// Shows the extension's toasts, action prompts, confirmations and progress readout on Claude's page.
// Globals: cfNoticeStack, showNotification, cfNoticeCloseButton, cfNotifyAction, cfNotifyLink,
//          cfClearNotice, cfClearAccessPrompt, cfConfirm, showSyncProgressBar, hideSyncProgressBar
// Depends on: content/cf-text.js (cfEscapeHtml), inject.css (notice and confirm styles)
// Notes: docs/notes/content/cf-notify.js.md

// Toasts and notices share one column at the bottom of the page, newest at the bottom
function cfNoticeStack() {
  let stack = document.querySelector('.cf-notice-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.className = 'cf-notice-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

// Error toasts carry the failure reason and stay up twice as long
function showNotification(message, isError = false) {
  const notification = document.createElement('div');
  notification.className = `claude-folders-notification ${isError ? 'error' : ''}`;
  notification.textContent = message;
  cfNoticeStack().appendChild(notification);
  setTimeout(() => notification.classList.add('show'), 10);
  setTimeout(() => {
    notification.classList.remove('show');
    setTimeout(() => notification.remove(), 300);
  }, isError ? 6000 : 3000);
}

// The × at the right end of a notice
function cfNoticeCloseButton(note) {
  const close = document.createElement('button');
  close.className = 'cf-notice-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '\u00d7';
  close.addEventListener('click', (e) => { e.stopPropagation(); note.remove(); });
  return close;
}

// A notice shown until one of its buttons or its close control is clicked.
// A second notice with the same key replaces the first.
function cfNotifyAction(key, message, actions, isError) {
  cfClearNotice(key);
  const note = document.createElement('div');
  note.className = 'claude-folders-notification cf-notice' + (isError ? ' error' : '');
  note.setAttribute('data-cf-notice', key);
  const text = document.createElement('span');
  text.className = 'cf-notice-text';
  text.textContent = message;
  note.appendChild(text);
  for (const action of actions || []) {
    const btn = document.createElement('button');
    btn.className = 'cf-notice-btn' + (action.primary ? ' cf-notice-btn-primary' : '');
    btn.textContent = action.label;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (action.keepOpen !== true) note.remove();
      action.onClick();
    });
    note.appendChild(btn);
  }
  note.appendChild(cfNoticeCloseButton(note));
  cfNoticeStack().appendChild(note);
  setTimeout(() => note.classList.add('show'), 10);
  return note;
}

// A notice whose text ends in an underlined link. It stays until its close control is clicked,
// and a second notice with the same key replaces the first.
function cfNotifyLink(key, before, linkText, linkTitle, onLinkClick) {
  cfClearNotice(key);
  const note = document.createElement('div');
  note.className = 'claude-folders-notification cf-notice';
  note.setAttribute('data-cf-notice', key);
  const text = document.createElement('span');
  text.className = 'cf-notice-text';
  text.appendChild(document.createTextNode(before));
  const link = document.createElement('button');
  link.type = 'button';
  link.className = 'cf-notice-link';
  link.textContent = linkText;
  if (linkTitle) link.title = linkTitle;
  link.addEventListener('click', (e) => {
    e.stopPropagation();
    onLinkClick();
  });
  text.appendChild(link);
  note.appendChild(text);
  note.appendChild(cfNoticeCloseButton(note));
  cfNoticeStack().appendChild(note);
  setTimeout(() => note.classList.add('show'), 10);
  return note;
}

function cfClearNotice(key) {
  document.querySelectorAll(`[data-cf-notice="${key}"]`).forEach(el => el.remove());
}

function cfClearAccessPrompt() {
  cfClearNotice('access');
}

// Browser dialogs block the page's scripts until answered. This in-page
// confirmation resolves with true or false instead.
function cfConfirm(title, body, confirmLabel) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'cf-confirm-overlay';
    overlay.innerHTML = `
      <div class="cf-confirm-box" role="dialog" aria-modal="true">
        <div class="cf-confirm-title">${cfEscapeHtml(title)}</div>
        <div class="cf-confirm-body">${cfEscapeHtml(body)}</div>
        <div class="cf-confirm-actions">
          <button class="cf-confirm-cancel">Cancel</button>
          <button class="cf-confirm-ok">${cfEscapeHtml(confirmLabel)}</button>
        </div>
      </div>
    `;
    const finish = (answer) => { overlay.remove(); resolve(answer); };
    overlay.querySelector('.cf-confirm-cancel').addEventListener('click', () => finish(false));
    overlay.querySelector('.cf-confirm-ok').addEventListener('click', () => finish(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(false); });
    document.body.appendChild(overlay);
  });
}

// Progress readout with a fixed width and tabular digits; the geometry history is in the notes.
// buttons: [{ key, label, onClick, title }] at the bar's right end (the import run's Pause, Resume and Stop, the
// sync's controls in content/cf-sync-control.js). The key 'close' is drawn as a plain × at the far right.
// paused: true shows the pause icon in place of the spinner, 'stopped' shows neither.
// Pause icon: Font Awesome Free 6.5.2 (https://fontawesome.com/license/free, CC BY 4.0)
function showSyncProgressBar(message, buttons, paused) {
  let bar = document.getElementById('cf-sync-progress');

  // Determine position based on current page
  const isInChat = /\/chat\/[a-f0-9-]+/i.test(window.location.pathname);
  const positionStyle = isInChat
    ? 'top: 12px; right: 12px; left: auto; transform: none;'
    : 'bottom: 20px; left: 50%; transform: translateX(-50%);';

  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'cf-sync-progress';
    bar.innerHTML = `
      <div class="sync-box" style="
        position: fixed;
        ${positionStyle}
        background: #b45309;
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 13px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        display: flex;
        align-items: center;
        gap: 12px;
        z-index: 999999;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        width: 500px;
        max-width: calc(100vw - 24px);
        box-sizing: border-box;
      ">
        <svg class="sync-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="animation: cf-spin 1s linear infinite; flex: 0 0 auto;">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
        </svg>
        <svg class="sync-paused-icon" width="18" height="18" viewBox="0 0 320 512" fill="white" aria-hidden="true" style="flex: 0 0 auto; display: none;">
          <path d="M48 64C21.5 64 0 85.5 0 112V400c0 26.5 21.5 48 48 48H80c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H48zm192 0c-26.5 0-48 21.5-48 48V400c0 26.5 21.5 48 48 48h32c26.5 0 48-21.5 48-48V112c0-26.5-21.5-48-48-48H240z"/>
        </svg>
        <span class="sync-message" style="
          flex: 1 1 auto;
          min-width: 0;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          font-variant-numeric: tabular-nums;
          font-feature-settings: 'tnum' 1;
        ">${cfEscapeHtml(message)}</span>
      </div>
      <style>
        @keyframes cf-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      </style>
    `;
    document.body.appendChild(bar);
  } else {
    bar.querySelector('.sync-message').textContent = message;
  }
  bar.querySelector('.sync-message').title = message;
  bar.querySelector('.sync-spinner').style.display = paused ? 'none' : '';
  bar.querySelector('.sync-paused-icon').style.display = paused === true ? '' : 'none';

  const box = bar.querySelector('.sync-box');
  box.querySelectorAll('.sync-action').forEach(b => b.remove());
  (buttons || []).forEach(def => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `sync-action sync-${def.key}`;
    btn.textContent = def.label;
    if (def.title) {
      btn.title = def.title;
      btn.setAttribute('aria-label', def.title);
    }
    btn.style.cssText = def.key === 'close'
      ? 'flex: 0 0 auto; padding: 0 2px; border: none; background: transparent; color: #ffffff; font-size: 20px; line-height: 1; font-family: inherit; cursor: pointer;'
      : 'flex: 0 0 auto; padding: 4px 10px; border: none; border-radius: 6px; background: #d97706; color: #ffffff; font-size: 12px; font-weight: 600; font-family: inherit; cursor: pointer;';
    btn.onclick = (e) => { e.stopPropagation(); def.onClick(); };
    box.appendChild(btn);
  });
}

function hideSyncProgressBar() {
  const bar = document.getElementById('cf-sync-progress');
  if (bar) bar.remove();
}
