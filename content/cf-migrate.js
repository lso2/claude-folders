// content/cf-migrate.js
// Plans which exported chats and Cowork sessions of other accounts are imported into this login.
// Globals: cfOtherAccountsWithChats, cfMigrationRows, cfMigrationFolderId, cfMigrationContext, cfPlanMigration,
//          cfMigrationSummary
// Depends on: lib/chat-markdown.js (exportIdOfFilename, exportIdPrefix), lib/cowork-api.js (isCoworkSessionId),
//             content/cf-account-view.js (cfViewAccounts), content/cf-import-registry.js (cfLoadImported),
//             content/cf-text.js (cfHash)
// Notes: docs/notes/content/cf-migrate.js.md

// Other accounts with chats in their folders, in the order the background listed them
function cfOtherAccountsWithChats() {
  return cfViewAccounts().filter(a => !a.current && a.chatCount > 0);
}

// Each chat of the accounts' folders with its folder and account: [{ chat, folder, account }]
function cfMigrationRows(accounts) {
  const rows = [];
  accounts.forEach(account => (account.folders || []).forEach(folder => (folder.chats || []).forEach(chat => rows.push({ chat, folder, account }))));
  return rows;
}

// A folder of this login with the same category and name, else an id made from the category and name
function cfMigrationFolderId(category, name) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  const own = folders.find(f => norm(f.category) === norm(category) && norm(f.name) === norm(name));
  return own ? own.id : 'migrated-' + cfHash(norm(category) + '\n' + norm(name));
}

// Read once per dialog: the export files of the data folder by id prefix, the import registry, this login's
// chat ids and the ids its imported chats came from, and the organization the new chats are started in
async function cfMigrationContext() {
  const listing = await chrome.runtime.sendMessage({ action: 'listExports' });
  if (!listing || !listing.success) throw new Error('the data folder was not listed: ' + ((listing && listing.error) || 'the background answered nothing'));
  const byPrefix = new Map();
  (listing.files || []).forEach(name => {
    const id = exportIdOfFilename(name);
    if (id && !byPrefix.has(id.toLowerCase())) byPrefix.set(id.toLowerCase(), name);
  });
  const imported = await cfLoadImported();
  const own = new Set();
  const importedHere = new Set();
  folders.forEach(f => (f.chats || []).forEach(c => {
    own.add(c.id);
    const from = c.importedFrom || {};
    if (from.chatId) importedHere.add(from.chatId);
    if (from.coworkSessionId) importedHere.add(from.coworkSessionId);
  }));
  const orgId = await window.chatExporter.getActiveOrganizationId();
  return { byPrefix, imported, own, importedHere, orgId };
}

// Each chat of the accounts goes to the queue, or is counted as imported before, as also in this login's
// folders, or as having no export file. A chat listed twice is counted once. The request style is added
// when the run starts.
function cfPlanMigration(accounts, context) {
  const plan = { items: [], chats: 0, tasks: 0, imported: 0, alsoHere: 0, noExport: 0 };
  const seen = new Set();
  for (const { chat, folder, account } of cfMigrationRows(accounts)) {
    if (seen.has(chat.id)) continue;
    seen.add(chat.id);
    if ((context.imported[chat.id] && context.imported[chat.id].chatId) || context.importedHere.has(chat.id)) { plan.imported++; continue; }
    if (context.own.has(chat.id)) { plan.alsoHere++; continue; }
    const filename = context.byPrefix.get(exportIdPrefix(chat.id).toLowerCase());
    if (!filename) { plan.noExport++; continue; }
    const common = {
      filename, title: chat.title || 'Untitled', orgId: context.orgId, accountKey: account.key, migrated: true,
      folderId: cfMigrationFolderId(folder.category, folder.name), folderName: folder.name || 'Imported', category: folder.category || 'Imported'
    };
    if (isCoworkSessionId(chat.id)) {
      plan.items.push({ kind: 'cowork', sessionId: chat.id, ...common });
      plan.tasks++;
    } else {
      plan.items.push({ kind: 'migrate', sourceId: chat.id, ...common });
      plan.chats++;
    }
  }
  return plan;
}

// The skipped counts as one sentence, or '' when nothing is skipped
function cfMigrationSummary(plan) {
  const parts = [];
  if (plan.imported) parts.push(`${plan.imported} imported before`);
  if (plan.alsoHere) parts.push(`${plan.alsoHere} also in this account's folders`);
  if (plan.noExport) parts.push(`${plan.noExport} with no export in the data folder`);
  return parts.length ? `Skipped: ${parts.join(', ')}.` : '';
}
