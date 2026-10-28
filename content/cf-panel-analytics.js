// content/cf-panel-analytics.js
// Draws the category chart and totals in the folders panel's analytics view.
// Globals: PANEL_CHART_COLORS, renderPanelAnalytics
// Depends on: content/cf-state.js (folders)
// Notes: docs/notes/content/cf-panel-analytics.js.md

// Chart colors - distinct hues with good contrast
const PANEL_CHART_COLORS = [
  '#d97706', // orange (Claude primary)
  '#3d8b8b', // dark teal
  '#9b6b4a', // brown
  '#6478b8', // blue
  '#a85a9a', // purple
  '#6a9a5a', // green
  '#c87058', // coral
  '#5088a8', // steel blue
];

function renderPanelAnalytics(panel) {
  const canvas = panel.querySelector('#panelDonutChart');
  const legendEl = panel.querySelector('#panelAnalyticsLegend');
  const statsEl = panel.querySelector('#panelAnalyticsStats');
  
  if (!canvas) return;
  
  // Get category data
  const byCategory = {};
  let total = 0;
  // Counts follow the account filter, so the chart cannot disagree with the list
  folders.forEach(f => {
    const cat = f.category || 'Uncategorized';
    const count = cfVisibleChats(f).length;
    byCategory[cat] = (byCategory[cat] || 0) + count;
    total += count;
  });
  
  const data = Object.entries(byCategory)
    .map(([name, count]) => ({ name, count, percent: total > 0 ? (count / total * 100).toFixed(1) : 0 }))
    .sort((a, b) => b.count - a.count);
  
  // Draw donut
  const ctx = canvas.getContext('2d');
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const outerRadius = 80;
  const innerRadius = 50;
  
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (total === 0) {
    ctx.fillStyle = '#9c9a92';
    ctx.font = '13px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No data yet', centerX, centerY);
    return;
  }
  
  let startAngle = -Math.PI / 2;
  data.forEach((item, i) => {
    const sliceAngle = (item.count / total) * 2 * Math.PI;
    const endAngle = startAngle + sliceAngle;
    
    ctx.beginPath();
    ctx.arc(centerX, centerY, outerRadius, startAngle, endAngle);
    ctx.arc(centerX, centerY, innerRadius, endAngle, startAngle, true);
    ctx.closePath();
    ctx.fillStyle = PANEL_CHART_COLORS[i % PANEL_CHART_COLORS.length];
    ctx.fill();
    
    startAngle = endAngle;
  });
  
  // Center text
  ctx.fillStyle = '#e8e6e3';
  ctx.font = 'bold 20px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(total.toLocaleString(), centerX, centerY - 6);
  ctx.font = '10px sans-serif';
  ctx.fillStyle = '#9c9a92';
  ctx.fillText('chats', centerX, centerY + 10);
  
  // Legend
  legendEl.innerHTML = data.map((item, i) => `
    <div class="panel-legend-item">
      <div class="panel-legend-color" style="background: ${PANEL_CHART_COLORS[i % PANEL_CHART_COLORS.length]}"></div>
      <span>${item.name} (${item.percent}%)</span>
    </div>
  `).join('');
  
  // Stats
  let statsHtml = `
    <div class="panel-stat-row">
      <span class="panel-stat-label">Total Chats</span>
      <span class="panel-stat-value">${total.toLocaleString()}</span>
    </div>
    <div class="panel-stat-row">
      <span class="panel-stat-label">Categories</span>
      <span class="panel-stat-value">${data.length}</span>
    </div>
    <div class="panel-stat-row">
      <span class="panel-stat-label">Folders</span>
      <span class="panel-stat-value">${folders.length}</span>
    </div>
  `;
  statsEl.innerHTML = statsHtml;
}
