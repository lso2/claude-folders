// lib/export-render.js
// Turns an exported chat's markdown into the HTML page shown by View Offline.
// Loaded by organizer/export-view.html, and copied beside the offline library's view.html by lib/data-file.js.
// Globals: renderMarkdownAsHtml
// Depends on: lib/html-escape.js (cfHtmlEscape)
// Notes: docs/notes/lib/export-render.js.md

// The export as a whole page: the top bar with the title, then the chat. The text is escaped before the markdown
// is turned into tags, and HTML written in the chat is shown as text.
function renderMarkdownAsHtml(title, markdown) {
  const safeTitle = cfHtmlEscape(title);
  let html = cfHtmlEscape(markdown)
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
    strong { color: var(--cf-amber); }
    .header-bar {
      background: var(--cf-export-bar);
      color: white;
      font-size: 14px;
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
    <span>Offline View</span>
    <span>${safeTitle}</span>
  </div>
  <div class="content">
    <p>${html}</p>
  </div>
</body>
</html>`;
}
