// settings/settings-button-color.js
// The Button color section: the color of the orange buttons on claude.ai and in the popup.
// Globals: BUTTON_COLOR_SWATCHES, buttonColorEls, renderButtonColorSwatches, markButtonColorSwatch, renderButtonColorSection,
//          onButtonColorChange, onButtonColorReset, onButtonColorOrganizerChange
// Depends on: lib/storage-keys.js (BUTTON_COLOR_KEY, BUTTON_COLOR_DEFAULT, BUTTON_COLOR_ORGANIZER_KEY), lib/color-variants.js (cfApplyButtonColor),
//             settings/settings-format.js (settingsShowResult)
// Notes: docs/notes/settings/settings-button-color.js.md

// The preset circles before the custom picker. The first is the default, and choosing it works as Reset.
const BUTTON_COLOR_SWATCHES = [BUTTON_COLOR_DEFAULT, '#367fc4', '#348ca2', '#364dc4', '#b21f5f', '#c436aa'];

const buttonColorEls = {
  swatches: document.getElementById('buttonColorSwatches'),
  input: document.getElementById('buttonColorInput'),
  reset: document.getElementById('buttonColorReset'),
  organizer: document.getElementById('buttonColorOrganizer'),
  result: document.getElementById('buttonColorResult')
};

function renderButtonColorSwatches() {
  buttonColorEls.swatches.replaceChildren(...BUTTON_COLOR_SWATCHES.map((hex, i) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'settings-color-swatch';
    swatch.style.background = hex;
    swatch.dataset.color = hex;
    swatch.title = i === 0 ? `Default orange ${hex}` : hex;
    swatch.setAttribute('aria-label', swatch.title);
    swatch.addEventListener('click', () => {
      if (i === 0) {
        onButtonColorReset();
        return;
      }
      buttonColorEls.input.value = hex;
      cfApplyButtonColor(hex);
      onButtonColorChange();
    });
    return swatch;
  }));
}

// The circle of the color shown in the picker is marked. A custom color marks none.
function markButtonColorSwatch() {
  const hex = buttonColorEls.input.value.toLowerCase();
  buttonColorEls.swatches.querySelectorAll('.settings-color-swatch').forEach(swatch => {
    swatch.setAttribute('aria-pressed', swatch.dataset.color === hex ? 'true' : 'false');
  });
}

async function renderButtonColorSection() {
  let stored = null;
  try {
    const values = await chrome.storage.local.get([BUTTON_COLOR_KEY, BUTTON_COLOR_ORGANIZER_KEY]);
    stored = values[BUTTON_COLOR_KEY] || null;
    buttonColorEls.organizer.checked = values[BUTTON_COLOR_ORGANIZER_KEY] === true;
  } catch (e) {
    console.log('[SETTINGS] Button color not read:', e.message);
  }
  buttonColorEls.input.value = /^#[0-9a-f]{6}$/i.test(String(stored || '')) ? stored : BUTTON_COLOR_DEFAULT;
  if (!buttonColorEls.swatches.children.length) renderButtonColorSwatches();
  markButtonColorSwatch();
}

// Saving updates every open claude.ai tab and popup (lib/button-color.js listens for the change)
async function onButtonColorChange() {
  const hex = buttonColorEls.input.value.toLowerCase();
  if (hex === BUTTON_COLOR_DEFAULT) return onButtonColorReset();
  try {
    await chrome.storage.local.set({ [BUTTON_COLOR_KEY]: hex });
    markButtonColorSwatch();
    settingsShowResult(buttonColorEls.result, `Saved ${hex}.`, false);
  } catch (e) {
    settingsShowResult(buttonColorEls.result, `${e.name}: ${e.message}`, true);
  }
}

async function onButtonColorReset() {
  try {
    await chrome.storage.local.remove(BUTTON_COLOR_KEY);
    buttonColorEls.input.value = BUTTON_COLOR_DEFAULT;
    markButtonColorSwatch();
    settingsShowResult(buttonColorEls.result, `Reset to ${BUTTON_COLOR_DEFAULT}.`, false);
  } catch (e) {
    settingsShowResult(buttonColorEls.result, `${e.name}: ${e.message}`, true);
  }
}

// Unchecked, the organizer and its chat view keep their own oranges (lib/button-color.js)
async function onButtonColorOrganizerChange() {
  const on = buttonColorEls.organizer.checked;
  try {
    await chrome.storage.local.set({ [BUTTON_COLOR_ORGANIZER_KEY]: on });
    settingsShowResult(buttonColorEls.result, on ? 'Saved. The organizer uses the button color.' : 'Saved. The organizer keeps its own oranges.', false);
  } catch (e) {
    settingsShowResult(buttonColorEls.result, `${e.name}: ${e.message}`, true);
  }
}

buttonColorEls.organizer.addEventListener('change', onButtonColorOrganizerChange);

// Dragging in the picker previews the color on this page. Closing the picker saves it.
buttonColorEls.input.addEventListener('input', () => {
  cfApplyButtonColor(buttonColorEls.input.value.toLowerCase());
  markButtonColorSwatch();
});
buttonColorEls.input.addEventListener('change', onButtonColorChange);
buttonColorEls.reset.addEventListener('click', onButtonColorReset);
