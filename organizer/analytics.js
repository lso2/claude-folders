// organizer/analytics.js
// Draws the organizer's category chart, legend, totals and per-category breakdown.
// Globals: CHART_COLORS, showAnalyticsView, hideAnalyticsView, getCategoryData, renderAnalytics,
//          renderDonutChart, renderAnalyticsLegend, renderAnalyticsStats, renderAnalyticsBreakdown
// Depends on: organizer/app.js (folders)
// Notes: docs/notes/organizer/analytics.js.md

const CHART_COLORS = ['#d97706', '#0891b2', '#7c3aed', '#059669', '#dc2626', '#2563eb', '#c026d3', '#ea580c'];

function showAnalyticsView() {
  document.getElementById('folderListView')?.classList.add('hidden');
  document.getElementById('folderDetailView')?.classList.add('hidden');
  document.getElementById('analyticsView')?.classList.remove('hidden');
  renderAnalytics();
}

function hideAnalyticsView() {
  document.getElementById('analyticsView')?.classList.add('hidden');
  document.getElementById('folderListView')?.classList.remove('hidden');
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
  const canvas = document.getElementById('analyticsDonutChart');
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
  ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--bg-secondary') || '#30302e';
  ctx.fill();
  
  // Center label
  const centerLabel = document.getElementById('analyticsChartCenter');
  if (centerLabel) {
    centerLabel.innerHTML = `<span class="total-count">${total}</span><span class="total-label">Total Chats</span>`;
  }
}

function renderAnalyticsLegend() {
  const container = document.getElementById('analyticsLegend');
  if (!container) return;
  
  const data = getCategoryData();
  container.innerHTML = data.map((item, i) => `
    <div class="legend-item">
      <div class="legend-color" style="background: ${CHART_COLORS[i % CHART_COLORS.length]}"></div>
      <span>${item.name} (${item.percent}%)</span>
    </div>
  `).join('');
}

function renderAnalyticsStats() {
  const container = document.getElementById('analyticsStats');
  if (!container) return;
  
  const data = getCategoryData();
  const totalChats = data.reduce((sum, d) => sum + d.chats, 0);
  const totalFolders = folders.length;
  const totalCategories = data.length;
  const avgChatsPerFolder = totalFolders > 0 ? Math.round(totalChats / totalFolders) : 0;
  
  container.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${totalChats.toLocaleString()}</div>
      <div class="stat-label">Total Chats</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${totalFolders}</div>
      <div class="stat-label">Total Folders</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${totalCategories}</div>
      <div class="stat-label">Categories</div>
    </div>
    <div class="stat-card">
      <div class="stat-value">${avgChatsPerFolder}</div>
      <div class="stat-label">Avg Chats/Folder</div>
    </div>
  `;
}

function renderAnalyticsBreakdown() {
  const container = document.getElementById('analyticsFolderBreakdown');
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
