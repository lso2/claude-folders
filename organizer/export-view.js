// organizer/export-view.js
// Shows one exported chat named in the page address, read through the background's folder writer.
// Globals: exportViewParams, loadExportView
// Depends on: lib/export-page.js (cfShowExportPage, cfShowExportProblem), background.js (readExportFile)
// Notes: docs/notes/organizer/export-view.js.md

// ?file=<export file name in chats/>&title=<chat title>, set by organizer/viewer.js and organizer/content-search.js
const exportViewParams = new URLSearchParams(location.search);

async function loadExportView() {
  const file = exportViewParams.get('file') || '';
  const title = exportViewParams.get('title') || file;
  if (!file) {
    cfShowExportProblem('No export named', 'The page address has no file parameter.', null);
    return;
  }
  let res = null;
  try {
    res = await chrome.runtime.sendMessage({ action: 'readExportFile', filename: file });
  } catch (e) {
    res = { success: false, error: e.message };
  }
  if (!res || !res.success) {
    cfShowExportProblem('Export not opened', `${file} could not be read: ${(res && res.error) || 'the background answered nothing'}`,
      { label: 'Try again', run: loadExportView });
    return;
  }
  cfShowExportPage(title, res.content);
}

loadExportView();
