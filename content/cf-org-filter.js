// content/cf-org-filter.js
// Filters the folders panel by the organization each stored chat belongs to.
// Globals: CF_UNTAGGED_ORG, cfOrgsInData, cfChatPassesFilter, cfVisibleChats, cfShortOrgName,
//          cfRenderOrgFilter, cfLoadOrgFilter, cfSaveOrgFilter, cfOrgTag
// Depends on: content/cf-state.js, content/cf-account.js, content/cf-text.js
// Notes: docs/notes/content/cf-org-filter.js.md

// Accounts in the stored chats with a count each. Chats stored before accounts were
// recorded share one entry.
const CF_UNTAGGED_ORG = '__untagged__';

function cfOrgsInData() {
  const byId = new Map();
  folders.forEach(f => (f.chats || []).forEach(chat => {
    const id = chat.orgId || CF_UNTAGGED_ORG;
    const name = chat.orgName || 'Unlabelled';
    const entry = byId.get(id) || { id, name, count: 0 };
    entry.count++;
    byId.set(id, entry);
  }));
  return Array.from(byId.values()).sort((a, b) => b.count - a.count);
}

function cfChatPassesFilter(chat) {
  if (!cfOrgFilter.size) return true;
  return cfOrgFilter.has((chat && chat.orgId) || CF_UNTAGGED_ORG);
}

function cfVisibleChats(folder) {
  return (folder && folder.chats ? folder.chats : []).filter(cfChatPassesFilter);
}

function cfShortOrgName(name) {
  return String(name || 'Account').replace(/'s Organization$/i, '').trim();
}

// The filter row, shown only when the stored chats span more than one account
function cfRenderOrgFilter() {
  const orgs = cfOrgsInData();
  if (orgs.length < 2) return '';
  const chip = (id, label, count, on) =>
    `<button class="cf-org-chip${on ? ' cf-org-chip-on' : ''}" data-org-id="${cfEscapeHtml(id)}">${cfEscapeHtml(label)}<span class="cf-org-chip-count">${count}</span></button>`;
  const total = orgs.reduce((sum, o) => sum + o.count, 0);
  return `
    <div class="cf-org-filter">
      ${chip('', 'All accounts', total, cfOrgFilter.size === 0)}
      ${orgs.map(o => chip(o.id, cfShortOrgName(o.name), o.count, cfOrgFilter.has(o.id))).join('')}
    </div>
  `;
}

async function cfLoadOrgFilter() {
  try {
    const key = cfOrgFilterKey();
    const stored = await chrome.storage.local.get(key);
    cfOrgFilter = new Set(Array.isArray(stored[key]) ? stored[key] : []);
  } catch (e) {
    cfOrgFilter = new Set();
  }
}

async function cfSaveOrgFilter() {
  try {
    await chrome.storage.local.set({ [cfOrgFilterKey()]: Array.from(cfOrgFilter) });
  } catch (e) {
    console.log('[CONTENT] Could not store the account filter:', e.message);
  }
}

// A short label for chats from another organization on this login. Chats from the
// organization this tab is signed into carry none.
function cfOrgTag(chat) {
  if (!chat || !chat.orgId || !chat.orgName) return '';
  if (cfActiveOrgId && chat.orgId === cfActiveOrgId) return '';
  const short = String(chat.orgName).replace(/'s Organization$/i, '').trim().slice(0, 18);
  return `<span class="folder-chat-org" title="${cfEscapeHtml(chat.orgName)}">${cfEscapeHtml(short)}</span>`;
}
