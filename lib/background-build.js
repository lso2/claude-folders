// lib/background-build.js
// Reloads the extension when this background was started with a newer manifest than its own build.
// Globals: CF_BACKGROUND_BUILD, cfCheckBackgroundStart
// Depends on: lib/build-reload.js (cfReloadForBuild)
// Notes: docs/notes/lib/background-build.js.md

// The manifest version this background was written for. tools/check-project.js fails when they differ.
const CF_BACKGROUND_BUILD = '1.6.0';

// A browser started after the files changed loads the new manifest and can start the background
// registered for the old files. The reload registers the background from the files on disk.
function cfCheckBackgroundStart() {
  const files = chrome.runtime.getManifest().version;
  if (files !== CF_BACKGROUND_BUILD) cfReloadForBuild(CF_BACKGROUND_BUILD, files, 'background');
}

cfCheckBackgroundStart();
