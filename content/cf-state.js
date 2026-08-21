// Claude Folders content script - shared state, escaping helpers and account keys
// Content Script - Injects folder UI into claude.ai

let folders = [];
let categories = [];
let allChats = [];
let metadata = {};
let cfOrganizeIndex = []; // ordered chat ids from the last "Ask Claude" prompt
let cfLegacyAvailable = false; // older data exists that this account can restore by syncing
let currentChatId = null;
let sidebarInjected = false;
let panelExpanded = false;
let sidebarInjectRetries = 0;
let chatButtonRetries = 0;
let cfActiveOrgId = null; // set at startup so chat rows can flag other accounts
let cfOrgFilter = new Set(); // account ids to show; empty means every account

// Shared folder glyph used for the sidebar nav icon and panel headers
const CF_FOLDER_ICON_PATH = 'M22 19V9a2 2 0 0 0-2-2h-8l-2-2H4a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2z';

// Claude's UI ships icon glyphs as private-use codepoints inside the same text
// nodes that carry labels, so the Projects row reads as "\ue0c9Projects" and the
// account row carries a trailing glyph. Every label read out of the DOM is
// normalized through here before it is compared or shown.
const CF_GLYPH_CHARS = /[\u{0}-\u{1f}\u{ad}\u{200b}-\u{200f}\u{2060}\u{feff}\u{e000}-\u{f8ff}\u{f0000}-\u{ffffd}\u{100000}-\u{10fffd}]/gu;

function cfStripGlyphs(text) {
  return String(text || '').replace(CF_GLYPH_CHARS, '').replace(/\s+/g, ' ').trim();
}

// True when a text node holds nothing but an icon glyph or invisible padding
function cfIsGlyphOnly(text) {
  return cfStripGlyphs(text).length === 0;
}

// Claude has two conversation routes: /chat/<uuid> and /cowork/<session id>. Only
// the first was recognized, which is why a Cowork page got no buttons at all.
function cfConversationRef(pathname) {
  const path = pathname || window.location.pathname;
  const chat = path.match(/^\/chat\/([^\/?#]+)/);
  if (chat) return { id: chat[1], kind: 'chat' };
  const cowork = path.match(/^\/cowork\/([^\/?#]+)/);
  if (cowork) return { id: cowork[1], kind: 'cowork' };
  return null;
}

function cfOnConversationPage() {
  return !!cfConversationRef();
}

// A Cowork session has no conversation endpoint, so its transcript cannot be
// fetched. Records are marked so the export pass reports them rather than failing.
function cfIsCoworkId(id) {
  return /^cse_/i.test(String(id || ''));
}

// The chat title. Claude's chat pages carry no h1 any more, so the title comes
// from the header's title control, then the document title with Claude's suffix
// removed as the backstop.
function cfCurrentChatTitle() {
  const split = document.querySelector('[data-testid="chat-title-split"]')
    || document.querySelector('[data-testid="session-title-split"]');
  const fromHeader = cfStripGlyphs(split && split.textContent);
  if (fromHeader) return fromHeader;

  const heading = document.querySelector('h1');
  const fromHeading = cfStripGlyphs(heading && heading.textContent);
  if (fromHeading) return fromHeading;

  const fromDocument = cfStripGlyphs(document.title).replace(/\s*[-\u2013]\s*Claude$/, '');
  return fromDocument || 'Untitled';
}

// Escape user-supplied strings before they go into innerHTML so a title like
// "<img onerror=...>" renders as text instead of breaking the layout
function cfEscapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow safe chat links into href so a stored "javascript:" url can't run
function cfSafeUrl(url) {
  const s = String(url || '');
  if (/^https?:\/\//i.test(s) || s.startsWith('/')) return cfEscapeHtml(s);
  return '#';
}

// ===== Account scoping =====
// Folders, known IDs and pending lists are stored separately per signed-in
// account so switching Claude accounts never shows the previous one's chats.
let cfAccountKey = 'acct_default';
let cfAccountReady = null;

function cfHash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

async function cfResolveAccountKey() {
  try {
    const res = await fetch('https://claude.ai/api/organizations', { credentials: 'include' });
    if (res.ok) {
      const orgs = await res.json();
      if (Array.isArray(orgs) && orgs.length) {
        const ids = orgs.map(o => o && (o.uuid || o.id)).filter(Boolean).sort();
        if (ids.length) return 'acct_' + cfHash(ids.join('|'));
      }
    }
  } catch (e) {
    console.log('[CONTENT] account resolve failed:', e.message);
  }
  try {
    const btn = document.querySelector('[data-testid="user-menu-button"]');
    const txt = btn?.textContent?.trim();
    if (txt) return 'acct_' + cfHash(txt);
  } catch (e) {}
  return 'acct_default';
}

function cfKnownKey() { return 'knownChatIds__' + cfAccountKey; }
function cfPendingKey() { return 'pendingNewChats__' + cfAccountKey; }
function cfMonitorKey() { return 'monitoredNewChats__' + cfAccountKey; }
function cfOrgFilterKey() { return 'orgFilter__' + cfAccountKey; }
function cfWatermarkKey(orgId) { return 'syncWatermark__' + cfAccountKey + '__' + String(orgId || 'active'); }

async function cfInitAccount() {
  cfAccountKey = await cfResolveAccountKey();
  console.log('[CONTENT] account key:', cfAccountKey);
  try {
    await chrome.runtime.sendMessage({ action: 'setAccount', accountKey: cfAccountKey });
  } catch (e) {
    console.log('[CONTENT] setAccount failed:', e.message);
  }
}
