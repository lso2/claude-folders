// settings/settings-clear.js
// The settings page's Clear section: empties the signed-in login's folders after a second click.
// Globals: clearEls, clearLogin, renderClearSection, onClearClick, onClearConfirm, onClearCancel
// Depends on: settings/settings-format.js (settingsShowResult), settings/settings-accounts.js
//             (settingsAccountLabel), lib/accounts.js (the listAccounts answer)
// Notes: docs/notes/settings/settings-clear.js.md

const clearEls = {
  status: document.getElementById('clearStatus'),
  start: document.getElementById('clearBtn'),
  confirm: document.getElementById('clearConfirm'),
  question: document.getElementById('clearQuestion'),
  yes: document.getElementById('clearYes'),
  no: document.getElementById('clearNo'),
  result: document.getElementById('clearResult')
};

// The login the background holds as signed in: { label, folderCount, chatCount }
let clearLogin = null;

async function renderClearSection() {
  clearEls.confirm.hidden = true;
  let answer;
  try {
    answer = await chrome.runtime.sendMessage({ action: 'listAccounts', withFolders: false });
  } catch (e) {
    clearEls.status.textContent = `The signed-in login was not read: ${e.message}`;
    return;
  }
  const current = answer && answer.success ? (answer.accounts || []).find(a => a.current) : null;
  if (!current) {
    clearLogin = null;
    clearEls.status.textContent = 'No login is signed in on claude.ai in this browser yet.';
    clearEls.start.disabled = true;
    return;
  }
  clearLogin = { label: settingsAccountLabel(current), folderCount: current.folderCount, chatCount: current.chatCount };
  clearEls.status.textContent = `Clearing empties every folder and category of ${clearLogin.label} in this browser and in its data file: ${clearLogin.folderCount} folder${clearLogin.folderCount === 1 ? '' : 's'} holding ${clearLogin.chatCount} chat${clearLogin.chatCount === 1 ? '' : 's'}.`;
  clearEls.start.disabled = clearLogin.folderCount === 0;
}

function onClearClick() {
  if (!clearLogin) return;
  clearEls.question.textContent = `Clear all ${clearLogin.folderCount} folders of ${clearLogin.label}? The folders cannot be brought back from the extension.`;
  clearEls.confirm.hidden = false;
  clearEls.start.disabled = true;
  settingsShowResult(clearEls.result, '', false);
}

function onClearCancel() {
  clearEls.confirm.hidden = true;
  clearEls.start.disabled = !clearLogin || clearLogin.folderCount === 0;
}

async function onClearConfirm() {
  clearEls.yes.disabled = true;
  try {
    const answer = await chrome.runtime.sendMessage({ action: 'clearFolderData' });
    if (!answer || !answer.success) throw new Error((answer && answer.error) || 'the background answered nothing');
    settingsShowResult(clearEls.result, answer.written
      ? 'Cleared. The data file in the data folder was written too.'
      : 'Cleared in this browser. The data folder was not written.', false);
  } catch (e) {
    settingsShowResult(clearEls.result, `Not cleared: ${e.message}`, true);
  } finally {
    clearEls.yes.disabled = false;
    await renderClearSection();
  }
}
