// organizer/viewer.js
// Shows an exported chat's markdown as a readable page in a new tab.
// Globals: openMarkdownViewer, renderMarkdownAsHtml
// Depends on: organizer/app.js (esc), lib/export-files.js, lib/chat-markdown.js
// Notes: docs/notes/organizer/viewer.js.md

// Opens an exported chat from the data folder in a new tab
async function openMarkdownViewer(chatId, chatTitle) {
  const filename = generateExportFilename(chatId, chatTitle);
  const result = await readExportFileChecked(filename);
  if (!result.success) {
    alert(`${filename} could not be read: ${result.error}`);
    return;
  }
  const viewerWindow = window.open('', '_blank');
  viewerWindow.document.write(renderMarkdownAsHtml(chatTitle, result.content));
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
    <span>Offline View</span>
    <span>${safeTitle}</span>
  </div>
  <div class="content">
    <p>${html}</p>
  </div>
</body>
</html>`;
}
