// popup/popup-export.js
// Starts Export All in the Claude tab and answers the legacy write-export messages.
// Globals: showExportAllModal, startBulkExportAllFolders, handleWriteExportFile, processPendingExports
// Depends on: popup/popup.js (folders), lib/export-files.js (writeExportFile)
// Notes: docs/notes/popup/popup-export.js.md

// ========== EXPORT ALL FUNCTIONALITY ==========
function showExportAllModal() {
  // Count total chats
  let totalChats = 0;
  folders.forEach(f => { if (f.chats) totalChats += f.chats.length; });
  
  if (totalChats === 0) {
    alert('No chats to export. Import some chats first.');
    return;
  }
  
  const estimatedMinutes = Math.ceil(totalChats * 0.5 / 60);
  
  const confirmed = confirm(
    `Export all ${totalChats} chats from ${folders.length} folders?\n\n` +
    `This will:\n` +
    `• Visit each chat page to extract content\n` +
    `• Save markdown files to your data folder/chats/\n\n` +
    `Estimated time: ${estimatedMinutes > 0 ? estimatedMinutes + ' minute(s)' : 'less than a minute'}\n\n` +
    `Note: This requires the Claude.ai tab to be open. The export will run in the content script.`
  );
  
  if (!confirmed) return;
  
  // Send message to content script to start bulk export
  startBulkExportAllFolders();
}

async function startBulkExportAllFolders() {
  try {
    // Get the active Claude.ai tab
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    if (tabs.length === 0) {
      alert('Please open Claude.ai in a tab first, then try again.');
      return;
    }
    
    // Collect all chats with folder info
    const allChats = [];
    folders.forEach(folder => {
      if (folder.chats) {
        folder.chats.forEach(chat => {
          allChats.push({
            id: chat.id,
            title: chat.title,
            url: chat.url,
            folderName: folder.name
          });
        });
      }
    });
    
    // Send to content script
    await chrome.tabs.sendMessage(tabs[0].id, {
      action: 'startBulkExport',
      chats: allChats
    });
    
    alert(`Export started for ${allChats.length} chats. Check the Claude.ai tab for progress.`);
  } catch (e) {
    alert('Error starting export: ' + e.message);
  }
}


// ========== MESSAGE LISTENER FOR EXPORT ==========
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'processPendingExports') {
    processPendingExports()
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  
  if (message.action === 'writeExportFile') {
    handleWriteExportFile(message.filename, message.content)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true; // Keep channel open for async response
  }
  
});

async function handleWriteExportFile(filename, content) {
  try {
    const result = await writeExportFile(filename, content);
    return { success: result };
  } catch (e) {
    console.log('[POPUP] writeExportFile error:', e.message);
    return { success: false, error: e.message };
  }
}

async function processPendingExports() {
  const result = await chrome.storage.local.get('pendingExports');
  const pending = result.pendingExports || [];
  
  if (pending.length === 0) return;
  
  console.log('[POPUP] Processing', pending.length, 'pending exports');
  
  for (const exp of pending) {
    await writeExportFile(exp.filename, exp.content);
  }
  
  // Clear processed exports
  await chrome.storage.local.remove('pendingExports');
  console.log('[POPUP] Processed all pending exports');
}
