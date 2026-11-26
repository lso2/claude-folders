// settings/settings-tabs.js
// Switches the settings page between its Settings, Import/Export, Log, Help and About tabs in the sidebar.
// The Settings tab's name in the page and its address is main. The address #folder is the Settings tab
// scrolled to the Data folder section, the address every Allow folder access button opens (lib/folder-tab.js).
// Globals: SETTINGS_TABS, showSettingsTab, firstSettingsTab, showTabOfAddress
// Depends on: lib/storage-keys.js (HELP_ON_OPEN_KEY), settings/settings-chips.js (renderSettingsChips)
// Notes: docs/notes/settings/settings-tabs.js.md

const SETTINGS_TABS = ['main', 'transfer', 'log', 'help', 'about'];

// The tab's name goes in the address, and a reload of the page keeps the tab
function showSettingsTab(tab) {
  const name = SETTINGS_TABS.includes(tab) ? tab : 'main';
  document.querySelectorAll('.settings-panel').forEach(panel => { panel.hidden = panel.dataset.panel !== name; });
  document.querySelectorAll('.settings-tab').forEach(btn => {
    const on = btn.dataset.tab === name;
    btn.classList.toggle('active', on);
    if (on) btn.setAttribute('aria-current', 'page');
    else btn.removeAttribute('aria-current');
  });
  if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
  document.getElementById('settingsScroll').scrollTop = 0;
  renderSettingsChips(name);
}

// Help once after an install (lib/first-run.js), then the tab in the address, else Main
async function firstSettingsTab() {
  try {
    const stored = await chrome.storage.local.get(HELP_ON_OPEN_KEY);
    if (stored[HELP_ON_OPEN_KEY]) {
      await chrome.storage.local.remove(HELP_ON_OPEN_KEY);
      return 'help';
    }
  } catch (e) {
    console.log('[SETTINGS] The install flag was not read:', e.message);
  }
  return location.hash.slice(1) || 'main';
}

// #folder shows the Settings tab with its Data folder section at the top
function showTabOfAddress(tab) {
  if (tab !== 'folder') {
    showSettingsTab(tab);
    return;
  }
  showSettingsTab('main');
  document.getElementById('folderHeading')?.scrollIntoView({ block: 'start' });
}

document.querySelectorAll('.settings-tab').forEach(btn => btn.addEventListener('click', () => showSettingsTab(btn.dataset.tab)));
// The background changes an open settings tab's address to #folder and focuses the tab
window.addEventListener('hashchange', () => {
  if (location.hash === '#folder') showTabOfAddress('folder');
});
firstSettingsTab().then(showTabOfAddress);
