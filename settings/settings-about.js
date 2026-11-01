// settings/settings-about.js
// The settings page's version section: the extension's version, its background's build and the last
// reload the update check started.
// Globals: settingsAboutItem, renderAboutSection
// Depends on: lib/build-reload.js (CF_BUILD_RELOAD_KEY), settings/settings-format.js
// Notes: docs/notes/settings/settings-about.js.md

function settingsAboutItem(list, term, value) {
  const dt = document.createElement('dt');
  dt.textContent = term;
  const dd = document.createElement('dd');
  dd.textContent = value;
  list.append(dt, dd);
}

async function renderAboutSection() {
  const version = chrome.runtime.getManifest().version;
  document.getElementById('aboutLine').textContent = `Version ${version}`;
  let build;
  try {
    const answer = await chrome.runtime.sendMessage({ action: 'backgroundBuild' });
    build = (answer && answer.build) || `no build number (${(answer && answer.error) || 'empty answer'})`;
  } catch (e) {
    build = `no answer: ${e.message}`;
  }
  let reload = 'none recorded';
  try {
    const stored = await chrome.storage.local.get(CF_BUILD_RELOAD_KEY);
    const last = stored[CF_BUILD_RELOAD_KEY];
    if (last) reload = `${settingsTime(last.at)}, ${last.by} ${last.pair}`;
  } catch (e) {
    reload = `not read: ${e.message}`;
  }
  const list = document.getElementById('aboutList');
  list.replaceChildren();
  settingsAboutItem(list, 'Extension version', version);
  settingsAboutItem(list, 'Background build', build);
  settingsAboutItem(list, 'Extension ID', chrome.runtime.id);
  settingsAboutItem(list, 'Last update reload', reload);
}
