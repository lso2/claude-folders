// content/cf-import-record.js
// Writes the import run's progress to the run record the popup and the organizer read.
// Globals: cfImportRunNote, cfImportRunFinish
// Depends on: content/cf-run-state.js (cfRunState, cfRunStart, cfRunProgress, cfRunFinish)
// Notes: docs/notes/content/cf-import-record.js.md

// The record of the page before was in that page's memory. Each page of the run starts the record again.
function cfImportRunNote(text) {
  if (cfRunState && cfRunState.run === 'import' && !cfRunState.done) cfRunProgress(text);
  else cfRunStart('import', text);
}

// error: why the run ended early, or null
function cfImportRunFinish(lines, error) {
  if (!cfRunState || cfRunState.run !== 'import') cfRunStart('import', '');
  cfRunFinish(lines, [], error);
}
