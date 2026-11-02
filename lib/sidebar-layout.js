// lib/sidebar-layout.js
// The resizable, collapsible sidebar shared by the organizer and the settings page: width, collapsed state, drag edge.
// Loaded by organizer/index.html, settings/index.html and the offline library (copied by lib/data-file.js).
// Globals: SIDEBAR_MIN_WIDTH, SIDEBAR_MAX_WIDTH, SIDEBAR_COLLAPSED_WIDTH, SIDEBAR_DEFAULT_WIDTH, cfReadSidebarLayout,
//          cfApplySidebarLayout, cfSaveSidebarLayout, cfSetupSidebarFrame
// Depends on: cfStoreGet and cfStoreSet (lib/page-store.js, or standalone/library-store.js in the library)
// Notes: docs/notes/lib/sidebar-layout.js.md

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_COLLAPSED_WIDTH = 60;
const SIDEBAR_DEFAULT_WIDTH = 260;

// { width, collapsed } stored under storageKey, or the default width, open
async function cfReadSidebarLayout(storageKey) {
  try {
    const stored = await cfStoreGet(storageKey);
    if (stored && Number.isFinite(stored.width)) return { width: stored.width, collapsed: !!stored.collapsed };
  } catch (e) {
    console.log('[SIDEBAR] Sidebar width not read:', e.message);
  }
  return { width: SIDEBAR_DEFAULT_WIDTH, collapsed: false };
}

// ids: { sidebar, toggle } element ids. The toggle's label says what a click does.
function cfApplySidebarLayout(layout, ids) {
  const sidebar = document.getElementById(ids.sidebar);
  const width = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, layout.width));
  sidebar.style.width = width + 'px';
  sidebar.classList.toggle('collapsed', layout.collapsed);
  const toggle = document.getElementById(ids.toggle);
  const label = layout.collapsed ? 'Expand sidebar' : 'Collapse sidebar';
  toggle.title = label;
  toggle.setAttribute('aria-label', label);
}

async function cfSaveSidebarLayout(layout, storageKey) {
  try {
    await cfStoreSet(storageKey, { width: layout.width, collapsed: layout.collapsed });
  } catch (e) {
    console.log('[SIDEBAR] Sidebar width not stored:', e.message);
  }
}

// The toggle collapses the sidebar to icons and opens it again. The drag edge (ids.resizer) sets the width,
// and the arrow keys move it 16px while it has focus. layout is changed in place and stored after each change.
function cfSetupSidebarFrame(layout, storageKey, ids) {
  const sidebar = document.getElementById(ids.sidebar);
  const resizer = document.getElementById(ids.resizer);
  const apply = () => cfApplySidebarLayout(layout, ids);
  const save = () => cfSaveSidebarLayout(layout, storageKey);
  document.getElementById(ids.toggle).addEventListener('click', () => {
    layout.collapsed = !layout.collapsed;
    apply();
    save();
  });
  resizer.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    resizer.setPointerCapture(e.pointerId);
    sidebar.classList.add('resizing');
    document.body.classList.add('sidebar-resizing');
    const left = sidebar.getBoundingClientRect().left;
    const move = (ev) => {
      layout.width = Math.round(Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, ev.clientX - left)));
      apply();
    };
    const stop = () => {
      resizer.removeEventListener('pointermove', move);
      resizer.removeEventListener('pointerup', stop);
      resizer.removeEventListener('pointercancel', stop);
      sidebar.classList.remove('resizing');
      document.body.classList.remove('sidebar-resizing');
      save();
    };
    resizer.addEventListener('pointermove', move);
    resizer.addEventListener('pointerup', stop);
    resizer.addEventListener('pointercancel', stop);
  });
  resizer.addEventListener('keydown', (e) => {
    const step = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0;
    if (!step) return;
    e.preventDefault();
    layout.width = Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, layout.width + step));
    apply();
    save();
  });
}
