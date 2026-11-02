// content/cf-import-dialog.js
// The dialog that starts an import from another account: the account, the counts, the request and the batch pause.
// Globals: CF_IMPORT_BATCH_DEFAULT, CF_IMPORT_BATCH_MAX, cfImportDialogChoices, cfImportPlanHtml, cfImportBatchSize,
//          cfOpenImportDialog
// Depends on: content/cf-migrate.js, content/cf-migrate-source.js (cfMigrationStyle), content/cf-import.js
//             (cfStartImportRun), content/cf-account-view.js (cfLoadAccountList, cfOwnAccount), content/cf-disk.js
//             (cfCheckWriteAccess, cfFolderAccessAction), content/cf-text.js, lib/storage-keys.js (MIGRATION_REQUEST_KEY)
// Notes: docs/notes/content/cf-import-dialog.js.md

// The batch size the dialog opens with, and the largest one it accepts
const CF_IMPORT_BATCH_DEFAULT = 25;
const CF_IMPORT_BATCH_MAX = 500;

// [{ value, label, accounts }]: All other accounts when there are 2 or more, then each other account with chats
function cfImportDialogChoices() {
  const others = cfOtherAccountsWithChats();
  const noun = (n) => `${n} chat${n === 1 ? '' : 's'}`;
  const choices = others.map(a => ({ value: a.key, label: `${cfAccountLabel(a)} (${noun(a.chatCount)})`, accounts: [a] }));
  if (others.length > 1) choices.unshift({ value: 'all', label: `All other accounts (${noun(others.reduce((n, a) => n + a.chatCount, 0))})`, accounts: others });
  return choices;
}

function cfImportPlanHtml(plan, accounts) {
  const what = [plan.chats ? `${plan.chats} chat${plan.chats === 1 ? '' : 's'}` : '', plan.tasks ? `${plan.tasks} Cowork task${plan.tasks === 1 ? '' : 's'}` : ''].filter(Boolean).join(' and ');
  const lines = [`<div class="cf-import-count">${plan.items.length ? `To import: ${what}` : 'Nothing to import'}</div>`];
  const skipped = cfMigrationSummary(plan);
  if (skipped) lines.push(`<div>${cfEscapeHtml(skipped)}</div>`);
  if (plan.noExport) {
    const who = accounts.length === 1 ? cfAccountLabel(accounts[0]) : 'each of those accounts';
    lines.push(`<div>Syncing while signed in to ${cfEscapeHtml(who)} writes the missing exports.</div>`);
  }
  return lines.join('');
}

// A whole number from 1 to 500. Anything else in the field becomes the nearest of those.
function cfImportBatchSize(field) {
  const n = Math.round(Number(field.value));
  const size = Number.isFinite(n) ? Math.min(CF_IMPORT_BATCH_MAX, Math.max(1, n)) : CF_IMPORT_BATCH_DEFAULT;
  field.value = String(size);
  return size;
}

// preselectKey: the account the dialog opens on (the one the panel or the organizer shows), or null for the first
async function cfOpenImportDialog(preselectKey) {
  if (document.querySelector('.cf-import-overlay')) return;
  const access = await cfCheckWriteAccess();
  if (!access.ok) {
    cfFolderAccessAction(access.code, access.folderName, access.permission).run();
    return;
  }
  if (!cfAccountList) await cfLoadAccountList();
  const choices = cfImportDialogChoices();
  const selected = choices.find(c => c.value === preselectKey) || choices.find(c => c.value !== 'all') || null;
  const style = await cfMigrationStyle();
  const options = choices.map(c => `<option value="${cfEscapeHtml(c.value)}"${c === selected ? ' selected' : ''}>${cfEscapeHtml(c.label)}</option>`).join('');
  const overlay = document.createElement('div');
  overlay.className = 'cf-confirm-overlay cf-import-overlay';
  overlay.innerHTML = `
    <div class="cf-confirm-box cf-import-box" role="dialog" aria-modal="true" aria-labelledby="cf-import-title">
      <div class="cf-confirm-title" id="cf-import-title">Import chats from another account</div>
      ${choices.length ? `
      <label class="cf-import-label" for="cf-import-from">From</label>
      <select id="cf-import-from" class="cf-import-select cf-select">${options}</select>
      <div class="cf-import-into">Into ${cfEscapeHtml(cfAccountLabel(cfOwnAccount()))} (signed in here)</div>
      <div class="cf-import-plan" aria-live="polite">Reading the data folder...</div>
      <fieldset class="cf-import-request">
        <legend class="cf-import-label">Request sent with each chat</legend>
        <label class="cf-import-option"><input type="radio" name="cf-import-request" value="short"${style === 'short' ? ' checked' : ''}> Short: Claude replies with one line</label>
        <label class="cf-import-option"><input type="radio" name="cf-import-request" value="full"${style === 'short' ? '' : ' checked'}> Reconstruct: Claude replies with a summary of the chat</label>
      </fieldset>
      <label class="cf-import-option cf-import-batch"><input type="checkbox" class="cf-import-batch-on"> Pause after each batch of
        <input type="number" class="cf-import-batch-size" min="1" max="${CF_IMPORT_BATCH_MAX}" step="1" value="${CF_IMPORT_BATCH_DEFAULT}" disabled aria-label="Chats in each batch"> chats</label>
      <div class="cf-import-note">Each chat is started as a new chat in this account, with its export attached, one at a time. The progress bar has Pause and Stop.</div>` : `
      <div class="cf-import-plan">No other account has chats in the data folder. Syncing while signed in to another account writes its chats there.</div>`}
      <div class="cf-confirm-actions">
        <button class="cf-confirm-cancel">${choices.length ? 'Cancel' : 'Close'}</button>
        ${choices.length ? '<button class="cf-confirm-ok cf-import-start" disabled>Import</button>' : ''}
      </div>
    </div>
  `;
  const close = () => {
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
  };
  // The dialog takes Escape. Claude's page and the folder pane behind the dialog get none.
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    e.stopPropagation();
    close();
  };
  overlay.querySelector('.cf-confirm-cancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  document.addEventListener('keydown', onKey, true);
  document.body.appendChild(overlay);
  if (!choices.length) return;

  const from = overlay.querySelector('.cf-import-select');
  const planEl = overlay.querySelector('.cf-import-plan');
  const start = overlay.querySelector('.cf-import-start');
  const batchOn = overlay.querySelector('.cf-import-batch-on');
  const batchSize = overlay.querySelector('.cf-import-batch-size');
  from.focus();
  batchOn.addEventListener('change', () => { batchSize.disabled = !batchOn.checked; });
  batchSize.addEventListener('change', () => cfImportBatchSize(batchSize));

  let context;
  try {
    context = await cfMigrationContext();
  } catch (e) {
    planEl.classList.add('cf-import-error');
    planEl.textContent = 'The data folder was not read: ' + e.message;
    return;
  }
  let plan = null;
  const replan = () => {
    const choice = choices.find(c => c.value === from.value);
    plan = cfPlanMigration(choice.accounts, context);
    planEl.innerHTML = cfImportPlanHtml(plan, choice.accounts);
    start.disabled = !plan.items.length;
    start.textContent = plan.items.length ? `Import ${plan.items.length}` : 'Import';
  };
  from.addEventListener('change', replan);
  replan();

  start.addEventListener('click', async () => {
    const chosen = overlay.querySelector('input[name="cf-import-request"]:checked').value;
    const batch = batchOn.checked ? cfImportBatchSize(batchSize) : 0;
    const items = plan.items.map(item => ({ ...item, style: chosen }));
    close();
    // The choice is also the setting under Import from another account in Settings
    await chrome.storage.local.set({ [MIGRATION_REQUEST_KEY]: chosen });
    console.log('[IMPORT] From', from.options[from.selectedIndex].text + ':', items.length, 'queued with the', chosen, 'request,', batch ? `pausing after each batch of ${batch}` : 'running to the end');
    await cfStartImportRun(items, { batchSize: batch });
  });
}
