// lib/color-variants.js
// Sets --cf-base, the chosen button color every orange of lib/color-variants.css is worked out from, and marks a chosen color.
// Loaded by the content scripts, the popup, the organizer, its export view, the settings page and the access window,
// and copied beside the offline library by lib/data-file.js.
// Globals: cfApplyButtonColor
// Notes: docs/notes/lib/color-variants.js.md

// hex null removes the page's own value, and the default oranges of lib/color-variants.css apply. A hex marks the root
// with data-cf-custom-color, the block that keeps the chosen hue.
function cfApplyButtonColor(hex) {
  if (hex) {
    document.documentElement.style.setProperty('--cf-base', hex);
    document.documentElement.setAttribute('data-cf-custom-color', '');
  } else {
    document.documentElement.style.removeProperty('--cf-base');
    document.documentElement.removeAttribute('data-cf-custom-color');
  }
}
