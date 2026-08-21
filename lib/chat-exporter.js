// Chat Exporter Module - Extract and export chat content using Claude's internal API
// Location: lib/chat-exporter.js

// Last-resort fallback only. We re-read the live cookie on every call so that
// switching Claude profiles/organizations in the same browser picks up the new
// org instead of reusing a stale cached id (which made exports hit the wrong
// org and fail).
let cachedActiveOrgId = null;

// Persist the resolved org id so the offscreen document (which has no page
// cookies) can build the right API URL too.
function rememberOrgId(orgId) {
  cachedActiveOrgId = orgId;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ activeOrgId: orgId });
    }
  } catch (e) {}
  return orgId;
}

/**
 * Get the CURRENT ACTIVE organization ID
 * @returns {Promise<string|null>}
 */
async function getActiveOrganizationId() {
  // Method 1: Read lastActiveOrg cookie (most reliable, always re-checked)
  try {
    const cookies = document.cookie.split(';');
    for (const cookie of cookies) {
      const [name, value] = cookie.trim().split('=');
      if (name === 'lastActiveOrg' && value && value.match(/^[a-f0-9-]{36}$/i)) {
        return rememberOrgId(value);
      }
    }
  } catch (e) {}

  // Method 2: Extract from page network requests
  try {
    const entries = performance.getEntriesByType('resource');
    for (const entry of entries) {
      const match = entry.name.match(/\/organizations\/([a-f0-9-]{36})\//i);
      if (match) {
        return rememberOrgId(match[1]);
      }
    }
  } catch (e) {}

  // Only now fall back to whatever we resolved previously
  return cachedActiveOrgId;
}

const CONVERSATION_PAGE_SIZE = 100;
const CONVERSATION_PAGE_LIMIT = 400; // 40,000 conversations before the loop stops

/**
 * Turn an ISO timestamp into the relative wording the folder UI shows
 */
function describeAge(iso) {
  const then = new Date(iso).getTime();
  if (!then) return 'Today';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days} days ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks} week${weeks === 1 ? '' : 's'} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? '' : 's'} ago`;
  const years = Math.floor(days / 365);
  return `${years} year${years === 1 ? '' : 's'} ago`;
}

/**
 * Map one API conversation record onto the chat record the folders store keeps
 */
function toChatRecord(convo, org) {
  const stamp = convo.updated_at || convo.created_at || new Date().toISOString();
  let title = String(convo.name || '').replace(/\s+/g, ' ').trim();
  if (title.length > 200) title = title.substring(0, 197) + '...';
  if (title.length < 1) title = 'Untitled Chat';
  return {
    id: convo.uuid,
    title,
    url: `https://claude.ai/chat/${convo.uuid}`,
    date: String(stamp).split('T')[0],
    updatedAt: String(stamp),
    relativeDate: describeAge(stamp),
    snippet: String(convo.summary || '').slice(0, 300),
    projectId: convo.project_uuid || null,
    starred: !!convo.is_starred,
    orgId: (org && org.id) || null,
    orgName: (org && org.name) || null,
    tags: []
  };
}

/**
 * Every organization on this login that this browser session can actually read.
 * One login can carry many organizations, and the conversation list is scoped to
 * whichever one is active, so reading only the active one reports a different
 * total every time the active organization changes.
 * @returns {Promise<Array<{id: string, name: string, count: number}>>}
 */
async function listAccessibleOrganizations() {
  const res = await fetch('/api/organizations');
  if (!res.ok) throw new Error(`Organization list returned ${res.status}`);
  const orgs = await res.json();
  if (!Array.isArray(orgs)) throw new Error('Organization list was not an array');

  const reachable = [];
  for (const org of orgs) {
    const id = org && (org.uuid || org.id);
    if (!id) continue;
    try {
      const countRes = await fetch(`/api/organizations/${id}/chat_conversations/count`);
      if (!countRes.ok) continue; // no access to this one
      const count = parseInt((await countRes.text()).replace(/[^0-9]/g, ''), 10);
      reachable.push({ id, name: String(org.name || 'Organization').trim(), count: Number.isFinite(count) ? count : 0 });
    } catch (e) {
      // unreachable, treated the same as no access
    }
  }
  return reachable;
}

/**
 * How many conversations this organization holds, for progress reporting
 * @returns {Promise<number|null>}
 */
async function fetchConversationCount(explicitOrgId) {
  try {
    const orgId = explicitOrgId || await getActiveOrganizationId();
    if (!orgId) return null;
    const res = await fetch(`/api/organizations/${orgId}/chat_conversations/count`);
    if (!res.ok) return null;
    const raw = (await res.text()).trim();
    const parsed = parseInt(raw.replace(/[^0-9]/g, ''), 10);
    return Number.isFinite(parsed) ? parsed : null;
  } catch (e) {
    return null;
  }
}

/**
 * Read conversations from the account through the same web endpoint the exporter
 * uses. The list comes back strictly newest-first by updated_at, so a sync can
 * stop once it has read past the point its history is known to be complete
 * instead of paging back to the first conversation every time.
 *
 * The cutoff must be a watermark, meaning the oldest stamp below which coverage is
 * contiguous, and never the newest stamp held. Anchoring on the newest item pins
 * the window to the last month forever, so a gap older than that is never
 * revisited. Stopping also takes several consecutive fully-known pages rather than
 * one, because a single known page can sit directly above unimported history.
 *
 * @param {Function} onProgress - called with (collectedCount, totalOrNull)
 * @param {Object} options
 * @param {string|null} options.stopBefore - watermark; null reads everything
 * @param {number} options.overlapDays - how far past the watermark to keep reading
 * @param {Function|null} options.isKnown - id predicate
 * @param {number} options.cleanPagesToStop - consecutive all-known pages required
 * @returns {Promise<{records, pages, total, stoppedEarly, oldestStamp, reachedEnd}>}
 */
async function listConversations(onProgress, options) {
  const opts = options || {};
  const org = opts.org || null;
  const orgId = (org && org.id) || await getActiveOrganizationId();
  if (!orgId) throw new Error('Could not get org ID');

  const overlapDays = Number.isFinite(opts.overlapDays) ? opts.overlapDays : 30;
  const stopStamp = opts.stopBefore ? new Date(opts.stopBefore).getTime() : NaN;
  const cutoff = Number.isFinite(stopStamp) ? stopStamp - overlapDays * 86400000 : null;
  const isKnown = typeof opts.isKnown === 'function' ? opts.isKnown : null;
  const cleanPagesToStop = Number.isFinite(opts.cleanPagesToStop) ? opts.cleanPagesToStop : 3;

  const total = await fetchConversationCount(orgId);
  const seen = new Set();
  const records = [];
  let pages = 0;
  let stoppedEarly = false;
  let reachedEnd = false;
  let cleanPages = 0;
  let oldestStamp = null;

  for (let page = 0; page < CONVERSATION_PAGE_LIMIT; page++) {
    const offset = page * CONVERSATION_PAGE_SIZE;
    const res = await fetch(`/api/organizations/${orgId}/chat_conversations?limit=${CONVERSATION_PAGE_SIZE}&offset=${offset}`);
    if (!res.ok) {
      if (records.length) break; // keep what paged in before the endpoint cut us off
      throw new Error(`Conversation list returned ${res.status}`);
    }
    const batch = await res.json();
    if (!Array.isArray(batch)) throw new Error('Conversation list was not an array');
    pages++;

    const before = seen.size;
    let sawUnknown = false;
    let oldestOnPage = Infinity;
    for (const convo of batch) {
      if (!convo || !convo.uuid) continue;
      const stamp = new Date(convo.updated_at || convo.created_at || 0).getTime();
      if (Number.isFinite(stamp)) oldestOnPage = Math.min(oldestOnPage, stamp);
      if (isKnown && !isKnown(convo.uuid)) sawUnknown = true;
      if (seen.has(convo.uuid)) continue;
      seen.add(convo.uuid);
      records.push(toChatRecord(convo, org));
    }
    if (onProgress) onProgress(records.length, total);

    if (Number.isFinite(oldestOnPage)) {
      oldestStamp = oldestStamp === null ? oldestOnPage : Math.min(oldestStamp, oldestOnPage);
    }

    if (batch.length < CONVERSATION_PAGE_SIZE) { reachedEnd = true; break; }
    if (seen.size === before) { reachedEnd = true; break; } // an endpoint ignoring offset repeats itself

    // A page with nothing unknown on it counts toward the run of clean pages, and
    // one unknown conversation resets the run so paging carries on past the gap
    cleanPages = sawUnknown ? 0 : cleanPages + 1;

    if (cutoff !== null && oldestOnPage < cutoff && cleanPages >= cleanPagesToStop) {
      stoppedEarly = true;
      break;
    }
    await new Promise(r => setTimeout(r, 120));
  }

  if (pages >= CONVERSATION_PAGE_LIMIT) {
    console.log('[EXPORT] Conversation paging stopped at the', records.length, 'record ceiling');
  }
  return {
    records,
    pages,
    total,
    stoppedEarly,
    reachedEnd,
    oldestStamp: oldestStamp === null ? null : new Date(oldestStamp).toISOString()
  };
}

/**
 * Read conversations from every organization this login can reach, so the run does
 * not depend on which organization happens to be active. Each record is tagged with
 * the organization it came from, and each organization keeps its own watermark.
 *
 * @param {Function} onProgress - called with (collectedCount, totalOrNull)
 * @param {Object} options - as listConversations, plus watermarkFor(orgId)
 * @returns {Promise<{records: Array, orgs: Array}>}
 */
async function listConversationsAllOrgs(onProgress, options) {
  const opts = options || {};
  const orgs = await listAccessibleOrganizations();
  if (!orgs.length) throw new Error('No readable organizations on this login');

  const grandTotal = orgs.reduce((sum, o) => sum + (o.count || 0), 0);
  const records = [];
  const summaries = [];

  for (const org of orgs) {
    const watermark = typeof opts.watermarkFor === 'function' ? await opts.watermarkFor(org.id) : null;
    try {
      const result = await listConversations(
        (countSoFar) => { if (onProgress) onProgress(records.length + countSoFar, grandTotal); },
        { ...opts, org, stopBefore: watermark }
      );
      records.push(...result.records);
      summaries.push({
        id: org.id, name: org.name, accountTotal: org.count,
        collected: result.records.length, pages: result.pages,
        stoppedEarly: result.stoppedEarly, reachedEnd: result.reachedEnd,
        oldestStamp: result.oldestStamp, watermark
      });
    } catch (e) {
      summaries.push({ id: org.id, name: org.name, accountTotal: org.count, collected: 0, error: e.message });
    }
  }

  return { records, orgs: summaries, accountTotal: grandTotal };
}

/**
 * Read every conversation this login can reach, ignoring any incremental cutoff.
 * @returns {Promise<Array>} chat records
 */
async function listAllConversations(onProgress) {
  const result = await listConversationsAllOrgs(onProgress, {});
  return result.records;
}

/**
 * Fetch conversation data
 */
// Conversations resolved for chats whose stored record predates organization
// tagging, so the sweep below runs once per chat rather than once per attempt
const orgIdByChat = new Map();

// Query shapes tried in order. The richest one carries tool rendering, which some
// conversations refuse with a 403 while plainer requests for the same conversation
// are answered, so a refusal falls back to asking for less rather than giving up.
const CONVERSATION_QUERIES = [
  'tree=True&rendering_mode=messages&render_all_tools=true',
  'tree=True&rendering_mode=messages',
  'tree=True'
];

function conversationUrl(orgId, chatId, queryIndex) {
  const query = CONVERSATION_QUERIES[queryIndex || 0];
  return `/api/organizations/${orgId}/chat_conversations/${chatId}?${query}`;
}

/**
 * Fetch one conversation. A chat is only visible under the organization that owns
 * it, so asking the active organization for another organization's chat answers
 * 404. The owning organization is used when the record carries it, and otherwise
 * the readable organizations are tried once and the answer remembered.
 */
async function fetchConversationData(chatId, ownerOrgId) {
  const known = ownerOrgId || orgIdByChat.get(chatId);
  const firstChoice = known || await getActiveOrganizationId();
  if (!firstChoice) throw new Error('Could not get org ID');

  let res = await fetch(conversationUrl(firstChoice, chatId, 0));

  // 404 and 403 both mean this conversation is not available as asked. A stored
  // organization id from another login is refused rather than reported missing, so
  // the readable organizations are tried; then, still refused, the request itself is
  // simplified, since some conversations answer a plainer query than a richer one.
  const wrongPlace = (status) => status === 404 || status === 403;

  if (wrongPlace(res.status)) {
    const orgsTried = [firstChoice];
    for (const org of await listAccessibleOrganizations()) {
      if (orgsTried.includes(org.id)) continue;
      orgsTried.push(org.id);
      const attempt = await fetch(conversationUrl(org.id, chatId, 0));
      if (attempt.ok) {
        orgIdByChat.set(chatId, org.id);
        res = attempt;
        break;
      }
    }

    if (!res.ok && res.status === 403) {
      for (let q = 1; q < CONVERSATION_QUERIES.length; q++) {
        const attempt = await fetch(conversationUrl(known || firstChoice, chatId, q));
        if (attempt.ok) {
          console.log('[EXPORT]', chatId, 'answered a plainer request:', CONVERSATION_QUERIES[q]);
          res = attempt;
          break;
        }
      }
    }

    if (!res.ok) {
      const where = `org ${String(known || firstChoice).slice(-6)}, ${orgsTried.length} tried`;
      throw new Error(res.status === 403
        ? `not permitted (${where})`
        : `not found in any of the ${orgsTried.length} readable organizations`);
    }
  }

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
    const title = (typeof cfCurrentChatTitle === 'function')
      ? cfCurrentChatTitle()
      : (document.querySelector('[data-testid="chat-title-split"]') || document.querySelector('h1'))?.textContent?.trim() || 'Untitled';
    
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
async function exportChatById(chatId, title, ownerOrgId) {
  try {
    const convoData = await fetchConversationData(chatId, ownerOrgId);
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
    
    const result = await exportChatById(chat.id, chat.title, chat.orgId);
    
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
    fetchConversationCount,
    listAccessibleOrganizations,
    listConversations,
    listConversationsAllOrgs,
    listAllConversations,
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
