// Offscreen document - has access to IndexedDB and FileSystem API

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'offscreenWriteExport') {
    handleWriteExport(message.filename, message.content)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  
  if (message.action === 'offscreenExportChatById') {
    handleExportChatById(message.chatId, message.chatTitle)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  
  if (message.action === 'offscreenReadExport') {
    handleReadExport(message.chatId, message.chatTitle)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  
  if (message.action === 'offscreenCheckExportExists') {
    handleCheckExportExists(message.chatId, message.chatTitle)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, exists: false }));
    return true;
  }

  if (message.action === 'offscreenSyncToDisk') {
    handleSyncToDisk()
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

// Write the latest cached data to the user's folder from the offscreen document,
// which always exists (the background creates it on demand), so syncing no longer
// depends on the popup being open.
async function handleSyncToDisk() {
  const result = await chrome.storage.local.get('cachedData');
  const data = result.cachedData;
  if (!data || !data.folders) {
    return { success: false, error: 'No cached data to write' };
  }
  const ok = await writeDataFile(data);
  console.log('[OFFSCREEN] syncToDisk wrote data:', ok);
  return { success: ok };
}

async function handleWriteExport(filename, content) {
  try {
    const success = await writeExportFile(filename, content);
    return { success };
  } catch (e) {
    console.log('[OFFSCREEN] writeExportFile error:', e.message);
    return { success: false, error: e.message };
  }
}

async function getOrgId() {
  // The page-side exporter persists the active org id; offscreen has no cookies
  try {
    const result = await chrome.storage.local.get('activeOrgId');
    if (result.activeOrgId) return result.activeOrgId;
  } catch (e) {}
  return null;
}

async function handleExportChatById(chatId, chatTitle) {
  try {
    const orgId = await getOrgId();
    if (!orgId) {
      throw new Error('No active org id - open claude.ai and sync once first');
    }
    // Fetch the chat conversation from Claude API
    const response = await fetch(`https://claude.ai/api/organizations/${orgId}/chat_conversations/${chatId}?tree=True&rendering_mode=messages&render_all_tools=true`, {
      credentials: 'include'
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    
    // Convert to markdown
    const markdown = convertToMarkdown(data, chatTitle);
    
    // Generate filename (same format as chat-exporter.js)
    const filename = generateExportFilename(chatId, chatTitle);
    
    // Write to file
    const success = await writeExportFile(filename, markdown);
    
    if (success) {
      // Track this export
      const result = await chrome.storage.local.get('exportedChats');
      const exportedChats = result.exportedChats || {};
      exportedChats[chatId] = new Date().toISOString();
      await chrome.storage.local.set({ exportedChats });
    }
    
    return { success };
  } catch (e) {
    console.log('[OFFSCREEN] exportChatById error:', e.message);
    return { success: false, error: e.message };
  }
}

async function handleReadExport(chatId, chatTitle) {
  try {
    const filename = generateExportFilename(chatId, chatTitle);
    const content = await readExportFile(filename);
    if (content === null) {
      return { success: false, error: 'File not found' };
    }
    return { success: true, content };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

async function handleCheckExportExists(chatId, chatTitle) {
  try {
    const filename = generateExportFilename(chatId, chatTitle);
    const exists = await checkExportExists(filename);
    return { success: true, exists };
  } catch (e) {
    return { success: false, exists: false };
  }
}

// Match the format used by chat-exporter.js
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    .substring(0, 80)
    .trim();
}

function generateExportFilename(chatId, title) {
  const prefix = chatId.substring(0, 8);
  const safeName = sanitizeFilename(title || 'Untitled');
  return `${prefix}_${safeName}.md`;
}

function convertToMarkdown(data, title) {
  let md = `# ${title}\n\n`;
  md += `**Exported:** ${new Date().toLocaleString()}\n\n`;
  md += `---\n\n`;
  
  const messages = data.chat_messages || [];
  for (const msg of messages) {
    const sender = msg.sender === 'human' ? '**Human:**' : '**Claude:**';
    md += `${sender}\n\n`;
    
    // Handle content array
    if (Array.isArray(msg.content)) {
      for (const block of msg.content) {
        if (typeof block === 'string') {
          md += `${block}\n\n`;
        } else if (block.type === 'text') {
          md += `${block.text}\n\n`;
        } else if (block.type === 'tool_use') {
          md += `\`\`\`\n[Tool: ${block.name}]\n\`\`\`\n\n`;
        }
      }
    } else if (typeof msg.content === 'string') {
      md += `${msg.content}\n\n`;
    } else if (msg.text) {
      md += `${msg.text}\n\n`;
    }
    
    md += `---\n\n`;
  }
  
  return md;
}

console.log('[OFFSCREEN] Ready');
