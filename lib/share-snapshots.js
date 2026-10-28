// lib/share-snapshots.js
// Reads shared-chat snapshots, project names and the chats shared into a project.
// Runs in the claude.ai content-script world, where requests carry the page's session.
// Globals: SHARE_ACTIVITY_PAGE, SHARE_PROJECT_PAGE, shareIdFromPath, fetchSnapshot,
//          fetchAccountUuid, listProjects, listProjectShares, window.shareSnapshots
// Notes: docs/notes/lib/share-snapshots.js.md

const SHARE_ACTIVITY_PAGE = 50;
const SHARE_PROJECT_PAGE = 50;

function shareIdFromPath(pathname) {
  const match = String(pathname || '').match(/^\/share\/([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

// A snapshot is only readable through the organization path, never the bare one
async function fetchSnapshot(orgId, snapshotId) {
  if (!orgId) throw new Error('Could not get org ID');
  const res = await fetch(`/api/organizations/${orgId}/chat_snapshots/${snapshotId}?rendering_mode=messages&render_all_tools=true`);
  if (!res.ok) throw new Error(`shared chat returned ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data.chat_messages) || !data.chat_messages.length) throw new Error('No messages');
  return data;
}

async function fetchAccountUuid() {
  const res = await fetch('/api/account');
  if (!res.ok) throw new Error(`account returned ${res.status}`);
  const account = await res.json();
  return account && account.uuid ? account.uuid : null;
}

async function listProjects(orgId) {
  const projects = [];
  for (let offset = 0; offset < 5000; offset += SHARE_PROJECT_PAGE) {
    const res = await fetch(`/api/organizations/${orgId}/projects_v2?limit=${SHARE_PROJECT_PAGE}&offset=${offset}&is_archived=false`);
    if (!res.ok) throw new Error(`project list returned ${res.status}`);
    const page = await res.json();
    (page.data || []).forEach(p => projects.push({ id: p.uuid, name: String(p.name || 'Project').trim() }));
    if (!page.pagination || !page.pagination.has_more) break;
  }
  return projects;
}

// Every conversation_shared event in one project's activity feed, newest first
async function listProjectShares(orgId, project) {
  const shares = [];
  for (let offset = 0; offset < 5000; offset += SHARE_ACTIVITY_PAGE) {
    const res = await fetch(`/api/organizations/${orgId}/projects/${project.id}/activity_v2?limit=${SHARE_ACTIVITY_PAGE}&offset=${offset}`);
    if (!res.ok) throw new Error(`activity for ${project.name} returned ${res.status}`);
    const page = await res.json();
    for (const event of page.data || []) {
      const d = event && event.details;
      if (!event || event.type !== 'conversation_shared' || !d || !d.snapshot_uuid) continue;
      shares.push({
        snapshotId: d.snapshot_uuid,
        conversationId: d.conversation_uuid || null,
        title: String(d.conversation_title || 'Shared chat'),
        creatorId: (event.creator && event.creator.uuid) || null,
        creatorName: (event.creator && event.creator.full_name) || '',
        projectId: project.id,
        projectName: project.name,
        sharedAt: event.created_at || null,
        orgId
      });
    }
    if (!page.pagination || !page.pagination.has_more) break;
  }
  return shares;
}

window.shareSnapshots = { shareIdFromPath, fetchSnapshot, fetchAccountUuid, listProjectShares };
