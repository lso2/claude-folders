# inject.css

Styles every element the extension adds to claude.ai pages: the Export and Add to folder buttons, the shared-chat action bar, notices, the confirmation dialog, the export progress modal, the project page's import button and the Cowork import button on /recents.

## 1.3.0
- The notification rules were removed from content/cf-styles.js. The runtime stylesheet lands later in the cascade at equal specificity and overrode this file, the same issue 1.2.0 fixed for the chat buttons.
- Error notices are white text on dark red. 1.2.0 used a red border on a tinted background.
- New: `.cf-share-actions`, `.claude-import-btn`, `.cf-notice*`, `.cf-confirm-*`, `.import-shared-btn`.

## 1.3.1
`.cf-notice-stack` holds every toast and notice in one column. It moves up when the progress readout or the sync bar is on the page (`body:has(...)`).

## 1.3.5
- `.import-shared-btn` was removed with the panel button.
- New `.cf-project-import`: solid #d97706 with white text and no border, #b45309 on hover.
- `.claude-import-btn` on the share page changed from blue (#2563eb) to the same orange.

## 1.3.7
`.claude-share-btn`, the Share button on Cowork pages, shares the orange rules of `.claude-import-btn`.

## 1.3.9
- `.claude-share-btn` was removed with the Cowork Share button.
- `.claude-import-btn` has no rules of its own, and the share page's Import button has the `.claude-folders-btn` palette.
- `.cf-project-import` and the new `.cf-cowork-import` buttons: #3d3d3a background, #e8e6e3 text, 1px #4d4d4a border, #4d4d4a on hover. The user asked for the share and import buttons in a lighter shade of the page background with no color.
