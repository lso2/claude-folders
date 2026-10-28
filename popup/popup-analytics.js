// popup/popup-analytics.js
// Draws the popup's category chart, legend and totals.
// Globals: CHART_COLORS, toggleAnalytics, showAnalytics, hideAnalytics, getCategoryData,
//          renderDonutChart, renderAnalyticsLegend, renderAnalyticsStats
// Depends on: popup/popup.js (folders)
// Notes: docs/notes/popup/popup-analytics.js.md

// Chart colors - distinct hues with good contrast
const CHART_COLORS = [
  '#d97706', // orange (Claude primary)
  '#3d8b8b', // dark teal
  '#9b6b4a', // brown
  '#6478b8', // blue
  '#a85a9a', // purple
  '#6a9a5a', // green
  '#c87058', // coral
  '#5088a8', // steel blue
];

function toggleAnalytics() {
  const analyticsView = document.getElementById('analyticsView');
  if (analyticsView.classList.contains('hidden')) {
    showAnalytics();
  } else {
    hideAnalytics();
  }
}

function showAnalytics() {
  document.getElementById('folderList').classList.add('hidden');
  document.querySelector('.search-box')?.classList.add('hidden');
  document.querySelector('.filters-bar')?.classList.add('hidden');
  document.getElementById('setupInstructions')?.classList.add('hidden');
  document.getElementById('analyticsView').classList.remove('hidden');
  
  renderDonutChart();
  renderAnalyticsLegend();
  renderAnalyticsStats();
}

function hideAnalytics() {
  document.getElementById('analyticsView').classList.add('hidden');
  document.getElementById('folderList').classList.remove('hidden');
  document.querySelector('.search-box')?.classList.remove('hidden');
  document.querySelector('.filters-bar')?.classList.remove('hidden');
  // setupInstructions visibility is handled by renderFolders
  renderFolders();
}

function getCategoryData() {
  const byCategory = {};
  let total = 0;
  
  folders.forEach(f => {
    const cat = f.category || 'Uncategorized';
    const count = f.chats?.length || 0;
    byCategory[cat] = (byCategory[cat] || 0) + count;
    total += count;
  });
  
  return Object.entries(byCategory)
    .map(([name, count]) => ({ name, count, percent: total > 0 ? (count / total * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.count - a.count);
}

function renderDonutChart() {
  const canvas = document.getElementById('donutChart');
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  const data = getCategoryData();
  const total = data.reduce((sum, d) => sum + d.count, 0);
  
  if (total === 0) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#9c9a92';
    ctx.font = '14px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', canvas.width / 2, canvas.height / 2);
    return;
  }
  
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const outerRadius = 90;
  const innerRadius = 55;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  let startAngle = -Math.PI / 2;
  
  data.forEach((item, i) => {
    const sliceAngle = (item.count / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = CHART_COLORS[i % CHART_COLORS.length];
    ctx.fill();
    
    startAngle = endAngle;
  });
  
  // Center text
  ctx.fillStyle = '#e8e6e3';
  ctx.font = 'bold 24px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total.toLocaleString(), centerX, centerY - 8);
  ctx.font = '11px sans-serif';
  ctx.fillStyle = '#9c9a92';
  ctx.fillText('chats', centerX, centerY + 12);
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
  const totalChats = data.reduce((sum, d) => sum + d.count, 0);
  const totalFolders = folders.length;
  const totalCategories = data.length;
  
  let html = `
    <div class="stat-row">
      <span class="stat-label">Total Chats</span>
      <span class="stat-value">${totalChats.toLocaleString()}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Categories</span>
      <span class="stat-value">${totalCategories}</span>
    </div>
    <div class="stat-row">
      <span class="stat-label">Folders</span>
      <span class="stat-value">${totalFolders}</span>
    </div>
  `;
  
  // Top 3 categories
  html += `<div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-color);">
    <div style="font-size: 11px; color: var(--text-secondary); margin-bottom: 8px;">Top Categories</div>`;
  
  data.slice(0, 3).forEach((item, i) => {
    html += `
      <div class="stat-row">
        <span class="stat-label">${i + 1}. ${item.name}</span>
        <span class="stat-value">${item.count} (${item.percent}%)</span>
      </div>
    `;
  });
  
  html += `</div>`;
  container.innerHTML = html;
}
