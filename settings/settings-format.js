// settings/settings-format.js
// Formats sizes, times and table rows for the settings page.
// Globals: settingsBytes, settingsTime, settingsRow, settingsShowResult
// Notes: docs/notes/settings/settings-format.js.md

function settingsBytes(bytes) {
  if (!Number.isFinite(bytes)) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ms since 1970, or an ISO string. The browser's own date and time format.
function settingsTime(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString();
}

// cells: strings or { text, className, badge }. Built with textContent, which keeps file and
// account names as plain text.
function settingsRow(cells) {
  const tr = document.createElement('tr');
  cells.forEach(cell => {
    const td = document.createElement('td');
    const spec = typeof cell === 'object' && cell !== null ? cell : { text: cell };
    td.textContent = spec.text == null ? '' : String(spec.text);
    if (spec.className) td.className = spec.className;
    if (spec.badge) {
      const badge = document.createElement('span');
      badge.className = 'settings-badge';
      badge.textContent = spec.badge;
      td.appendChild(badge);
    }
    tr.appendChild(td);
  });
  return tr;
}

function settingsShowResult(el, text, isError) {
  el.hidden = !text;
  el.textContent = text || '';
  el.classList.toggle('error', !!isError);
}
