# settings/settings-button-color.js

The Button color section of the Settings tab, second after Automatic sync.

## Controls

- **Color**: an `<input type="color">`. Its `input` event previews the color on the settings page through `cfApplyButtonColor`. Its `change` event, fired when the picker closes, stores the color under `BUTTON_COLOR_KEY` and shows `Saved #rrggbb. Hover: #rrggbb.`
- **Sample button**: `.settings-color-sample` in `settings/settings.css`, with `var(--cf-orange, #c48135)` and a hover of `var(--cf-orange-hover, #d19552)`.
- **Reset**: removes the key, sets the picker to `BUTTON_COLOR_DEFAULT` and shows `Reset to #c48135.`

## Rendering

`renderButtonColorSection` is called from `renderSettings` in `settings/settings.js`. The picker shows the stored color, or `BUTTON_COLOR_DEFAULT` when nothing valid is stored.

## Measured, 2026-11-01

The section was loaded in Chromium with a storage stub holding `#2563eb`:

- The picker showed `#2563eb`.
- Setting `#9333ea` and firing `input` and `change` stored `#9333ea` and showed `Saved #9333ea. Hover: #a758ee.` The sample was `rgb(147, 51, 234)`, and hovering gave `rgb(167, 88, 238)`.
- Reset removed the key, set the picker to `#c48135` and showed `Reset to #c48135.`
