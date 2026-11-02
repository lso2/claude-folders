// lib/export-page.js
// Puts the page renderMarkdownAsHtml builds into the open view page, or the reason no chat is shown.
// Loaded by organizer/export-view.html, and copied beside the offline library's view.html by lib/data-file.js.
// Globals: cfShowExportPage, cfShowExportProblem
// Depends on: lib/export-render.js (renderMarkdownAsHtml), lib/html-escape.js (cfHtmlEscape)
// Notes: docs/notes/lib/export-page.js.md

// The rendered page's styles and body replace this page's own, and the address stays for a reload
function cfShowExportPage(title, markdown) {
  const doc = new DOMParser().parseFromString(renderMarkdownAsHtml(title, markdown), 'text/html');
  document.title = doc.title;
  document.head.querySelectorAll('style').forEach(el => el.remove());
  doc.head.querySelectorAll('style').forEach(el => document.head.appendChild(el));
  document.body.replaceChildren(...Array.from(doc.body.childNodes));
}

// text: the error as the reader or the address gave it. action: { label, run } for a button, or null.
function cfShowExportProblem(heading, text, action) {
  document.title = heading;
  document.body.innerHTML = `<main class="export-problem"><h1>${cfHtmlEscape(heading)}</h1><p>${cfHtmlEscape(text)}</p></main>`;
  if (action) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'export-problem-btn';
    btn.textContent = action.label;
    btn.addEventListener('click', action.run);
    document.querySelector('.export-problem').appendChild(btn);
  }
}
