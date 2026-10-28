// content/cf-notify.js
// Shows the extension's toasts, action prompts, confirmations and progress readout on Claude's page.
// Globals: cfNoticeStack, showNotification, cfNotifyAction, cfClearNotice, cfClearAccessPrompt,
//          cfConfirm, showSyncProgressBar, hideSyncProgressBar
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
  const close = document.createElement('button');
  close.className = 'cf-notice-close';
  close.setAttribute('aria-label', 'Dismiss');
  close.textContent = '\u00d7';
  close.addEventListener('click', (e) => { e.stopPropagation(); note.remove(); });
  note.appendChild(close);
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

// Progress readout with a fixed width and tabular digits; the geometry history is in the notes
function showSyncProgressBar(message) {
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
      <div style="
        position: fixed;
        ${positionStyle}
        background: linear-gradient(135deg, #d97706, #b45309);
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
        width: 380px;
        box-sizing: border-box;
      ">
        <svg class="sync-spinner" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" style="animation: cf-spin 1s linear infinite; flex: 0 0 auto;">
          <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
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
}

function hideSyncProgressBar() {
  const bar = document.getElementById('cf-sync-progress');
  if (bar) bar.remove();
}
