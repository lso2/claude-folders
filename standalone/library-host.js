// standalone/library-host.js
// Connects the organizer modules the offline library shares to the library's chats folder, read from disk.
// organizer/organizer-host.js has the same names for the organizer.
// Globals: CF_HOST_MISSING_EXPORT, cfHostChatMenu, cfHostExportFolder, cfHostImportAccount, cfHostListAccounts,
//          cfHostReadAccountView, cfHostStoreAccountView, cfHostExportedChats, cfHostOpenChat,
//          cfHostMissingExport, cfHostIndexStep, cfHostReadExport, cfHostOpenExport, cfHostOpenFolderAccess
// Depends on: library-files.js (libraryAccessState, libraryListExports, libraryExports, libraryChatsFolder, libraryOpenFolder),
//             search-index.js (cfIndexChatsStep), chat-markdown.js (exportIdPrefix, exportPrefixOfFilename),
//             page-dialog.js (cfPageAlert), app.js (renderLibraryAccess), data.js (claudeFoldersData), account-file-list.js
//             (cfListAccountFiles), account-entries.js, account-view.js (cfParseAccountView), library-store.js, storage-keys.js
// Notes: docs/notes/standalone/library-host.js.md

// A chat with no file in the chats folder has nothing to show offline
const CF_HOST_MISSING_EXPORT = { label: 'NO EXPORT', title: 'No offline version available' };

// The library changes no folder: its folders have no move and remove menu and no Export folder button
const cfHostChatMenu = null;
const cfHostExportFolder = null;
// Importing from another account needs claude.ai
const cfHostImportAccount = null;

// data.js holds the login the extension saved last. The other accounts are the data.<account key>.json files of the
// library folder, read once reading it is allowed. Returns { current, accounts, folderError }, as the organizer's does.
async function cfHostListAccounts() {
  const own = (typeof claudeFoldersData !== 'undefined' && claudeFoldersData) || {};
  const ownUuid = own.metadata && own.metadata.account && own.metadata.account.uuid;
  let files = [];
  let folderError = null;
  try {
    if (await libraryAccessState() === 'granted') files = (await cfListAccountFiles(libraryHandle, null)).filter(f => f.data);
  } catch (e) {
    folderError = `${e.name}: ${e.message}`;
  }
  const uuidOf = f => f.data.metadata && f.data.metadata.account && f.data.metadata.account.uuid;
  const ownFile = ownUuid ? files.find(f => uuidOf(f) === ownUuid) : null;
  const current = ownFile ? ownFile.key : 'library';
  const idsByKey = new Map();
  const idsOf = data => new Set(((data && data.folders) || []).flatMap(f => (f.chats || []).map(c => c.id)));
  let entries = files.filter(f => f.key !== current).map(f => {
    idsByKey.set(f.key, idsOf(f.data));
    const entry = cfAccountEntry(f.key, f.data, 'data folder', f.name, current);
    entry.lastModified = f.lastModified;
    entry.folders = cfSlimFolders(f.data.folders);
    return entry;
  });
  idsByKey.set(current, idsOf(own));
  entries.push(cfAccountEntry(current, own, 'data.js', ownFile ? ownFile.name : null, current));
  entries = entries.filter(e => !cfIsLegacyCopy(e, idsByKey, entries));
  entries = cfOneEntryPerLogin(entries);
  entries.sort((a, b) => (b.current - a.current) || (b.chatCount - a.chatCount));
  return { current, accounts: entries, folderError };
}

// The account view stored in this page, else All accounts
async function cfHostReadAccountView(accountKey) {
  try {
    const view = await cfStoreGet(ACCOUNT_VIEW_KEY_PREFIX + accountKey);
    if (cfParseAccountView(view)) return view;
  } catch (e) {
    console.log('[LIBRARY] The account view was not read:', e.message);
  }
  return 'all';
}

async function cfHostStoreAccountView(accountKey, view) {
  try {
    await cfStoreSet(ACCOUNT_VIEW_KEY_PREFIX + accountKey, view);
  } catch (e) {
    console.log('[LIBRARY] The account view was not stored:', e.message);
  }
}

// The id prefixes of the files in the chats folder, and of the chats embedded in a data.js written before 1.4.0.
// Sort by Export date uses the files' modification times, read by the search index.
async function cfHostExportedChats() {
  const prefixes = new Set();
  try {
    if (await libraryAccessState() === 'granted') {
      await libraryListExports();
      libraryExports.forEach((name, prefix) => prefixes.add(prefix));
    }
  } catch (e) {
    console.log('[LIBRARY] The chats folder was not listed:', e.message);
  }
  const embedded = (typeof claudeFoldersData !== 'undefined' && claudeFoldersData.content) || {};
  Object.keys(embedded).forEach(id => prefixes.add(exportIdPrefix(id).toLowerCase()));
  return { prefixes, exportedAt: new Map() };
}

// The view page reads the chat again on every reload (view.html, view.js)
function cfHostOpenChat(chatId, title) {
  window.open('view.html?chat=' + encodeURIComponent(chatId) + '&title=' + encodeURIComponent(title || ''), '_blank');
}

// A page opened from disk cannot export. Resolves false: the chat still has no file.
async function cfHostMissingExport() {
  cfPageAlert('No export yet', 'This chat has no file in the chats folder yet. A sync in the Claude Folders extension exports it.');
  return false;
}

// One time slice of the content search index, read from the chats folder this visit may read
async function cfHostIndexStep(after) {
  const state = await libraryAccessState();
  if (state !== 'granted') {
    return { success: false, code: state === 'unsupported' ? 'unsupported' : 'permission', error: state === 'unsupported'
      ? 'This browser cannot read the chats folder from a page opened from disk'
      : 'Reading the library folder is not allowed on this visit' };
  }
  try {
    return await cfIndexChatsStep(await libraryChatsFolder(), after);
  } catch (e) {
    return { success: false, code: 'read', error: `${e.name}: ${e.message}` };
  }
}

async function cfHostReadExport(filename) {
  try {
    const folder = await libraryChatsFolder();
    return { success: true, content: await (await (await folder.getFileHandle(filename)).getFile()).text() };
  } catch (e) {
    return { success: false, error: `${e.name}: ${e.message}` };
  }
}

// view.html finds the export by the chat id prefix of its file name
function cfHostOpenExport(filename, title) {
  cfHostOpenChat(exportPrefixOfFilename(filename) || '', title);
}

// Runs in the click on Choose folder in the search's Chats list
async function cfHostOpenFolderAccess() {
  try {
    await libraryOpenFolder();
  } catch (e) {
    if (e.name !== 'AbortError') cfPageAlert('Library folder not opened', `${e.name}: ${e.message}`);
  }
  renderLibraryAccess();
}
