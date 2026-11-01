// lib/page-dialog.js
// Designed modals and notices for the extension's own pages, used in place of the browser's alert() and confirm().
// Globals: CF_PAGE_DIALOG_STYLE_ID, cfPageDialogStyle, cfPageDialog, cfPageConfirm, cfPageAlert, cfPageNotice
// Loaded by the popup, the organizer and the offline library (copied into the data folder by lib/data-file.js).
// Notes: docs/notes/lib/page-dialog.js.md

const CF_PAGE_DIALOG_STYLE_ID = 'cf-page-dialog-style';

// One stylesheet per page, in the extension's dark palette
function cfPageDialogStyle() {
  if (document.getElementById(CF_PAGE_DIALOG_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = CF_PAGE_DIALOG_STYLE_ID;
  style.textContent = `
    .cf-pd-overlay { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.6); display: flex; align-items: center;
      justify-content: center; padding: 16px; box-sizing: border-box; z-index: 2147483000; }
    .cf-pd-box { width: 420px; max-width: 100%; max-height: calc(100vh - 32px); overflow-y: auto; box-sizing: border-box;
      padding: 20px; border-radius: 12px; border: 1px solid #3d3d3a; background: #2a2a28; color: #e8e6e3;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5); font: 14px/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .cf-pd-title { margin: 0 0 8px; font-size: 16px; font-weight: 600; color: #e8e6e3; }
    .cf-pd-body { margin: 0 0 16px; color: #c2c0b5; white-space: pre-line; word-break: break-word; }
    .cf-pd-actions { display: flex; justify-content: flex-end; gap: 8px; }
    .cf-pd-btn { border: none; border-radius: 8px; padding: 8px 16px; font: 600 13px/1.2 inherit; cursor: pointer; }
    .cf-pd-btn-light { background: #535353; color: #ffffff; }
    .cf-pd-btn-light:hover { background: #626262; }
    .cf-pd-btn-primary { background: #d97706; color: #ffffff; }
    .cf-pd-btn-primary:hover { background: #b45309; }
    .cf-pd-btn-danger { background: #b91c1c; color: #ffffff; }
    .cf-pd-btn-danger:hover { background: #991b1b; }
    .cf-pd-notice { position: fixed; left: 50%; bottom: 20px; transform: translateX(-50%); display: flex; align-items: center;
      gap: 12px; max-width: calc(100vw - 32px); box-sizing: border-box; padding: 10px 14px; border-radius: 10px;
      background: #3d3d3a; color: #ffffff; box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4); z-index: 2147483001;
      font: 13px/1.4 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .cf-pd-notice-error { background: #7f1d1d; }
    .cf-pd-notice-close { border: none; background: none; color: #ffffff; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
  `;
  document.head.appendChild(style);
}

// buttons: [{ label, value, kind: 'light' | 'primary' | 'danger', cancel }]. Escape and a click outside the box
// answer with the value of the button marked cancel, else null.
function cfPageDialog({ title, body, buttons }) {
  cfPageDialogStyle();
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'cf-pd-overlay';
    const box = document.createElement('div');
    box.className = 'cf-pd-box';
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    const heading = document.createElement('div');
    heading.className = 'cf-pd-title';
    heading.textContent = title;
    box.appendChild(heading);
    if (body) {
      const text = document.createElement('div');
      text.className = 'cf-pd-body';
      text.textContent = body;
      box.appendChild(text);
    }
    const actions = document.createElement('div');
    actions.className = 'cf-pd-actions';
    const cancel = buttons.find(b => b.cancel);
    const finish = (value) => {
      document.removeEventListener('keydown', onKey, true);
      overlay.remove();
      resolve(value);
    };
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      finish(cancel ? cancel.value : null);
    };
    let focusTarget = null;
    buttons.forEach(b => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `cf-pd-btn cf-pd-btn-${b.kind || 'light'}`;
      btn.textContent = b.label;
      btn.addEventListener('click', () => finish(b.value));
      actions.appendChild(btn);
      if (b.kind === 'primary' || b.kind === 'danger') focusTarget = btn;
    });
    box.appendChild(actions);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) finish(cancel ? cancel.value : null); });
    document.addEventListener('keydown', onKey, true);
    document.body.appendChild(overlay);
    (focusTarget || actions.lastElementChild).focus();
  });
}

function cfPageConfirm(title, body, confirmLabel, danger) {
  return cfPageDialog({ title, body, buttons: [
    { label: 'Cancel', value: false, kind: 'light', cancel: true },
    { label: confirmLabel, value: true, kind: danger ? 'danger' : 'primary' }
  ] });
}

function cfPageAlert(title, body) {
  return cfPageDialog({ title, body, buttons: [{ label: 'OK', value: true, kind: 'primary', cancel: true }] });
}

// A notice at the bottom of the page. A plain notice closes after 5 seconds; an error stays until closed.
function cfPageNotice(text, isError) {
  cfPageDialogStyle();
  document.querySelector('.cf-pd-notice')?.remove();
  const notice = document.createElement('div');
  notice.className = 'cf-pd-notice' + (isError ? ' cf-pd-notice-error' : '');
  notice.setAttribute('role', isError ? 'alert' : 'status');
  const span = document.createElement('span');
  span.textContent = text;
  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'cf-pd-notice-close';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', () => notice.remove());
  notice.append(span, close);
  document.body.appendChild(notice);
  if (!isError) setTimeout(() => notice.remove(), 5000);
  return notice;
}
