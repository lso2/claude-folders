// lib/chat-exporter.js
// Reads conversations and conversation lists from Claude's web API for exports and syncs.
// Runs in the claude.ai content-script world, where requests carry the page's session.
// Globals: getActiveOrganizationId, listAccessibleOrganizations, fetchConversationCount,
//          listConversations, listConversationsAllOrgs, listAllConversations,
//          fetchConversationData, exportCurrentChat, exportChatById, window.chatExporter
// Depends on: lib/chat-markdown.js (convertToMarkdown, generateExportFilename, currentBranchMessages)
// Notes: docs/notes/lib/chat-exporter.js.md

// Fallback only: the cookie is re-read on every call to follow organization switches
let cachedActiveOrgId = null;

// The offscreen writer has no page cookies, so the resolved id is stored for it
function rememberOrgId(orgId) {
  cachedActiveOrgId = orgId;
  try {
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.set({ activeOrgId: orgId });
    }
  } catch (e) {}
  return orgId;
}

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

// Every organization on this login that answers its conversation count
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

// Conversation total for one organization, for progress reporting
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

// Pages the conversation list newest-first and stops at the coverage watermark.
// The paging rules are described in docs/notes/lib/chat-exporter.js.md.
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

// Reads every readable organization and tags each record with its owner
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

// Reads every conversation this login can reach, ignoring the watermark
async function listAllConversations(onProgress) {
  const result = await listConversationsAllOrgs(onProgress, {});
  return result.records;
}

// Owning organization per chat, learned once for records stored without one
const orgIdByChat = new Map();

// Query shapes tried in order; some conversations refuse only the richest one
const CONVERSATION_QUERIES = [
  'tree=True&rendering_mode=messages&render_all_tools=true',
  'tree=True&rendering_mode=messages',
  'tree=True'
];

function conversationUrl(orgId, chatId, queryIndex) {
  const query = CONVERSATION_QUERIES[queryIndex || 0];
  return `/api/organizations/${orgId}/chat_conversations/${chatId}?${query}`;
}

// Fetches one conversation from the organization that owns it, trying the other
// readable organizations and plainer queries when the first request is refused
async function fetchConversationData(chatId, ownerOrgId) {
  const known = ownerOrgId || orgIdByChat.get(chatId);
  const firstChoice = known || await getActiveOrganizationId();
  if (!firstChoice) throw new Error('Could not get org ID');

  let res = await fetch(conversationUrl(firstChoice, chatId, 0));

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
  
  data.chat_messages = currentBranchMessages(data);
  return data;
}

// Builds the markdown export for the chat open in this tab
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

// Builds the markdown export for any chat by id, used by the bulk runs
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
  generateExportFilename,
  sanitizeFilename
};
