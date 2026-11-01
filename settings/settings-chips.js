// settings/settings-chips.js
// The row of chips above the first section that jumps to each section of the open tab.
// Globals: renderSettingsChips, updateSettingsChipArrows
// Depends on: settings/index.html (#settingsChips, #settingsChipsLeft, #settingsChipsRight, #settingsScroll),
//             settings/settings-help.js (the Help sections, read in after the page loads)
// Notes: docs/notes/settings/settings-chips.js.md

// One chip per section heading (.settings-heading) of the panel shown
function renderSettingsChips(tab) {
  const row = document.getElementById('settingsChips');
  const panel = document.querySelector(`.settings-panel[data-panel="${tab}"]`);
  row.replaceChildren();
  if (!panel) return;
  panel.querySelectorAll('.settings-heading[id]').forEach(heading => {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'settings-chip';
    chip.textContent = heading.textContent;
    chip.addEventListener('click', () => heading.closest('section').scrollIntoView({ behavior: 'smooth', block: 'start' }));
    row.appendChild(chip);
  });
  row.scrollLeft = 0;
  updateSettingsChipArrows();
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
