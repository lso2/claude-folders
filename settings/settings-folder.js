// settings/settings-folder.js
// The settings page's Data folder section: the folder, the access the background writer has, and the buttons for that state.
// Globals: settingsFolderEls, folderButtonsFor, renderFolderSection, finishFolderChange, runFolderAllow, runFolderChoose,
//          showFolderResult, onFolderAllowClick, onFolderChooseClick
// Depends on: lib/handle-storage.js (cfFolderState), lib/folder-state.js, lib/folder-access.js, lib/folder-picker.js,
//             settings/settings-format.js (settingsShowResult), settings/settings-accounts.js (renderAccountsSection),
//             settings/settings-helper.js (renderHelperSection)
// Notes: docs/notes/settings/settings-folder.js.md

const settingsFolderEls = {
  status: document.getElementById('folderStatus'),
  allow: document.getElementById('folderAllow'),
  choose: document.getElementById('folderChoose'),
  flag: document.getElementById('folderFlag'),
  result: document.getElementById('folderResult')
};

// The buttons a folder state offers, shared with Step 1 of the Help tab. Allow access appears for a folder
// without access. Choosing is the main button when no folder is stored or the stored one was not read.
function folderButtonsFor(view) {
  const choosing = view.state === 'none' || view.state === 'unreadable';
  return {
    allow: !choosing && view.state !== 'granted',
    chooseText: choosing ? 'Choose folder' : 'Choose another folder',
    chooseClass: choosing ? 'btn' : 'btn btn-light'
  };
}

// The folder is the stored handle every extension page shares. Its access state is the background writer's,
// the offscreen document that saves the exports. Without the writer's answer this page checks the same handle.
async function renderFolderSection() {
  const els = settingsFolderEls;
  const writer = await cfReadWriterState();
  let view = cfDescribeWriter(writer);
  if (view.state === 'unreachable') {
    view = cfDescribeWriter(await cfFolderState());
    view.text += ` Background writer: no answer (${writer.error || 'no response'}).`;
  }
  els.flag.hidden = true;
  if (view.state === 'none' && !cfFolderPickerAvailable()) {
    els.status.textContent = CF_PICKER_MISSING + (cfPickerFlagAvailable() ? ' ' + CF_PICKER_FLAG_HINT : '');
    els.flag.hidden = !cfPickerFlagAvailable();
    els.allow.hidden = true;
    els.choose.hidden = true;
    return view;
  }
  els.status.textContent = view.text;
  const buttons = folderButtonsFor(view);
  els.allow.hidden = !buttons.allow;
  els.choose.hidden = false;
  els.choose.textContent = buttons.chooseText;
  els.choose.className = buttons.chooseClass;
  return view;
}

// A new folder or a grant is announced to the claude.ai tabs and redraws the sections that read the folder
async function finishFolderChange(folderName) {
  await announceFolderAccess(folderName);
  await renderFolderSection();
  await renderAccountsSection();
  await renderHelperSection(true);
}

// Each returns { ok, text } for the clicked page part to show, or null for a cancelled folder choice.
// Chrome's prompt appears during the click. After a browser restart it offers Allow on every visit.
async function runFolderAllow() {
  try {
    const result = await grantFolderAccess();
    if (!result.granted) {
      await renderFolderSection();
      return { ok: false, text: `Access: not allowed (${result.permission}).` };
    }
    await finishFolderChange(result.folderName);
    return { ok: true, text: 'Access: allowed.' };
  } catch (e) {
    return { ok: false, text: `${e.name}: ${e.message}` };
  }
}

async function runFolderChoose() {
  try {
    const result = await chooseDataFolder();
    if (!result.granted) {
      await renderFolderSection();
      return { ok: false, text: `Data folder: ${result.folderName}. Access: not allowed (${result.permission}).` };
    }
    await finishFolderChange(result.folderName);
    return { ok: true, text: `Data folder: ${result.folderName}. Access: allowed.` };
  } catch (e) {
    return e.name === 'AbortError' ? null : { ok: false, text: `${e.name}: ${e.message}` };
  }
}

function showFolderResult(outcome) {
  if (outcome) settingsShowResult(settingsFolderEls.result, outcome.text, !outcome.ok);
}

async function onFolderAllowClick() {
  showFolderResult(await runFolderAllow());
}

async function onFolderChooseClick() {
  showFolderResult(await runFolderChoose());
}
