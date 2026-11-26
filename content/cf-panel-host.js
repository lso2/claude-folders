// content/cf-panel-host.js
// Finds the element the Folders and Groups panels are added to: the layer of Claude's page that holds its sidebar.
// Globals: cfStartsLayer, cfHoldsFixed, cfPanelHost
// Depends on: nothing (reads Claude's page)
// Notes: docs/notes/content/cf-panel-host.js.md

// True when the element starts its own stacking context, by the CSS properties that start one
function cfStartsLayer(el) {
  const s = getComputedStyle(el);
  return s.isolation === 'isolate' || (s.position !== 'static' && s.zIndex !== 'auto') || s.opacity !== '1' ||
    s.transform !== 'none' || s.filter !== 'none' || /paint|strict|content|layout/.test(s.contain) ||
    /transform|opacity|filter/.test(s.willChange) || s.mixBlendMode !== 'normal';
}

// True when the element is the containing block of its fixed children. A panel inside it would be placed against it.
function cfHoldsFixed(el) {
  const s = getComputedStyle(el);
  return s.transform !== 'none' || s.filter !== 'none' || s.perspective !== 'none' || s.backdropFilter !== 'none' ||
    /paint|strict|content|layout/.test(s.contain) || /transform|filter|perspective/.test(s.willChange);
}

// The nearest ancestor of Claude's sidebar that starts a stacking context. In it the panels are layered with the
// sidebar, and Claude's drag ghost, drawn in the sidebar, is above them while the drag runs (inject.css,
// html.cf-claude-drag). With no sidebar, or a layer that would place the panels against itself, the panels go in the body.
function cfPanelHost() {
  const aside = document.querySelector('aside.dframe-sidebar') || document.querySelector('aside');
  let layer = null;
  for (let el = aside && aside.parentElement; el && el !== document.body; el = el.parentElement) {
    if (cfStartsLayer(el)) {
      layer = el;
      break;
    }
  }
  if (!layer) return document.body;
  for (let el = layer; el && el !== document.body; el = el.parentElement) {
    if (cfHoldsFixed(el)) return document.body;
  }
  return layer;
}
