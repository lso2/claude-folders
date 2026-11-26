// content/cf-header-buttons.js
// The Folders and Groups buttons in the title bar of Claude's sidebar: a pair built like Claude's Chat and Code switch,
// centered between the Claude logo and that switch.
// Globals: cfHeaderButtonsOn, cfFindTitlebar, cfHeaderButtonsMissing, cfInjectHeaderButtons, cfRemoveHeaderButtons,
//          cfSetHeaderButtonOpen, cfReadHeaderButtonsSetting
// Depends on: lib/storage-keys.js (HEADER_BUTTONS_KEY), content/cf-sidebar.js (CF_SIDEBAR_ROWS, buildRowSvg),
//             inject.css (.cf-header-buttons)
// Notes: docs/notes/content/cf-header-buttons.js.md

// The setting Folders and Groups buttons in Claude's sidebar header. Nothing stored counts as on.
let cfHeaderButtonsOn = true;

// The title bar and the child of it holding Claude's Chat and Code switch (measured: div.df-titlebar in the sidebar,
// div[role="radiogroup"][aria-label="Mode"] inside its last child, which carries an auto start margin)
function cfFindTitlebar() {
  const bar = document.querySelector('aside .df-titlebar');
  if (!bar) return null;
  const mode = bar.querySelector('[role="radiogroup"]');
  return { bar, switchWrap: mode ? Array.from(bar.children).find(child => child.contains(mode)) || null : null };
}

// True when the setting is on, the title bar is drawn and React removed the pair or it was never added
function cfHeaderButtonsMissing() {
  return cfHeaderButtonsOn && !document.querySelector('.cf-header-buttons') && !!cfFindTitlebar();
}

// The pair's auto start margin and the switch's share the free space, which centers the pair between the logo and the
// switch. With no switch drawn, the pair takes auto margins on both sides.
function cfInjectHeaderButtons() {
  const found = cfFindTitlebar();
  if (!found || document.querySelector('.cf-header-buttons')) return;
  const group = document.createElement('div');
  group.className = 'cf-header-buttons draggable-none';
  if (!found.switchWrap) group.classList.add('cf-header-buttons-alone');
  group.setAttribute('role', 'group');
  group.setAttribute('aria-label', 'Claude Folders');
  CF_SIDEBAR_ROWS.forEach(row => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'cf-header-btn';
    btn.dataset.cfRow = row.attr;
    btn.title = row.label;
    btn.setAttribute('aria-label', row.label);
    btn.setAttribute('aria-pressed', String(!!row.open()));
    btn.appendChild(buildRowSvg(row.icon()));
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      row.toggle();
    });
    group.appendChild(btn);
  });
  found.bar.insertBefore(group, found.switchWrap);
}

function cfRemoveHeaderButtons() {
  document.querySelectorAll('.cf-header-buttons').forEach(el => el.remove());
}

// attr is a row's attribute, as content/cf-row-hover.js cfSetSidebarRowOpen takes it. Pressed while its panel is open.
function cfSetHeaderButtonOpen(attr, open) {
  const btn = document.querySelector(`.cf-header-btn[data-cf-row="${attr}"]`);
  if (btn) btn.setAttribute('aria-pressed', String(open));
}

function cfReadHeaderButtonsSetting() {
  chrome.storage.local.get(HEADER_BUTTONS_KEY)
    .then(stored => {
      cfHeaderButtonsOn = stored[HEADER_BUTTONS_KEY] !== false;
      if (cfHeaderButtonsOn) cfInjectHeaderButtons();
      else cfRemoveHeaderButtons();
    })
    .catch(e => console.log('[CONTENT] Header buttons setting not read:', e.message));
}

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && changes[HEADER_BUTTONS_KEY]) cfReadHeaderButtonsSetting();
});
cfReadHeaderButtonsSetting();
