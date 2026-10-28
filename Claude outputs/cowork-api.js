// lib/cowork-api.js
// Calls claude.ai's code-session endpoints for Cowork sessions.
// Loaded by the content scripts, the offscreen writer and the access window.
// Globals: COWORK_API_ROOT, COWORK_LIST_PAGE, COWORK_EVENTS_PAGE, COWORK_PAGE_CEILING,
//          isCoworkSessionId, coworkSessionUrl, coworkHeaders, coworkRequest, listCoworkSessions,
//          fetchCoworkSession, fetchCoworkEvents, coworkTurnFinished, renameCoworkSession
// Notes: docs/notes/lib/cowork-api.js.md

// Absolute, so extension pages reach the same endpoints the claude.ai page uses
const COWORK_API_ROOT = 'https://claude.ai/v1/code/sessions';
const COWORK_LIST_PAGE = 50;
// The events endpoint refuses a limit above 500
const COWORK_EVENTS_PAGE = 500;
const COWORK_PAGE_CEILING = 400;

function isCoworkSessionId(id) {
  return /^cse_[A-Za-z0-9]+$/.test(String(id || ''));
}

function coworkSessionUrl(sessionId) {
  return `https://claude.ai/cowork/${sessionId}`;
}

// anthropic-version is the one header these endpoints require. The organization
// header picks the organization; without it the active one answers.
function coworkHeaders(orgId) {
  const headers = { 'anthropic-version': '2023-06-01' };
  if (orgId) headers['x-organization-uuid'] = orgId;
  return headers;
}

// Returns the parsed JSON answer, or null for an empty or non-JSON one. A failure throws
// an Error carrying the HTTP status as error.status.
async function coworkRequest(path, orgId, method, body) {
  const init = { method: method || 'GET', credentials: 'include', headers: coworkHeaders(orgId) };
  if (body !== undefined) {
    init.headers['content-type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const res = await fetch(COWORK_API_ROOT + path, init);
  const text = await res.text();
  let parsed = null;
  try { parsed = text ? JSON.parse(text) : null; } catch (e) {}
  if (!res.ok) {
    const detail = (parsed && parsed.error && parsed.error.message) || '';
    const error = new Error(`Cowork endpoint returned ${res.status}${detail ? ': ' + detail : ''}`);
    error.status = res.status;
    throw error;
  }
  return parsed;
}

// Without exclude_tags=- the list answers with no sessions
async function listCoworkSessions(orgId) {
  const sessions = [];
  let cursor = null;
  for (let page = 0; page < COWORK_PAGE_CEILING; page++) {
    const query = `?limit=${COWORK_LIST_PAGE}&exclude_tags=-` + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const body = await coworkRequest(query, orgId) || {};
    sessions.push(...(Array.isArray(body.data) ? body.data : []));
    if (!body.next_cursor || body.next_cursor === cursor) break;
    cursor = body.next_cursor;
  }
  return sessions;
}

// The session object is wrapped in response_shape
async function fetchCoworkSession(sessionId, orgId) {
  const body = await coworkRequest('/' + encodeURIComponent(sessionId), orgId) || {};
  return body.response_shape || body;
}

// Pages arrive newest first, and each resume_cursor asks for the events before it.
// The result is in sequence order.
async function fetchCoworkEvents(sessionId, orgId, onPage) {
  const events = [];
  let cursor = null;
  for (let page = 0; page < COWORK_PAGE_CEILING; page++) {
    const query = `/${encodeURIComponent(sessionId)}/events?limit=${COWORK_EVENTS_PAGE}` +
      (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const body = await coworkRequest(query, orgId) || {};
    const batch = Array.isArray(body.data) ? body.data : [];
    events.push(...batch);
    if (onPage) onPage(events.length);
    const next = body.resume_cursor === undefined || body.resume_cursor === null ? null : String(body.resume_cursor);
    if (batch.length < COWORK_EVENTS_PAGE || !next || next === cursor) break;
    cursor = next;
  }
  return events.sort((a, b) => Number(a.sequence_num) - Number(b.sequence_num));
}

// True once the session's newest events include a result event. The import waits for
// the first one in a task it started.
async function coworkTurnFinished(sessionId, orgId) {
  const body = await coworkRequest(`/${encodeURIComponent(sessionId)}/events?limit=50`, orgId) || {};
  return (Array.isArray(body.data) ? body.data : []).some(event => event.event_type === 'result');
}

// The same two requests Claude's Rename dialog sends: the new title, then a
// rename_session control request for the session's worker
async function renameCoworkSession(sessionId, title, orgId) {
  const path = '/' + encodeURIComponent(sessionId);
  await coworkRequest(path, orgId, 'PUT', { title });
  const requestId = `rename-session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  await coworkRequest(path + '/events', orgId, 'POST', {
    events: [{ payload: { type: 'control_request', request_id: requestId, request: { subtype: 'rename_session', title }, uuid: crypto.randomUUID() } }]
  });
}
