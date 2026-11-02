# lib/button-color.js

Applies the button color chosen on the settings page as the `--cf-orange` and `--cf-orange-hover` custom properties on the page's root element.

## Loaded by

- `manifest.json` content scripts, after `lib/storage-keys.js`, with its check in `content/cf-boot.js`
- `popup/popup.html` and `settings/index.html`, after `lib/storage-keys.js`

## Stored value

`BUTTON_COLOR_KEY` (`cfButtonColor`) in `chrome.storage.local`, as `#rrggbb`. With nothing stored, or a value that is not `#rrggbb`, the page's inline values are removed. The stylesheet values in `inject.css` and `popup/popup.css` (`#c48135`, hover `#d19552`) then apply.

## Hover color

`cfButtonHoverColor` converts the color to HSL, adds `CF_BUTTON_HOVER_LIGHTEN` (8) points of lightness up to 95, and converts back.

| Color | Hover |
|---|---|
| #c48135 | #d09552 |
| #2563eb | #4a7eee |
| #16a34a | #1bc75a |
| #9333ea | #a758ee |
| #386780 | #447e9c |
| #ffffff | #f2f2f2 (the 95 cap makes white darker) |

## Live updates

A `chrome.storage.onChanged` listener reapplies the color in every open claude.ai tab, popup and settings page when the key changes.

## Measured, 2026-11-01

In the popup, loaded in Chromium with a storage stub:

- `#2563eb` stored: Sync's background was `rgb(37, 99, 235)`, and hovering gave `rgb(74, 126, 238)`.
- A change event to `#16a34a`: the background became `rgb(22, 163, 74)` without a reload.
- Removing the key: the background returned to `rgb(196, 129, 53)`, the `#c48135` of `popup/popup.css`.
