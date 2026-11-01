// content/cf-migrate-button.js
// The Folders panel's Import from another account button.
// Globals: cfMigrationAccount, cfRenderMigrateBar, cfStartMigration
// Depends on: lib/account-view.js (cfParseAccountView), content/cf-account-view.js (cfViewAccounts),
//             content/cf-migrate.js (cfOtherAccountsWithChats), content/cf-import-dialog.js (cfOpenImportDialog)
// Notes: docs/notes/content/cf-migrate-button.js.md

// The other account the panel's dropdown shows. This login and All accounts give null.
function cfMigrationAccount() {
  const parsed = cfParseAccountView(cfAccountView);
  if (!parsed || parsed.kind === 'all' || parsed.key === cfAccountKey) return null;
  return cfViewAccounts().find(a => a.key === parsed.key) || null;
}

// The button is shown whenever another account has chats
function cfRenderMigrateBar() {
  if (!cfOtherAccountsWithChats().length) return '';
  return '<div class="cf-migrate-bar"><button type="button" class="cf-migrate-btn" title="Choose an account and start its exported chats as new chats in this account">Import from another account</button></div>';
}

// Clicking the button opens the dialog on the account the dropdown shows, else on the first other account
function cfStartMigration() {
  const shown = cfMigrationAccount();
  return cfOpenImportDialog(shown ? shown.key : null);
}
