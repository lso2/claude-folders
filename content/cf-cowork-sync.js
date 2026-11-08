// content/cf-cowork-sync.js
// Lists the Cowork sessions and Claude Code sessions of each readable organization as chat records for a sync.
// Globals: cfCoworkRecord, cfCollectCoworkSessions
// Depends on: lib/cowork-api.js, lib/chat-exporter.js (describeAge)
// Notes: docs/notes/content/cf-cowork-sync.js.md

// last_event_at is the session's last activity. updated_at also changed when a session
// was only opened.
function cfCoworkRecord(session, org) {
  const stamp = String(session.last_event_at || session.updated_at || session.created_at || new Date().toISOString());
  let title = String(session.title || '').replace(/\s+/g, ' ').trim();
  if (title.length > 200) title = title.substring(0, 197) + '...';
  const code = isCodeSession(session);
  return {
    id: session.id,
    title: title || (code ? 'Untitled Claude Code session' : 'Untitled Cowork session'),
    url: sessionPageUrl(session),
    date: stamp.split('T')[0],
    updatedAt: stamp,
    // The session's start, the time of its oldest message. The organizer's search sorts on it.
    createdAt: session.created_at ? String(session.created_at) : null,
    relativeDate: describeAge(stamp),
    snippet: '',
    projectId: null,
    starred: false,
    orgId: (org && org.id) || null,
    orgName: (org && org.name) || null,
    tags: [code ? 'claude-code' : 'cowork']
  };
}

// The list endpoint answers both products (docs/notes/lib/cowork-api.js.md). An organization whose list
// cannot be read is logged with the endpoint's answer and the sync carries on with the rest.
async function cfCollectCoworkSessions(orgs) {
  const records = [];
  for (const org of orgs || []) {
    try {
      const sessions = (await listCoworkSessions(org.id)).filter(s => s && isCoworkSessionId(s.id));
      sessions.forEach(session => records.push(cfCoworkRecord(session, org)));
      const code = sessions.filter(isCodeSession).length;
      console.log('[SCRAPER]', org.name + ':', sessions.length - code, 'Cowork sessions and', code, 'Claude Code sessions');
    } catch (e) {
      console.log('[SCRAPER]', org.name, 'Cowork and Claude Code sessions were not listed:', e.message);
    }
  }
  return records;
}
