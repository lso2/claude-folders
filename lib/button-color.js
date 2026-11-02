// lib/button-color.js
// Applies the button color chosen on the settings page, read from extension storage, and follows its changes.
// Loaded by the content scripts, the popup, the organizer, its export view, the settings page and the access window.
// Globals: cfLoadButtonColor
// Depends on: lib/storage-keys.js (BUTTON_COLOR_KEY, BUTTON_COLOR_DEFAULT, BUTTON_COLOR_ORGANIZER_KEY), lib/color-variants.js (cfApplyButtonColor)
// Notes: docs/notes/lib/button-color.js.md

// A stored value that is not #rrggbb, or is the default orange, applies the default oranges. The organizer's pages mark their root with data-cf-color-scope="organizer",
// and keep their own oranges until Apply to the organizer is checked.
async function cfLoadButtonColor() {
  try {
    const stored = await chrome.storage.local.get([BUTTON_COLOR_KEY, BUTTON_COLOR_ORGANIZER_KEY]);
    const color = stored[BUTTON_COLOR_KEY];
    const organizerPage = document.documentElement.dataset.cfColorScope === 'organizer';
    const applies = !organizerPage || stored[BUTTON_COLOR_ORGANIZER_KEY] === true;
    const custom = /^#[0-9a-f]{6}$/i.test(String(color || '')) && color.toLowerCase() !== BUTTON_COLOR_DEFAULT;
    cfApplyButtonColor(applies && custom ? color : null);
  } catch (e) {
    console.log('[COLOR] Button color not read:', e.message);
  }
}

cfLoadButtonColor();
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && (changes[BUTTON_COLOR_KEY] || changes[BUTTON_COLOR_ORGANIZER_KEY])) cfLoadButtonColor();
});
