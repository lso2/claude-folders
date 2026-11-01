// lib/run-failures.js
// Draws a run's result lines, with each failure reason opening a list of the chats it stopped, as links.
// Loaded by the content scripts (the sync's result window), the popup and the organizer (their run panes).
// Globals: cfFailureGroups, cfFailureLink, cfRenderRunLines
// Notes: docs/notes/lib/run-failures.js.md

// failures: [{ id, title, url, reason }] from content/cf-export-run.js. Returns reason -> failures, in order of first appearance.
function cfFailureGroups(failures) {
  const groups = new Map();
  (failures || []).forEach(f => {
    if (!f || !f.reason) return;
    if (!groups.has(f.reason)) groups.set(f.reason, []);
    groups.get(f.reason).push(f);
  });
  return groups;
}

// A link to the chat on claude.ai. An address outside claude.ai is shown as text.
function cfFailureLink(failure) {
  const li = document.createElement('li');
  const url = String(failure.url || '');
  const label = failure.title || failure.id || 'Untitled';
  if (url.startsWith('https://claude.ai/')) {
    const a = document.createElement('a');
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = label;
    a.title = url;
    li.appendChild(a);
  } else {
    li.textContent = label;
  }
  return li;
}

// A line "N x reason" with failures for that reason becomes a <details> whose list holds the chats.
// Reasons with failures and no line of their own are added after the lines.
function cfRenderRunLines(listEl, lines, failures) {
  listEl.innerHTML = '';
  const groups = cfFailureGroups(failures);
  const used = new Set();
  const addGroup = (label, items) => {
    const li = document.createElement('li');
    const details = document.createElement('details');
    details.className = 'cf-run-failures';
    const summary = document.createElement('summary');
    summary.textContent = label;
    summary.title = 'Click to list these chats';
    const ul = document.createElement('ul');
    items.forEach(item => ul.appendChild(cfFailureLink(item)));
    details.append(summary, ul);
    li.appendChild(details);
    listEl.appendChild(li);
  };
  (lines || []).forEach(line => {
    const match = /^(\d+) x (.+)$/.exec(String(line));
    if (match && groups.has(match[2]) && !used.has(match[2])) {
      used.add(match[2]);
      addGroup(line, groups.get(match[2]));
      return;
    }
    const li = document.createElement('li');
    li.textContent = line;
    listEl.appendChild(li);
  });
  groups.forEach((items, reason) => {
    if (!used.has(reason)) addGroup(`${items.length} x ${reason}`, items);
  });
}
