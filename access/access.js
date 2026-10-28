// access/access.js
// Runs the data folder access window: grants folder access and performs folder requests while open.
// Globals: accessEls, showResult, logOperation, connectWriter, renderAccessState, finishAccess,
//          onGrantClick, onChooseClick
// Depends on: lib/chat-markdown.js, lib/storage-keys.js, lib/handle-storage.js, lib/data-file.js,
//             lib/export-files.js, lib/folder-access.js, lib/folder-ops.js
// Notes: docs/notes/access/access.js.md

const accessEls = {
  status: document.getElementById('accessStatus'),
  queue: document.getElementById('accessQueue'),
  grant: document.getElementById('accessGrantBtn'),
  choose: document.getElementById('accessChooseBtn'),
  result: document.getElementById('accessResult'),
  log: document.getElementById('accessLog')
};

function showResult(text, isError) {
  accessEls.result.textContent = text;
  accessEls.result.classList.toggle('error', !!isError);
  accessEls.result.hidden = false;
}

// One line per write or failure, newest first, capped at 50
function logOperation(request, result) {
  if (request.action !== 'folderWriteExport' && request.action !== 'folderExportChatById') return;
  const name = request.filename || generateExportFilename(request.chatId, request.chatTitle);
  const line = document.createElement('li');
  line.textContent = result && result.success ? `Saved ${name}` : `Not saved ${name}: ${(result && result.error) || 'no result'}`;
  accessEls.log.insertBefore(line, accessEls.log.firstChild);
  while (accessEls.log.children.length > 50) accessEls.log.lastChild.remove();
  accessEls.log.hidden = false;
}

// The service worker sends folder requests here while this window is open. The port
// reconnects when the service worker restarts.
function connectWriter() {
  const port = chrome.runtime.connect({ name: 'folder-writer' });
  port.onMessage.addListener(async (msg) => {
    let result = null;
    try {
      result = await runFolderOp(msg.request);
    } catch (e) {
      result = { success: false, code: 'write', error: `${e.name}: ${e.message}` };
    }
    logOperation(msg.request, result);
    port.postMessage({ id: msg.id, result });
  });
  port.onDisconnect.addListener(() => setTimeout(connectWriter, 1000));
}

async function renderAccessState() {
  const access = await checkFolderAccess();
  const queued = (await readQueuedExports()).length;
  accessEls.queue.hidden = queued === 0;
  accessEls.queue.textContent = `${queued} export${queued === 1 ? '' : 's'} waiting to be written.`;

  if (!access.hasHandle) {
    accessEls.status.textContent = 'No data folder is selected.';
    accessEls.grant.hidden = true;
    accessEls.choose.hidden = false;
    accessEls.choose.className = 'access-btn';
    return access;
  }
  if (access.permission === 'granted') {
    accessEls.status.textContent = `Access to "${access.folderName}" is granted.`;
  } else {
    accessEls.status.textContent = `Saving into "${access.folderName}" needs your permission (current state: ${access.permission}).`;
  }
  accessEls.grant.hidden = access.permission === 'granted';
  accessEls.choose.hidden = false;
  accessEls.choose.className = 'access-btn access-btn-light';
  return access;
}

// Writes the queue and sends folderAccessChanged to the Claude tabs. The window is left open for later writes.
async function finishAccess() {
  const flushed = await flushQueuedExports();
  await chrome.runtime.sendMessage({ action: 'folderAccessChanged', written: flushed.written, failed: flushed.failed }).catch(() => {});
  await renderAccessState();
  if (flushed.failed) {
    showResult(`${flushed.written} written, ${flushed.failed} still waiting: ${flushed.lastError}`, true);
    return;
  }
  showResult(`Access granted. ${flushed.written} queued export${flushed.written === 1 ? '' : 's'} written.`, false);
}

async function onGrantClick() {
  try {
    const result = await grantFolderAccess();
    if (!result.granted) {
      showResult(`Access was not granted (state: ${result.permission}).`, true);
      await renderAccessState();
      return;
    }
    await finishAccess();
  } catch (e) {
    showResult(`${e.name}: ${e.message}`, true);
  }
}

async function onChooseClick() {
  try {
    const result = await chooseDataFolder();
    if (!result.granted) {
      showResult(`Access to "${result.folderName}" was not granted (state: ${result.permission}).`, true);
      await renderAccessState();
      return;
    }
    await finishAccess();
  } catch (e) {
    if (e.name === 'AbortError') return;
    showResult(`${e.name}: ${e.message}`, true);
  }
}

accessEls.grant.addEventListener('click', onGrantClick);
accessEls.choose.addEventListener('click', onChooseClick);
connectWriter();
renderAccessState().then(async (access) => {
  // Opened while access already stands: only the queue needs writing
  if (access.hasHandle && access.permission === 'granted' && (await readQueuedExports()).length) {
    await finishAccess();
  }
});
