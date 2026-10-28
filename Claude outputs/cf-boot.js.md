# content/cf-boot.js

The boot check: one representative function or constant per content-script part, checked with `typeof` in manifest order. Missing parts are logged by file name as `[BOOT] Claude Folders <version>: parts that did not load: ...`. A clean load logs `[BOOT] Claude Folders <version>: all N parts loaded`. Then `init()` runs.

## 1.3.4
The version from `chrome.runtime.getManifest()` was added to both lines. Opening the popup or organizer reloads the extension when the version on disk is newer, and the boot line in a claude.ai tab's console shows which version loaded.

## 1.3.5
lib/folder-picker.js and content/cf-project-import.js joined the checked parts (34 in all).

## 1.3.7
lib/cowork-api.js, lib/cowork-markdown.js, lib/cowork-export.js, content/cf-export-records.js, content/cf-cowork-sync.js and content/cf-cowork-share.js joined the checked parts (40 in all).

## 1.3.9
content/cf-cowork-import.js took the place of content/cf-cowork-share.js (40 parts).
