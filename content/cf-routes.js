// content/cf-routes.js
// Identifies which Claude page is open and reads the open conversation's title.
// Globals: cfConversationRef, cfOnConversationPage, cfIsCoworkId, cfCurrentChatTitle
// Depends on: content/cf-text.js (cfStripGlyphs), lib/share-snapshots.js (shareIdFromPath)
// Notes: docs/notes/content/cf-routes.js.md

// Claude serves conversations at /chat/<uuid>, Cowork sessions at /cowork/<id> and
// shared snapshots at /share/<uuid>
function cfConversationRef(pathname) {
  const path = pathname || window.location.pathname;
  const chat = path.match(/^\/chat\/([^\/?#]+)/);
  if (chat) return { id: chat[1], kind: 'chat' };
  const cowork = path.match(/^\/cowork\/([^\/?#]+)/);
  if (cowork) return { id: cowork[1], kind: 'cowork' };
  const share = shareIdFromPath(path);
  if (share) return { id: share, kind: 'share' };
  return null;
}

function cfOnConversationPage() {
  return !!cfConversationRef();
}

// A Cowork session has no conversation endpoint, so its transcript cannot be fetched
function cfIsCoworkId(id) {
  return /^cse_/i.test(String(id || ''));
}

// The header's title control, then an h1, then the document title without Claude's suffix
function cfCurrentChatTitle() {
  const split = document.querySelector('[data-testid="chat-title-split"]')
    || document.querySelector('[data-testid="session-title-split"]');
  const fromHeader = cfStripGlyphs(split && split.textContent);
  if (fromHeader) return fromHeader;

  const heading = document.querySelector('h1');
  const fromHeading = cfStripGlyphs(heading && heading.textContent);
  if (fromHeading) return fromHeading;

  const fromDocument = cfStripGlyphs(document.title).replace(/\s*[-–]\s*Claude$/, '');
  return fromDocument || 'Untitled';
}
