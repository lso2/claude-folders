// Chat Exporter Module - Extract and export chat content using Claude's internal API
// Location: lib/chat-exporter.js

// Cache the active org ID
let cachedActiveOrgId = null;

/**
 * Get the CURRENT ACTIVE organization ID
 * @returns {Promise<string|null>}
 */
async function getActiveOrganizationId() {
  if (cachedActiveOrgId) return cachedActiveOrgId;
  
  // Method 1: Read lastActiveOrg cookie (most reliable)
  try {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'lastActiveOrg' && value && value.match(/^[a-f0-9-]{36}$/i)) {
        cachedActiveOrgId = value;
        return value;
      }
    }
  } catch (e) {}
  
  // Method 2: Extract from page network requests
  try {
    const entries = performance.getEntriesByType('resource');
    for (const entry of entries) {
      const match = entry.name.match(/\/organizations\/([a-f0-9-]{36})\//i);
      if (match) {
        cachedActiveOrgId = match[1];
        return match[1];
      }
    }
  } catch (e) {}
  
  return null;
}

/**
 * Fetch conversation data
 */
async function fetchConversationData(chatId) {
  const orgId = await getActiveOrganizationId();
  if (!orgId) throw new Error('Could not get org ID');
  
  const url = `/api/organizations/${orgId}/chat_conversations/${chatId}?tree=True&rendering_mode=messages&render_all_tools=true`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`API returned ${res.status}`);
  
  const data = await res.json();
  if (!data.chat_messages?.length) throw new Error('No messages');
  
  // Reconstruct branch if tree mode
  if (data.current_leaf_message_uuid) {
    const branch = [];
    let uuid = data.current_leaf_message_uuid;
    let steps = 0;
    const max = data.chat_messages.length;
    
    while (uuid && steps < max) {
      const msg = data.chat_messages.find(m => m.uuid === uuid);
      if (!msg) break;
      branch.unshift(msg);
      if (!msg.parent_message_uuid) break;
      uuid = msg.parent_message_uuid;
      steps++;
    }
    data.chat_messages = branch;
  }
  
  return data;
}

/**
 * Convert conversation data to Markdown format
 * @param {Object} convoData - Conversation data from API
 * @param {string} title - Chat title
 * @param {string} chatIdOverride - Optional chat ID to use instead of extracting from URL
 * @returns {string} Markdown content
 */
function convertToMarkdown(convoData, title, chatIdOverride) {
  const exportDate = new Date().toISOString().split('T')[0];
  
  // Get chat ID from override, convoData, or URL
  const chatId = chatIdOverride || convoData.uuid || window.location.pathname.match(/\/chat\/([a-f0-9-]+)/i)?.[1] || '';
  const chatUrl = `https://claude.ai/chat/${chatId}`;
  
  let md = `# ${title}\n\n`;
  md += `**Exported:** ${exportDate}  \n`;
  md += `**URL:** ${chatUrl}  \n`;
  md += `**Chat ID:** ${chatId}\n\n`;
  md += `---\n\n`;
  
  for (const msg of convoData.chat_messages || []) {
    // Determine sender
    const sender = msg.sender === 'human' ? '## 👤 Human' : '## 🤖 Claude';
    md += `${sender}\n\n`;
    
    // Get message content
    let content = '';
    
    // Handle different content formats
    if (msg.content) {
      if (typeof msg.content === 'string') {
        content = msg.content;
      } else if (Array.isArray(msg.content)) {
        // Content can be an array of blocks (text, code, etc)
        content = msg.content.map(block => {
          if (typeof block === 'string') return block;
          if (block.type === 'text') return block.text || '';
          if (block.type === 'code') {
            const lang = block.language || '';
            return `\`\`\`${lang}\n${block.text || block.code || ''}\n\`\`\``;
          }
          if (block.type === 'tool_use') {
            return `*[Tool: ${block.name || 'unknown'}]*`;
          }
          if (block.type === 'tool_result') {
            return `*[Tool Result]*\n${block.content || ''}`;
          }
          return JSON.stringify(block);
        }).join('\n\n');
      }
    }
    
    // Handle text field (alternative format)
    if (!content && msg.text) {
      content = Array.isArray(msg.text) ? msg.text.join('\n\n') : msg.text;
    }
    
    // Handle attachments/files
    if (msg.files_v2?.length) {
      for (const file of msg.files_v2) {
        if (file.file_kind === 'image') {
          content += `\n\n![${file.file_name || 'image'}](${file.preview_url || 'attachment'})`;
        } else {
          content += `\n\n📎 *Attachment: ${file.file_name || 'file'}*`;
        }
      }
    }
    
    // Handle artifacts
    if (msg.artifacts?.length) {
      for (const artifact of msg.artifacts) {
        content += `\n\n<details>\n<summary>📦 Artifact: ${artifact.title || artifact.name || 'Untitled'}</summary>\n\n`;
        content += `\`\`\`${artifact.language || ''}\n${artifact.content || ''}\n\`\`\`\n</details>`;
      }
    }
    
    md += `${content.trim()}\n\n`;
    md += `---\n\n`;
  }
  
  return md;
}

/**
 * Sanitize filename for filesystem
 * @param {string} name - Original name
 * @returns {string} Safe filename
 */
function sanitizeFilename(name) {
  return name
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/\s+/g, '_')
    .replace(/-+/g, '-')
    .replace(/_+/g, '_')
    .substring(0, 80)
    .trim();
}

/**
 * Generate filename for export
 * @param {string} chatId - Chat ID
 * @param {string} title - Chat title
 * @returns {string} Safe filename with .md extension
 */
function generateExportFilename(chatId, title) {
  const prefix = chatId.substring(0, 8);
  const safeName = sanitizeFilename(title || 'Untitled');
  return `${prefix}_${safeName}.md`;
}

/**
 * Download markdown content as a file
 * @param {string} content - Markdown content
 * @param {string} filename - Target filename
 */
function downloadMarkdown(content, filename) {
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * Export current chat to markdown and download
 * @returns {Promise<{success: boolean, filename?: string, error?: string}>}
 */
async function exportCurrentChat() {
  try {
    const urlMatch = window.location.pathname.match(/\/chat\/([a-f0-9-]+)/i);
    if (!urlMatch) {
      return { success: false, error: 'Not on a chat page' };
    }
    
    const chatId = urlMatch[1];
    const title = document.querySelector('h1')?.textContent?.trim() || 'Untitled';
    
    const convoData = await fetchConversationData(chatId);
    const markdown = convertToMarkdown(convoData, title, chatId);
    const filename = generateExportFilename(chatId, title);
    
    return { success: true, markdown, filename };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

/**
 * Export a chat by ID (for bulk operations)
 * @param {string} chatId - Chat ID
 * @param {string} title - Chat title
 * @returns {Promise<{success: boolean, markdown?: string, filename?: string, error?: string}>}
 */
async function exportChatById(chatId, title) {
  try {
    console.log('[EXPORT] exportChatById called:', chatId, title);
    const convoData = await fetchConversationData(chatId);
    console.log('[EXPORT] Got convoData with', convoData?.chat_messages?.length || 0, 'messages');
    const markdown = convertToMarkdown(convoData, title || 'Untitled', chatId);
    const filename = generateExportFilename(chatId, title);
    
    return { success: true, markdown, filename };
  } catch (error) {
    console.log('[EXPORT] exportChatById error:', error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Bulk export multiple chats
 * @param {Array<{id: string, title: string}>} chats - Array of chat objects
 * @param {Function} onProgress - Callback for progress updates (current, total, chat)
 * @param {Function} onComplete - Callback when export completes (results)
 */
async function bulkExportChats(chats, onProgress, onComplete) {
  const results = {
    total: chats.length,
    success: 0,
    failed: 0,
    exports: []
  };
  
  for (let i = 0; i < chats.length; i++) {
    const chat = chats[i];
    
    if (onProgress) {
      onProgress(i + 1, chats.length, chat);
    }
    
    const result = await exportChatById(chat.id, chat.title);
    
    if (result.success) {
      results.success++;
      results.exports.push({
        chatId: chat.id,
        title: chat.title,
        filename: result.filename,
        markdown: result.markdown
      });
    } else {
      results.failed++;
      console.log('[EXPORT] Failed to export:', chat.title, result.error);
    }
    
    // Rate limit: wait 500ms between exports to avoid API throttling
    if (i < chats.length - 1) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
  
  if (onComplete) {
    onComplete(results);
  }
  
  return results;
}

// Make functions available globally for content script
if (typeof window !== 'undefined') {
  window.chatExporter = {
    getActiveOrganizationId,
    fetchConversationData,
    convertToMarkdown,
    exportCurrentChat,
    exportChatById,
    bulkExportChats,
    generateExportFilename,
    sanitizeFilename,
    downloadMarkdown
  };
}
