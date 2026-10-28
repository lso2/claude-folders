// content/cf-project-import.js
// Shows an import button above the shared chats in a project's Activity tab.
// Globals: CF_PROJECT_IMPORT_CLASS, cfProjectShareState, cfProjectIdFromPath, cfLoadProjectShares,
//          cfCheckProjectImport, cfRenderProjectImport, cfImportProjectShares
// Depends on: lib/chat-exporter.js, lib/share-snapshots.js, content/cf-import-registry.js,
//             content/cf-import.js (cfStartImportRun), content/cf-notify.js (cfConfirm),
//             inject.css (.cf-project-import)
// Notes: docs/notes/content/cf-project-import.js.md

const CF_PROJECT_IMPORT_CLASS = 'cf-project-import';

// The project's chats shared by others, and the ones not yet imported, read once per visit
let cfProjectShareState = { projectId: null, loading: null, shares: [], todo: [] };

function cfProjectIdFromPath(pathname) {
  const match = String(pathname || '').match(/^\/project\/([0-9a-f-]{36})/i);
  return match ? match[1] : null;
}

// Shares made by this user are left out. Earlier imports are matched before counting.
async function cfLoadProjectShares(projectId) {
  const orgId = await window.chatExporter.getActiveOrganizationId();
  const res = await fetch(`/api/organizations/${orgId}/projects/${projectId}`);
  if (!res.ok) throw new Error(`project returned ${res.status}`);
  const project = await res.json();
  const ownId = await fetchAccountUuid();
  const shares = (await listProjectShares(orgId, { id: projectId, name: String(project.name || 'Project').trim() }))
    .filter(share => !ownId || share.creatorId !== ownId);
  if (shares.length) await cfReconcileImported(orgId, shares);
  const imported = await cfLoadImported();
  await cfFileUnfiledImports(shares, imported);
  const todo = shares.filter(share => !imported[share.snapshotId]);
  console.log('[IMPORT] Project', projectId, 'has', shares.length, 'chats shared by others,', todo.length, 'not imported');
  return { shares, todo };
}

// Runs on every burst of page mutations and acts only on a project page listing shared chats
function cfCheckProjectImport() {
  const projectId = cfProjectIdFromPath(location.pathname);
  if (!projectId) {
    if (cfProjectShareState.projectId) cfProjectShareState = { projectId: null, loading: null, shares: [], todo: [] };
    return;
  }
  if (!document.querySelector('[role="tabpanel"] a[href^="/share/"]')) return;
  if (cfProjectShareState.projectId !== projectId) {
    cfProjectShareState = { projectId, loading: null, shares: [], todo: [] };
  }
  if (!cfProjectShareState.loading) {
    const state = cfProjectShareState;
    state.loading = cfLoadProjectShares(projectId)
      .then(result => { state.shares = result.shares; state.todo = result.todo; })
      .catch(e => console.log('[IMPORT] Could not read the project activity:', e.message))
      .then(() => cfRenderProjectImport());
    return;
  }
  cfRenderProjectImport();
}

// Claude's Activity tab lists each shared chat as a link to /share/<id> inside one list.
// The button is there whenever others shared chats in the project.
function cfRenderProjectImport() {
  const firstShare = document.querySelector('[role="tabpanel"] a[href^="/share/"]');
  const list = firstShare && firstShare.closest('ul');
  const existing = document.querySelector('.' + CF_PROJECT_IMPORT_CLASS);
  const n = cfProjectShareState.todo.length;
  if (!list || !cfProjectShareState.shares.length || cfProjectIdFromPath(location.pathname) !== cfProjectShareState.projectId) {
    if (existing) existing.remove();
    return;
  }
  const label = n ? `Import ${n} shared chat${n === 1 ? '' : 's'}` : 'Import shared chats';
  if (existing && existing.nextElementSibling === list) {
    const btn = existing.querySelector('button');
    if (btn.textContent !== label) btn.textContent = label;
    return;
  }
  if (existing) existing.remove();
  const bar = document.createElement('div');
  bar.className = CF_PROJECT_IMPORT_CLASS;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  btn.addEventListener('click', cfImportProjectShares);
  bar.appendChild(btn);
  list.parentElement.insertBefore(bar, list);
}

// New shares are imported after a confirmation. With every share imported already,
// the confirmation offers to import all of them again as new chats.
async function cfImportProjectShares() {
  const todo = cfProjectShareState.todo.slice();
  const shares = cfProjectShareState.shares.slice();
  const n = todo.length;
  if (n) {
    const confirmed = await cfConfirm(
      `Import ${n} shared chat${n === 1 ? '' : 's'}?`,
      'Each one is opened as a new chat in your account with its transcript attached and a request to reconstruct it. ' +
      (n === 1 ? '1 message will be sent.' : `${n} messages will be sent one at a time.`),
      `Import ${n}`
    );
    if (confirmed) await cfStartImportRun(todo);
    return;
  }
  const total = shares.length;
  const again = await cfConfirm(
    `All ${total} shared chat${total === 1 ? ' is' : 's are'} already imported`,
    `Importing again opens each one as another new chat with its transcript attached. ` +
    (total === 1 ? '1 message will be sent.' : `${total} messages will be sent one at a time.`),
    `Import ${total} again`
  );
  if (again) await cfStartImportRun(shares);
}
