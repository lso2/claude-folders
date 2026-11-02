// standalone/view.js
// Shows one chat of the offline library, named in the page address, read from the library folder's chats folder.
// Globals: libraryViewParams, loadLibraryView
// Depends on: data.js, library-files.js (libraryAccessState, libraryOpenFolder, libraryListExports, libraryReadExport,
//             libraryExportPrefix), export-page.js (cfShowExportPage, cfShowExportProblem), all copied into the data
//             folder by lib/data-file.js
// Notes: docs/notes/standalone/view.js.md

// ?chat=<chat id>&title=<chat title>, set by standalone/app.js openMarkdownViewer
const libraryViewParams = new URLSearchParams(location.search);

async function loadLibraryView() {
  const chatId = libraryViewParams.get('chat') || '';
  const title = libraryViewParams.get('title') || chatId;
  if (!chatId) {
    cfShowExportProblem('No chat named', 'The page address has no chat parameter.', null);
    return;
  }
  // A data.js written by an older build holds the chat texts itself
  const embedded = (typeof claudeFoldersData !== 'undefined') && claudeFoldersData.content;
  if (embedded && embedded[chatId]) {
    cfShowExportPage(title, embedded[chatId]);
    return;
  }
  const state = await libraryAccessState();
  if (state === 'unsupported') {
    cfShowExportProblem('Chat not opened', 'This browser cannot read the chats folder from a page opened from disk. Chrome and Edge can.', null);
    return;
  }
  // Chrome grants folder access from a click only
  if (state !== 'granted') {
    cfShowExportProblem('Chat not opened', state === 'none'
      ? 'The chat is read from the chats folder of this library. Choose the folder that holds this page.'
      : 'The chat is read from the chats folder of this library, and this visit needs your permission.', {
      label: state === 'none' ? 'Choose folder' : 'Allow reading',
      run: async () => {
        try {
          await libraryOpenFolder();
        } catch (e) {
          if (e.name !== 'AbortError') {
            cfShowExportProblem('Library folder not opened', `${e.name}: ${e.message}`, null);
            return;
          }
        }
        loadLibraryView();
      }
    });
    return;
  }
  let content = null;
  try {
    await libraryListExports();
    content = await libraryReadExport(chatId);
  } catch (e) {
    cfShowExportProblem('Chat not opened', `The chat's file could not be read: ${e.name}: ${e.message}`, null);
    return;
  }
  if (!content) {
    cfShowExportProblem('No export yet', `No file in the chats folder starts with ${libraryExportPrefix(chatId)}_. A sync in the Claude Folders extension exports it.`, null);
    return;
  }
  cfShowExportPage(title, content);
}

loadLibraryView();
