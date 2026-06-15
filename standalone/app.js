// Standalone viewer for Claude Folders - loads from data.js
let folders = [];
let allChats = [];
let categories = [];
let metadata = {};

// Escape user content before it goes into innerHTML
function esc(value) {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Only allow safe links into href attributes
function safeUrl(url) {
  const s = String(url || '');
  return (/^https?:\/\//i.test(s) || s.startsWith('/')) ? esc(s) : '#';
}
let currentCategory = 'all';
let currentFolder = null;
let currentView = 'list';
let currentSort = 'activity';
let searchTerm = '';
let chatSearchTerm = '';
let currentTab = 'chats';

async function loadAllData() {
  try {
    // Load from global variable set by data.js
    if (typeof claudeFoldersData === 'undefined') {
      throw new Error('data.js not found or claudeFoldersData not defined');
    }
    const data = claudeFoldersData;
    
    folders = data.folders || [];
    categories = data.categories || [];
    metadata = data.metadata || {};
    
    // Add lastActivity to each folder
    folders = folders.map(f => ({
      ...f,
      lastActivity: f.chats?.length > 0 
        ? Math.max(...f.chats.map(c => new Date(c.date).getTime()))
        : 0
    }));
    
    // Collect all chats
    folders.forEach(folder => {
      if (folder.chats) {
        allChats.push(...folder.chats.map(chat => ({
          ...chat,
          folderName: folder.name,
          category: folder.category
        })));
      }
    });
    
    // Sort chats by date
    allChats.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    renderUserProfile();
    renderCategoryFilters();
    renderFolderList();
    renderRecentChats();
    
  } catch (error) {
    console.log('Error loading data:', error.message);
    document.getElementById('folderGrid').innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: var(--body-text);">
        <p style="margin-bottom:8px;">No data yet.</p>
        <p style="font-size:12px;">Use the Claude Folders extension to import and organize your chats first.</p>
      </div>
    `;
  }
}

function renderUserProfile() {
  document.getElementById('userAvatar').textContent = metadata.userInitial || 'U';
  document.getElementById('userName').textContent = metadata.userName || 'User';
  document.getElementById('userTeam').textContent = metadata.userTeam || '';
}

function renderCategoryFilters() {
  const filterPills = document.getElementById('filterPills');
  
  let html = '<button class="filter-pill active" data-filter="all">All Folders</button>';
  
  // Get unique categories from folders
  const uniqueCats = [...new Set(folders.map(f => f.category).filter(Boolean))];
  uniqueCats.forEach(cat => {
    html += `<button class="filter-pill" data-filter="${esc(cat)}">${esc(cat)}</button>`;
  });
  
  filterPills.innerHTML = html;
  
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentCategory = btn.dataset.filter;
      renderFolderList();
    });
  });
}

function sortFolders(foldersToSort) {
  const sorted = [...foldersToSort];
  switch(currentSort) {
    case 'activity':
      sorted.sort((a, b) => b.lastActivity - a.lastActivity);
      break;
    case 'name':
      sorted.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case 'created':
      sorted.sort((a, b) => {
        const aFirst = a.chats?.length > 0 ? Math.min(...a.chats.map(c => new Date(c.date).getTime())) : 0;
        const bFirst = b.chats?.length > 0 ? Math.min(...b.chats.map(c => new Date(c.date).getTime())) : 0;
        return bFirst - aFirst;
      });
      break;
  }
  return sorted;
}

function filterFolders() {
  let filtered = folders;
  
  if (currentCategory !== 'all') {
    filtered = filtered.filter(f => f.category === currentCategory);
  }
  
  if (searchTerm) {
    const term = searchTerm.toLowerCase();
    filtered = filtered.filter(f => 
      f.name.toLowerCase().includes(term) ||
      f.chats?.some(c => c.title.toLowerCase().includes(term))
    );
  }
  
  return sortFolders(filtered);
}

function renderFolderList() {
  const folderGrid = document.getElementById('folderGrid');
  const filtered = filterFolders();
  
  if (filtered.length === 0) {
    folderGrid.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 60px 20px; color: var(--body-text);">
        <h3 style="font-size: 18px; margin-bottom: 8px; color: var(--title-color);">No folders found</h3>
        <p>Try adjusting your filters or search</p>
      </div>
    `;
    return;
  }
  
  folderGrid.innerHTML = filtered.map(folder => `
    <div class="folder-card" data-folder-id="${esc(folder.id)}">
      <div class="folder-category">${esc(folder.category || 'Uncategorized')}</div>
      <div class="folder-name">${esc(folder.name)}</div>
      <div class="folder-count">${folder.chats?.length || 0} chat${(folder.chats?.length || 0) !== 1 ? 's' : ''}</div>
    </div>
  `).join('');
  
  document.querySelectorAll('.folder-card').forEach(card => {
    card.addEventListener('click', () => openFolder(card.dataset.folderId));
  });
}

function openFolder(folderId) {
  currentFolder = folders.find(f => f.id === folderId);
  if (!currentFolder) return;

  document.getElementById('folderListView').classList.add('hidden');
  document.getElementById('folderDetailView').classList.remove('hidden');

  // Populate the detail header elements that actually exist in index.html
  const titleEl = document.getElementById('folderDetailTitle');
  if (titleEl) titleEl.textContent = currentFolder.name || 'Untitled';
  const catEl = document.getElementById('folderCategory');
  if (catEl) catEl.textContent = currentFolder.category || 'Uncategorized';

  // Reset the in-folder search box (its handler is bound once on load)
  const searchEl = document.getElementById('chatSearchInput');
  if (searchEl) searchEl.value = '';

  chatSearchTerm = '';
  currentTab = 'chats';
  renderChatList();
}

function renderChatList() {
  const container = document.getElementById('chatListContainer');
  let chats = [...(currentFolder.chats || [])].sort((a, b) => new Date(b.date) - new Date(a.date));
  
  // Filter by search term
  if (chatSearchTerm) {
    const term = chatSearchTerm.toLowerCase();
    chats = chats.filter(c => c.title.toLowerCase().includes(term));
  }
  
  container.className = `chat-list-container ${currentView}-view`;
  
  if (chats.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 60px 20px; color: var(--body-text);">
        <h3>${chatSearchTerm ? 'No matching chats' : 'No chats in this folder'}</h3>
      </div>
    `;
    return;
  }
  
  const embedded = (typeof claudeFoldersData !== 'undefined') && claudeFoldersData.content;
  container.innerHTML = chats.map(chat => {
    // Offline content is available if the chat was exported or its markdown is
    // embedded in data.js (the latter works even when opened straight from disk)
    const hasExport = !!(chat.exported || (embedded && embedded[chat.id]));
    return `
    <div class="chat-item" data-chat-id="${esc(chat.id)}" data-url="${safeUrl(chat.url)}">
      <div class="chat-item-buttons">
        <button class="view-offline-btn ${hasExport ? '' : 'no-export'}" data-chat-id="${esc(chat.id)}" data-title="${esc(chat.title)}" title="${hasExport ? 'View exported markdown' : 'No offline version available'}">
          ${hasExport ? 'VIEW OFFLINE' : 'NO EXPORT'}
        </button>
        <button class="view-chat-btn" data-url="${safeUrl(chat.url)}" title="Open chat on Claude">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
            <polyline points="15 3 21 3 21 9"/>
            <line x1="10" y1="14" x2="21" y2="3"/>
          </svg>
          VIEW CHAT
        </button>
      </div>
      <div class="chat-item-content">
        <div class="chat-item-title">${esc(chat.title)}</div>
        ${chat.snippet ? `<div class="chat-item-snippet">${esc(chat.snippet)}</div>` : ''}
        ${chat.tags && chat.tags.length ? `
          <div class="chat-item-tags">
            ${chat.tags.slice(0, 3).map(tag => `<span class="chat-tag">#${esc(tag)}</span>`).join('')}
          </div>
        ` : ''}
      </div>
      <div class="chat-item-actions">
        <div class="chat-item-date">${esc(chat.relativeDate || formatRelativeDate(chat.date))}</div>
      </div>
    </div>
  `}).join('');
  
  // VIEW OFFLINE button handlers
  container.querySelectorAll('.view-offline-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const chatId = btn.dataset.chatId;
      const chatTitle = btn.dataset.title;
      const hasExport = !btn.classList.contains('no-export');
      
      if (hasExport) {
        openMarkdownViewer(chatId, chatTitle);
      } else {
        alert('No offline export available for this chat.\n\nUse the extension to export chats to markdown files.');
      }
    });
  });
  
  // VIEW CHAT button handlers
  container.querySelectorAll('.view-chat-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const url = btn.dataset.url;
      if (url) window.open(url, '_blank');
    });
  });
}

// Sanitize filename - must match chat-exporter.js format
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
  const prefix = (chatId || 'unknown').substring(0, 8);
  const safeName = sanitizeFilename(title || 'Untitled');
  return `${prefix}_${safeName}.md`;
}

// Open the chat markdown in a viewer. Prefers content embedded in data.js so it
// works when index.html is opened directly from disk (file://), where fetching
// the chats/*.md files is blocked by the browser. Falls back to fetch when the
// library is served over http.
async function openMarkdownViewer(chatId, chatTitle) {
  let content = null;

  const embedded = (typeof claudeFoldersData !== 'undefined') && claudeFoldersData.content;
  if (embedded && embedded[chatId]) {
    content = embedded[chatId];
  } else {
    try {
      const filename = generateExportFilename(chatId, chatTitle);
      const response = await fetch(`chats/${filename}`);
      if (response.ok) content = await response.text();
    } catch (e) {
      console.log('Fetch fallback failed:', e.message);
    }
  }

  if (!content) {
    alert('No offline copy of this chat yet.\n\nOpen the extension and run a sync / Build Library to export it.');
    return;
  }

  const viewerWindow = window.open('', '_blank');
  viewerWindow.document.write(renderMarkdownAsHtml(chatTitle, content));
  viewerWindow.document.close();
}

// Render markdown content as styled HTML
function renderMarkdownAsHtml(title, markdown) {
  const safeTitle = esc(title);
  // Escape first so raw HTML inside the chat can't execute, then format markdown
  let html = esc(markdown)
    .replace(/^### (.*$)/gim, '<h3>$1</h3>')
    .replace(/^## (.*$)/gim, '<h2>$1</h2>')
    .replace(/^# (.*$)/gim, '<h1>$1</h1>')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${safeTitle} - Offline View</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 800px;
      margin: 0 auto;
      padding: 40px 20px;
      background: #1a1a18;
      color: #e8e6e3;
      line-height: 1.6;
    }
    h1, h2, h3 { color: #fff; margin-top: 24px; }
    h1 { font-size: 28px; border-bottom: 1px solid #3d3d3a; padding-bottom: 12px; }
    h2 { font-size: 22px; }
    h3 { font-size: 18px; }
    pre {
      background: #2a2a28;
      padding: 16px;
      border-radius: 8px;
      overflow-x: auto;
    }
    code {
      background: #2a2a28;
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'Monaco', 'Menlo', monospace;
      font-size: 14px;
    }
    pre code {
      background: none;
      padding: 0;
    }
    p { margin: 16px 0; }
    strong { color: #d97706; }
    .header-bar {
      background: linear-gradient(135deg, #d97706, #b45309);
      color: white;
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .header-bar a { color: white; }
  </style>
</head>
<body>
  <div class="header-bar">
    <span>📄 Offline View</span>
    <span>${safeTitle}</span>
  </div>
  <div class="content">
    <p>${html}</p>
  </div>
</body>
</html>`;
}

function renderRecentChats() {
  const recentList = document.getElementById('recentChats');
  const recent = allChats.slice(0, 50);
  
  recentList.innerHTML = recent.map(chat => `
    <a href="${safeUrl(chat.url)}" target="_blank" class="recent-item" title="${esc(chat.title)}">
      ${esc(chat.title)}
    </a>
  `).join('');
}

function formatRelativeDate(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? 's' : ''} ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} month${Math.floor(diffDays / 30) > 1 ? 's' : ''} ago`;
  return date.toLocaleDateString();
}

// ========== ANALYTICS VIEW ==========
const CHART_COLORS = ['#d97706', '#0891b2', '#7c3aed', '#059669', '#dc2626', '#2563eb', '#c026d3', '#ea580c'];

function showFoldersView() {
  document.getElementById('folderListView').classList.remove('hidden');
  document.getElementById('folderDetailView').classList.add('hidden');
  document.getElementById('analyticsView').classList.add('hidden');
  document.getElementById('foldersLink').classList.add('active');
  document.getElementById('analyticsLink').classList.remove('active');
}

function showAnalyticsView() {
  document.getElementById('folderListView').classList.add('hidden');
  document.getElementById('folderDetailView').classList.add('hidden');
  document.getElementById('analyticsView').classList.remove('hidden');
  document.getElementById('foldersLink').classList.remove('active');
  document.getElementById('analyticsLink').classList.add('active');
  renderAnalytics();
}

function getCategoryData() {
  const catCounts = {};
  folders.forEach(f => {
    const cat = f.category || 'Uncategorized';
    if (!catCounts[cat]) catCounts[cat] = { folders: 0, chats: 0 };
    catCounts[cat].folders++;
    catCounts[cat].chats += (f.chats?.length || 0);
  });
  
  const totalChats = Object.values(catCounts).reduce((sum, c) => sum + c.chats, 0);
  
  return Object.entries(catCounts).map(([name, data]) => ({
    name,
    folders: data.folders,
    chats: data.chats,
    percent: totalChats > 0 ? Math.round(data.chats / totalChats * 100) : 0
  })).sort((a, b) => b.chats - a.chats);
}

function renderAnalytics() {
  renderDonutChart();
  renderAnalyticsLegend();
  renderAnalyticsStats();
  renderAnalyticsBreakdown();
}

function renderDonutChart() {
  const canvas = document.getElementById('mainDonutChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const data = getCategoryData();
  const total = data.reduce((sum, d) => sum + d.chats, 0);
  
  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const radius = Math.min(centerX, centerY) - 20;
  const innerRadius = radius * 0.6;
  
  let startAngle = -Math.PI / 2;
  
  data.forEach((item, i) => {
    const sliceAngle = (item.chats / total) * 2 * Math.PI;
    
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle);
    ctx.closePath();
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fill();
    
    startAngle += sliceAngle;
  });
  
  // Draw center hole
  ctx.beginPath();
  ctx.arc(centerX, centerY, innerRadius, 0, 2 * Math.PI);
  ctx.fillStyle = '#30302e';
  ctx.fill();
  
  // Center text
  ctx.fillStyle = '#e8e6e3';
  ctx.font = 'bold 32px -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total, centerX, centerY - 8);
  ctx.fillStyle = '#9c9a92';
  ctx.font = '14px -apple-system, sans-serif';
  ctx.fillText('chats', centerX, centerY + 16);
}

function renderAnalyticsLegend() {
  const container = document.getElementById('mainAnalyticsLegend');
  if (!container) return;
  
  const data = getCategoryData();
  container.innerHTML = data.map((item, i) => `
    <div class="legend-item">
      <div class="legend-color" style="background:${CHART_COLORS[i % CHART_COLORS.length]}"></div>
      <span class="legend-label">${item.name}</span>
      <span class="legend-count">(${item.chats})</span>
    </div>
  `).join('');
}

function renderAnalyticsStats() {
  const container = document.getElementById('mainAnalyticsStats');
  if (!container) return;
  
  const data = getCategoryData();
  const totalChats = data.reduce((sum, d) => sum + d.chats, 0);
  const totalFolders = folders.length;
  const totalCategories = data.length;
  const avgChatsPerFolder = totalFolders > 0 ? Math.round(totalChats / totalFolders) : 0;
  
  container.innerHTML = `
    <div class="stat-card"><div class="stat-value">${totalFolders}</div><div class="stat-label">Folders</div></div>
    <div class="stat-card"><div class="stat-value">${totalCategories}</div><div class="stat-label">Categories</div></div>
    <div class="stat-card"><div class="stat-value">${totalChats}</div><div class="stat-label">Total Chats</div></div>
    <div class="stat-card"><div class="stat-value">${avgChatsPerFolder}</div><div class="stat-label">Avg/Folder</div></div>
  `;
}

function renderAnalyticsBreakdown() {
  const container = document.getElementById('mainAnalyticsBreakdown');
  if (!container) return;
  
  const data = getCategoryData();
  container.innerHTML = data.map((item, i) => `
    <div class="breakdown-row">
      <div class="breakdown-category">
        <div class="breakdown-color" style="background: ${CHART_COLORS[i % CHART_COLORS.length]}"></div>
        <span class="breakdown-name">${item.name}</span>
      </div>
      <div class="breakdown-stats">
        <div class="breakdown-stat">
          <div class="breakdown-stat-value">${item.folders}</div>
          <div class="breakdown-stat-label">Folders</div>
        </div>
        <div class="breakdown-stat">
          <div class="breakdown-stat-value">${item.chats}</div>
          <div class="breakdown-stat-label">Chats</div>
        </div>
        <div class="breakdown-stat">
          <div class="breakdown-stat-value">${item.percent}%</div>
          <div class="breakdown-stat-label">Share</div>
        </div>
      </div>
    </div>
  `).join('');
}

document.addEventListener('DOMContentLoaded', () => {
  loadAllData();
  
  document.getElementById('sortSelect').addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderFolderList();
  });
  
  document.getElementById('searchInput').addEventListener('input', (e) => {
    searchTerm = e.target.value;
    renderFolderList();
  });

  // In-folder chat search (bound once; openFolder just resets its value)
  document.getElementById('chatSearchInput')?.addEventListener('input', (e) => {
    chatSearchTerm = e.target.value;
    renderChatList();
  });
  
  document.getElementById('backBtn')?.addEventListener('click', () => {
    document.getElementById('folderDetailView').classList.add('hidden');
    document.getElementById('folderListView').classList.remove('hidden');
    currentFolder = null;
  });
  
  document.querySelectorAll('.view-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentView = btn.dataset.view;
      renderChatList();
    });
  });
  
  document.getElementById('foldersLink').addEventListener('click', (e) => {
    e.preventDefault();
    showFoldersView();
  });
  
  document.getElementById('analyticsLink').addEventListener('click', (e) => {
    e.preventDefault();
    showAnalyticsView();
  });
});
