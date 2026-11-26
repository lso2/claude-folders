// content/cf-push.js
// On the Chats page, gives Claude's chats column a left margin equal to the width of the open Folders or Groups panel
// and its pane.
// Globals: CF_PUSH_PATH, cfUpdatePush
// Depends on: inject.css (html.cf-pushing, measured: div[data-route-outlet] is the column right of the sidebar)
// Notes: docs/notes/content/cf-push.js.md

// The Chats page, listed at /chats (Recents) and at /recents on older builds
const CF_PUSH_PATH = /^\/(chats|recents)\/?$/;

// Called when a panel or its pane opens or closes, on a new address and on a window resize
function cfUpdatePush() {
  const root = document.documentElement;
  const panel = document.querySelector('.claude-folders-panel, .claude-groups-panel');
  if (!panel || !CF_PUSH_PATH.test(location.pathname)) {
    root.classList.remove('cf-pushing');
    root.style.removeProperty('--cf-push');
    return;
  }
  // Layout sizes from the panel's left edge. The panel and the pane slide in 20px with a transform, and a rect read
  // during the slide is 20px short.
  const pane = panel.querySelector('.cf-folder-pane');
  const width = Math.max(panel.offsetWidth, pane ? pane.offsetLeft + pane.offsetWidth : 0);
  root.style.setProperty('--cf-push', width + 'px');
  root.classList.add('cf-pushing');
}

window.addEventListener('resize', cfUpdatePush);
