// content/cf-routes.js
// Identifies which Claude page is open and reads the open conversation's title.
// Globals: cfConversationRef, cfOnConversationPage, cfCurrentChatTitle
// Depends on: content/cf-text.js (cfStripGlyphs), lib/share-snapshots.js (shareIdFromPath)
// Notes: docs/notes/content/cf-routes.js.md

// Claude serves conversations at /chat/<uuid>, Cowork sessions at /cowork/<id>, Claude Code sessions at
// /code/session_<id after cse_> and shared snapshots at /share/<uuid>. Both kinds of session are read through
// the same session endpoints, so both are kind 'cowork'; product tells them apart.
function cfConversationRef(pathname) {
  const path = pathname || window.location.pathname;
  const chat = path.match(/^\/chat\/([^\/?#]+)/);
  if (chat) return { id: chat[1], kind: 'chat' };
  const cowork = path.match(/^\/cowork\/([^\/?#]+)/);
  if (cowork) return { id: cowork[1], kind: 'cowork', product: 'cowork' };
  const code = path.match(/^\/code\/session_([A-Za-z0-9]+)/);
  if (code) return { id: 'cse_' + code[1], kind: 'cowork', product: 'code' };
  const share = shareIdFromPath(path);
  if (share) return { id: share, kind: 'share' };
  return null;
}

function cfOnConversationPage() {
  return !!cfConversationRef();
}

// The header's title control, then a Claude Code page's title, then an h1, then the document title without
// Claude's suffix. A Cowork title control also holds the linked computer's status after its h2.
function cfCurrentChatTitle() {
  const split = document.querySelector('[data-testid="chat-title-split"]')
    || document.querySelector('[data-testid="session-title-split"]')
    || document.querySelector('.cc-lined-title-group');
  const titleEl = split && (split.querySelector('h2') || split);
  const fromHeader = cfStripGlyphs(titleEl && titleEl.textContent);
  if (fromHeader) return fromHeader;

  const heading = document.querySelector('h1');
  const fromHeading = cfStripGlyphs(heading && heading.textContent);
  if (fromHeading) return fromHeading;

  const fromDocument = cfStripGlyphs(document.title).replace(/\s*[-–]\s*Claude$/, '');
  return fromDocument || 'Untitled';
}
