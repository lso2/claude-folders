// popup/popup-picker.js
// Shows the setup screen's state in a browser without window.showDirectoryPicker.
// Globals: showPickerMissing
// Depends on: lib/folder-picker.js, popup/popup.html (setup screen elements)
// Notes: docs/notes/popup/popup-picker.js.md

// In that browser the Select Data Folder button is replaced by the reason and,
// in Brave, by the button that opens the flag page
function showPickerMissing() {
  document.getElementById('selectFolderBtn').classList.add('hidden');
  const note = document.getElementById('setupPickerNote');
  note.textContent = CF_PICKER_MISSING + (cfPickerFlagAvailable() ? ' ' + CF_PICKER_FLAG_HINT : '');
  note.classList.remove('hidden');
  if (!cfPickerFlagAvailable()) return;
  const flagBtn = document.getElementById('setupFlagBtn');
  flagBtn.classList.remove('hidden');
  flagBtn.addEventListener('click', () => cfOpenPickerFlag());
}
