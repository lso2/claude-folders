// lib/export-files.js
// Reads and writes markdown exports in the chats/ subfolder of the data folder.
// Loaded by the popup, the organizer, the offscreen writer and the access window.
// Globals: writeExportFileChecked, writeExportFile, checkExportExists, listExportedChats,
//          readExportFile
// Depends on: lib/handle-storage.js (loadFolderHandle, checkFolderAccess)
// Notes: docs/notes/lib/export-files.js.md

// Writes one export and returns the real outcome: the folder state when access is
// missing, or the exception name and message when the write itself fails
async function writeExportFileChecked(filename, content) {
  const access = await checkFolderAccess();
  if (!access.hasHandle) {
    return { success: false, code: 'no-folder', error: access.error || 'No data folder is selected' };
  }
  if (access.permission !== 'granted') {
    return {
      success: false,
      code: 'permission',
      folderName: access.folderName,
      permission: access.permission,
      error: `Access to the data folder "${access.folderName}" is "${access.permission}"`
    };
  }
  try {
    const handle = await loadFolderHandle();
    const chatsFolder = await handle.getDirectoryHandle('chats', { create: true });
    const fileHandle = await chatsFolder.getFileHandle(filename, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
    return { success: true, filename };
  } catch (err) {
    return { success: false, code: 'write', error: `${err.name}: ${err.message}` };
  }
}

async function writeExportFile(filename, content) {
  const result = await writeExportFileChecked(filename, content);
  if (!result.success) console.log('[STORAGE] Export write failed:', filename, result.error);
  return result.success;
}

/**
 * Check if a chat has been exported (file exists)
 * @param {string} filename - Filename to check
 * @returns {Promise<boolean>}
 */
async function checkExportExists(filename) {
  try {
    const handle = await loadFolderHandle();
    if (!handle) return false;
    
    const chatsFolder = await handle.getDirectoryHandle('chats', { create: false });
    await chatsFolder.getFileHandle(filename);
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * List all exported chat files
 * @returns {Promise<string[]>} Array of filenames
 */
async function listExportedChats() {
  try {
    const handle = await loadFolderHandle();
    if (!handle) return [];
    
    const chatsFolder = await handle.getDirectoryHandle('chats', { create: false });
    
    const files = [];
    for await (const entry of chatsFolder.values()) {
      if (entry.kind === 'file' && entry.name.endsWith('.md')) {
        files.push(entry.name);
      }
    }
    return files;
  } catch (e) {
    return [];
  }
}

/**
 * Read an exported chat file
 * @param {string} filename - Filename to read
 * @returns {Promise<string|null>} File content or null
 */
async function readExportFile(filename) {
  try {
    const handle = await loadFolderHandle();
    if (!handle) return null;
    
    const chatsFolder = await handle.getDirectoryHandle('chats', { create: false });
    const fileHandle = await chatsFolder.getFileHandle(filename);
    const file = await fileHandle.getFile();
    return await file.text();
  } catch (e) {
    return null;
  }
}
