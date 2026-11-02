// lib/activity-kinds.js
// Gives entries written before the activity log's categories the kind their text now gets.
// Loaded by the service worker (CF_BACKGROUND_FILES in background.js).
// Globals: CF_ACTIVITY_KIND_RULES, cfActivityKindOf
// Notes: docs/notes/lib/activity-kinds.js.md

// [kind written, text pattern, kind now]. Settings held every settings change, and Sync every run.
const CF_ACTIVITY_KIND_RULES = [
  ['Settings', /^Automatic sync (on|off)/, 'Auto sync'],
  ['Settings', /^(Button color |Organizer keeps its own oranges)/, 'Colors'],
  ['Settings', /^(Folders panel opens on |Account dropdown set to )/, 'Accounts'],
  ['Settings', /^Request sent with imported chats/, 'Imports'],
  ['Settings', /^(Organizer home view|Chat list sort)/, 'Organizer'],
  ['Sync', /^Automatic sync: /, 'Auto sync'],
  ['Sync', /^Folder export /, 'Exports'],
  ['Sync', /^Import from another account /, 'Imports'],
  ['Folders', /^Folder access granted/, 'Folder access']
];

function cfActivityKindOf(entry) {
  const rule = CF_ACTIVITY_KIND_RULES.find(([kind, pattern]) => entry.kind === kind && pattern.test(entry.text));
  return rule ? rule[2] : entry.kind;
}
