// settings/settings-chips.js
// The row of chips above the first section that filters the open tab to one section, or shows all of them.
// Globals: settingsChipFilter, renderSettingsChips, filterSettingsSections, updateSettingsChipArrows
// Depends on: settings/index.html (#settingsChips, #settingsChipsLeft, #settingsChipsRight, #settingsScroll),
//             settings/settings-help.js (the Help sections, read in after the page loads),
//             settings/settings-log.js (renderSettingsLog, the Log tab's chips)
// Notes: docs/notes/settings/settings-chips.js.md

// The heading id of the one section shown, or null while All is selected
let settingsChipFilter = null;

// All, then one chip per section heading (.settings-heading) of the panel shown. A tab opens on All.
// A tab with one section has no row: All and its one chip would show the same section.
// The Log tab's chips filter its entries by kind, and settings/settings-log.js draws them.
function renderSettingsChips(tab) {
  const row = document.getElementById('settingsChips');
  const panel = document.querySelector(`.settings-panel[data-panel="${tab}"]`);
  row.replaceChildren();
  settingsChipFilter = null;
  if (tab === 'log') {
    document.getElementById('settingsChipsWrap').hidden = true;
    renderSettingsLog();
    return;
  }
  const headings = panel ? panel.querySelectorAll('.settings-heading[id]') : [];
  document.getElementById('settingsChipsWrap').hidden = headings.length < 2;
  if (!panel) return;
  const addChip = (label, headingId) => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'settings-chip';
    chip.textContent = label;
    chip.dataset.heading = headingId || '';
    chip.addEventListener('click', () => filterSettingsSections(headingId));
    row.appendChild(chip);
  };
  addChip('All', null);
  headings.forEach(heading => addChip(heading.textContent, heading.id));
  filterSettingsSections(null);
  row.scrollLeft = 0;
  updateSettingsChipArrows();
}

// headingId null shows every section of the open tab
function filterSettingsSections(headingId) {
  settingsChipFilter = headingId || null;
  const panel = document.querySelector('.settings-panel:not([hidden])');
  if (panel) {
    panel.querySelectorAll('.settings-heading[id]').forEach(heading => {
      const section = heading.closest('section');
      if (section) section.hidden = !!settingsChipFilter && heading.id !== settingsChipFilter;
    });
  }
  document.querySelectorAll('#settingsChips .settings-chip').forEach(chip => {
    const on = chip.dataset.heading === (settingsChipFilter || '');
    chip.classList.toggle('active', on);
    chip.setAttribute('aria-pressed', on ? 'true' : 'false');
  });
  document.getElementById('settingsScroll').scrollTop = 0;
}

// The arrows appear on the side where chips are hidden
function updateSettingsChipArrows() {
  const row = document.getElementById('settingsChips');
  document.getElementById('settingsChipsLeft').hidden = row.scrollLeft <= 1;
  document.getElementById('settingsChipsRight').hidden = row.scrollLeft + row.clientWidth >= row.scrollWidth - 1;
}

document.getElementById('settingsChips').addEventListener('scroll', updateSettingsChipArrows);
window.addEventListener('resize', updateSettingsChipArrows);
document.getElementById('settingsChipsLeft').addEventListener('click', () => {
  document.getElementById('settingsChips').scrollBy({ left: -240, behavior: 'smooth' });
});
document.getElementById('settingsChipsRight').addEventListener('click', () => {
  document.getElementById('settingsChips').scrollBy({ left: 240, behavior: 'smooth' });
});
