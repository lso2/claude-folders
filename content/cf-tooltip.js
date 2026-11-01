// content/cf-tooltip.js
// Shows a tooltip under an element while the pointer is over it.
// Globals: cfSetTooltip, cfHideTooltip
// Depends on: inject.css (.cf-tooltip)
// Notes: docs/notes/content/cf-tooltip.js.md

// The text is read when the pointer enters, so it follows the element's current state.
// Empty text removes the tooltip from the element.
function cfSetTooltip(el, text) {
  if (text) el.dataset.cfTip = text;
  else delete el.dataset.cfTip;
  if (el.dataset.cfTipBound) return;
  el.dataset.cfTipBound = '1';
  el.addEventListener('mouseenter', () => {
    cfHideTooltip();
    if (!el.dataset.cfTip) return;
    const tip = document.createElement('div');
    tip.className = 'cf-tooltip';
    tip.setAttribute('role', 'tooltip');
    tip.textContent = el.dataset.cfTip;
    document.body.appendChild(tip);
    // Centered under the element and kept 8px inside the window
    const box = el.getBoundingClientRect();
    const width = tip.offsetWidth;
    const left = Math.min(Math.max(8, box.left + box.width / 2 - width / 2), window.innerWidth - width - 8);
    tip.style.left = `${left}px`;
    tip.style.top = `${box.bottom + 8}px`;
  });
  el.addEventListener('mouseleave', cfHideTooltip);
  el.addEventListener('click', cfHideTooltip);
}

function cfHideTooltip() {
  document.querySelectorAll('.cf-tooltip').forEach(tip => tip.remove());
}
