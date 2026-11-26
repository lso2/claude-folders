// lib/folder-state.js
// The background writer's access to the data folder as one status line, for the popup, the settings page and the Help tab.
// Globals: cfReadWriterState, cfDescribeWriter
// Depends on: background.js (checkWriteAccess, answered by lib/handle-storage.js cfFolderState)
// Notes: docs/notes/lib/folder-state.js.md

// The writer's answer, or { success: false, error } when the background did not give one
async function cfReadWriterState() {
  try {
    return (await chrome.runtime.sendMessage({ action: 'checkWriteAccess' })) || { success: false, error: 'no response' };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

// state: 'unreachable', 'unreadable', 'none', 'prompt' (any access short of granted) or 'granted'
function cfDescribeWriter(writer) {
  const reason = (text) => String(text || 'no response').replace(/\.$/, '');
  if (!writer || !writer.success) {
    return { state: 'unreachable', text: `Background writer: no answer (${reason(writer && writer.error)}).` };
  }
  const refusal = writer.refusal;
  // A folder handle can have an empty name, as the root of the browser's private storage does
  const folder = writer.folderName || '(no name)';
  if (refusal && refusal.code === 'unreadable') return { state: 'unreadable', text: `Data folder not read: ${reason(refusal.error)}.` };
  if (refusal && refusal.code === 'no-folder') return { state: 'none', text: 'No data folder.' };
  if (refusal) return { state: 'prompt', text: `Data folder: ${folder}. Access: not allowed.` };
  return { state: 'granted', text: `Data folder: ${folder}. Access: allowed.` };
}
