// lib/folder-worker.js
// Sends the service worker's data-folder requests to the offscreen document, each one within a set time.
// Loaded by the service worker (CF_BACKGROUND_FILES in background.js).
// Globals: CF_OFFSCREEN_SETUP_MS, CF_OFFSCREEN_CLOSE_MS, CF_FOLDER_REPLY_DEFAULT_MS, CF_FOLDER_REPLY_MS, cfOffscreenSetup,
//          cfWithin, cfHoldWorker, cfSetUpOffscreen, cfEnsureOffscreen, cfCloseOffscreen, cfAskOffscreenOnce, askFolderWorker
// Notes: docs/notes/lib/folder-worker.js.md

// The offscreen document is created and loaded within this time
const CF_OFFSCREEN_SETUP_MS = 15000;
const CF_OFFSCREEN_CLOSE_MS = 5000;
// The longest wait for each request's answer. A Cowork export reads every event of the session first.
const CF_FOLDER_REPLY_DEFAULT_MS = 30000;
const CF_FOLDER_REPLY_MS = {
  folderExportChatById: 240000,
  folderSyncToDisk: 120000,
  folderRefreshLibrary: 120000,
  folderIndexExports: 60000,
  folderReadAccountFiles: 60000
};

// The setup in progress. Concurrent requests share it.
let cfOffscreenSetup = null;

// The promise's own result, or a rejection with text once ms pass. The rejection carries cfTimedOut.
function cfWithin(promise, ms, text) {
  let timer = null;
  const late = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      const error = new Error(text);
      error.cfTimedOut = true;
      reject(error);
    }, ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

// Chrome stops a service worker 30 seconds after its last event or extension API call. An extension API
// call every 20 seconds while a request is pending restarts that count.
async function cfHoldWorker(promise) {
  const timer = setInterval(() => { chrome.runtime.getPlatformInfo().catch(() => {}); }, 20000);
  try {
    return await promise;
  } finally {
    clearInterval(timer);
  }
}

async function cfSetUpOffscreen() {
  if (await chrome.offscreen.hasDocument()) return;
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: ['LOCAL_STORAGE'],
    justification: 'Write export files to user folder via FileSystem API'
  });
  console.log('[BG] Offscreen document created');
}

// While a new document is loading, hasDocument() is already true and its message listener is not there yet.
// A second request waits for the first one's setup.
function cfEnsureOffscreen() {
  if (!cfOffscreenSetup) cfOffscreenSetup = cfSetUpOffscreen().finally(() => { cfOffscreenSetup = null; });
  return cfOffscreenSetup;
}

// A document that missed its time is closed, and the next request creates a new one
async function cfCloseOffscreen() {
  cfOffscreenSetup = null;
  try {
    await cfWithin((async () => {
      if (await chrome.offscreen.hasDocument()) await chrome.offscreen.closeDocument();
    })(), CF_OFFSCREEN_CLOSE_MS, `The offscreen document was not closed within ${CF_OFFSCREEN_CLOSE_MS / 1000} seconds`);
    console.log('[BG] Offscreen document closed');
  } catch (e) {
    console.log('[BG] Offscreen document not closed:', e.message);
  }
}

// { ok: true, answer } or { ok: false, timedOut, error }
async function cfAskOffscreenOnce(request) {
  try {
    await cfWithin(cfEnsureOffscreen(), CF_OFFSCREEN_SETUP_MS, `The offscreen document was not ready within ${CF_OFFSCREEN_SETUP_MS / 1000} seconds`);
  } catch (e) {
    return { ok: false, timedOut: e.cfTimedOut === true, error: e.message };
  }
  const ms = CF_FOLDER_REPLY_MS[request.action] || CF_FOLDER_REPLY_DEFAULT_MS;
  try {
    const answer = await cfHoldWorker(cfWithin(chrome.runtime.sendMessage({ ...request, target: 'offscreen' }), ms,
      `The offscreen document did not answer ${request.action} within ${ms / 1000} seconds`));
    return { ok: true, answer };
  } catch (e) {
    return { ok: false, timedOut: e.cfTimedOut === true, error: e.message };
  }
}

// The offscreen document performs every data-folder request. One that times out closes the document,
// and the request is sent once more to a new one. fallback supplies the fields a caller reads on failure.
async function askFolderWorker(request, fallback) {
  const started = Date.now();
  let result = await cfAskOffscreenOnce(request);
  if (!result.ok && result.timedOut) {
    console.log('[BG]', request.action, 'failed after', Date.now() - started, 'ms:', result.error);
    console.log('[BG] Creating the offscreen document again for', request.action);
    await cfCloseOffscreen();
    result = await cfAskOffscreenOnce(request);
  }
  if (result.ok && result.answer) return result.answer;
  const error = result.ok ? `The offscreen document answered ${request.action} with nothing` : result.error;
  console.log('[BG]', request.action, 'failed after', Date.now() - started, 'ms:', error);
  return { ...fallback, success: false, code: 'unreachable', error };
}
