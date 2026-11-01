// lib/cowork-api.js
// Calls claude.ai's code-session endpoints for Cowork sessions.
// Loaded by the content scripts, the offscreen writer and the access window.
// Globals: COWORK_API_ROOT, COWORK_LIST_PAGE, COWORK_EVENTS_PAGE, COWORK_PAGE_CEILING, COWORK_PARALLEL_PAGES,
//          isCoworkSessionId, coworkSessionUrl, coworkHeaders, coworkRequest, listCoworkSessions,
//          fetchCoworkSession, fetchCoworkEventPage, fetchCoworkEvents, coworkTurnFinished,
//          renameCoworkSession, coworkNewestTurn, coworkTurnMark, fetchCoworkNewestTurn
// Notes: docs/notes/lib/cowork-api.js.md

// Absolute, so extension pages reach the same endpoints the claude.ai page uses
const COWORK_API_ROOT = 'https://claude.ai/v1/code/sessions';
const COWORK_LIST_PAGE = 50;
// The events endpoint refuses a limit above 500
const COWORK_EVENTS_PAGE = 500;
const COWORK_PAGE_CEILING = 400;
// Event pages read at the same time by fetchCoworkEvents
const COWORK_PARALLEL_PAGES = 4;

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

// One page of events before the cursor, newest first: { batch, next }
async function fetchCoworkEventPage(sessionId, orgId, cursor) {
  const query = `/${encodeURIComponent(sessionId)}/events?limit=${COWORK_EVENTS_PAGE}` +
    (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
  const body = await coworkRequest(query, orgId) || {};
  const batch = Array.isArray(body.data) ? body.data : [];
  const next = body.resume_cursor === undefined || body.resume_cursor === null ? null : String(body.resume_cursor);
  return { batch, next };
}

// The resume cursor is the oldest sequence number of the page, and sequence numbers have no gaps
// (docs/notes/lib/cowork-api.js.md), so the older pages are asked for in parallel from the first.
// A result missing a sequence number is read again one page at a time.
// onPage(eventsRead, eventsInSession) runs after each page.
async function fetchCoworkEvents(sessionId, orgId, onPage) {
  const first = await fetchCoworkEventPage(sessionId, orgId, null);
  const bySeq = new Map();
  const add = (batch) => batch.forEach(e => bySeq.set(Number(e.sequence_num), e));
  add(first.batch);
  const oldestRead = Number(first.next);
  const expected = first.batch.length ? Number(first.batch[0].sequence_num) : 0;
  if (onPage) onPage(bySeq.size, expected);
  if (first.batch.length < COWORK_EVENTS_PAGE || !Number.isFinite(oldestRead) || oldestRead <= 1) {
    return Array.from(bySeq.values()).sort((a, b) => Number(a.sequence_num) - Number(b.sequence_num));
  }

  const cursors = [];
  for (let c = oldestRead; c > 1 && cursors.length < COWORK_PAGE_CEILING; c -= COWORK_EVENTS_PAGE) cursors.push(String(c));
  let index = 0;
  const worker = async () => {
    while (index < cursors.length) {
      const cursor = cursors[index++];
      add((await fetchCoworkEventPage(sessionId, orgId, cursor)).batch);
      if (onPage) onPage(bySeq.size, expected);
    }
  };
  await Promise.all(Array.from({ length: COWORK_PARALLEL_PAGES }, worker));

  const seqs = Array.from(bySeq.keys()).sort((a, b) => a - b);
  const contiguous = seqs.length && seqs[seqs.length - 1] - seqs[0] + 1 === seqs.length;
  if (!contiguous) {
    console.log('[EXPORT]', sessionId, 'has gaps in its sequence numbers; reading its events one page at a time');
    let cursor = null;
    for (let page = 0; page < COWORK_PAGE_CEILING; page++) {
      const { batch, next } = await fetchCoworkEventPage(sessionId, orgId, cursor);
      add(batch);
      if (onPage) onPage(bySeq.size, expected);
      if (batch.length < COWORK_EVENTS_PAGE || !next || next === cursor) break;
      cursor = next;
    }
  }
  return Array.from(bySeq.values()).sort((a, b) => Number(a.sequence_num) - Number(b.sequence_num));
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

// The newest user or assistant event: { mark, at }, its sequence number as a string and its
// created_at. Opening a session page adds control_request events. Only user and assistant events count.
function coworkNewestTurn(events) {
  let newest = null;
  for (const event of events || []) {
    if (event.event_type !== 'user' && event.event_type !== 'assistant') continue;
    const seq = Number(event.sequence_num);
    if (Number.isFinite(seq) && (!newest || seq > newest.seq)) newest = { seq, at: event.created_at || null };
  }
  return newest ? { mark: String(newest.seq), at: newest.at } : null;
}

function coworkTurnMark(events) {
  const newest = coworkNewestTurn(events);
  return newest ? newest.mark : null;
}

// The newest turn read from the session now, or null. Pages are newest first. The first page
// with a user or assistant event has the newest one.
async function fetchCoworkNewestTurn(sessionId, orgId) {
  let cursor = null;
  for (let page = 0; page < COWORK_PAGE_CEILING; page++) {
    const query = `/${encodeURIComponent(sessionId)}/events?limit=100` + (cursor ? '&cursor=' + encodeURIComponent(cursor) : '');
    const body = await coworkRequest(query, orgId) || {};
    const batch = Array.isArray(body.data) ? body.data : [];
    const newest = coworkNewestTurn(batch);
    if (newest) return newest;
    const next = body.resume_cursor === undefined || body.resume_cursor === null ? null : String(body.resume_cursor);
    if (batch.length < 100 || !next || next === cursor) return null;
    cursor = next;
  }
  return null;
}
