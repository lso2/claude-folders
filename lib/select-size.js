// lib/select-size.js
// Holds each dropdown (class cf-select) at the size a plain select with the same options has.
// Loaded by the content scripts, the popup, the organizer, the settings page and the offline library (copied).
// Globals: cfSizeSelect, cfSizeSelectsIn, cfSelectResize
// Notes: docs/notes/lib/select-size.js.md

// Chrome's customizable select (lib/select-picker.css) sizes itself to the selected option. The plain select's size
// is measured with appearance: auto. A width from the page's CSS is kept, and an automatic width is fixed in pixels.
function cfSizeSelect(select) {
  const options = [...select.options].map(option => option.textContent).join('\n');
  if (select.dataset.cfSizedFor === options) return;
  select.style.width = '';
  select.style.minHeight = '';
  select.style.appearance = 'auto';
  const styled = select.getBoundingClientRect();
  select.style.width = 'auto';
  const natural = select.getBoundingClientRect();
  select.style.width = '';
  select.style.appearance = '';
  // A hidden select has no size, and is measured when the ResizeObserver sees it shown
  if (!styled.width) return;
  if (Math.abs(styled.width - natural.width) < 0.5) select.style.width = `${natural.width}px`;
  select.style.minHeight = `${styled.height}px`;
  select.dataset.cfSizedFor = options;
}

const cfSelectResize = new ResizeObserver(entries => entries.forEach(entry => cfSizeSelect(entry.target)));

function cfSizeSelectsIn(root) {
  const selects = root.matches?.('.cf-select') ? [root] : [...(root.querySelectorAll?.('.cf-select') || [])];
  selects.forEach(select => {
    cfSelectResize.observe(select);
    cfSizeSelect(select);
  });
}

// New dropdowns, and options added, removed or renamed in one. Setting an option's text replaces its text node, a
// childList change: claude.ai's streamed text is not watched.
new MutationObserver(mutations => {
  for (const mutation of mutations) {
    const target = mutation.target.nodeType === 1 ? mutation.target : mutation.target.parentElement;
    const select = target?.closest?.('.cf-select');
    if (select) {
      delete select.dataset.cfSizedFor;
      cfSizeSelect(select);
    }
    mutation.addedNodes.forEach(node => { if (node.nodeType === 1) cfSizeSelectsIn(node); });
  }
}).observe(document.documentElement, { subtree: true, childList: true });
// A max-width that clamped a fixed width can allow more after the window grows
window.addEventListener('resize', () => {
  document.querySelectorAll('.cf-select').forEach(select => {
    delete select.dataset.cfSizedFor;
    cfSizeSelect(select);
  });
});
cfSizeSelectsIn(document);
