// standalone/library-color.js
// Applies the button color the extension wrote into data.js to the offline library's pages.
// Globals: none
// Depends on: data.js (claudeFoldersButtonColor, written by lib/data-file.js), color-variants.js (cfApplyButtonColor)
// Notes: docs/notes/standalone/library-color.js.md

// A page opened from disk has no extension storage, and the color is read from data.js. A data.js without it keeps
// the stylesheet oranges.
if (typeof claudeFoldersButtonColor === 'string' && /^#[0-9a-f]{6}$/i.test(claudeFoldersButtonColor)) {
  cfApplyButtonColor(claudeFoldersButtonColor);
}
