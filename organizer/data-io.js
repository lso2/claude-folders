// organizer/data-io.js
// Copies the folder data out as JSON, imports organized JSON back in, and clears it.
// Globals: exportData, showImportModal, clearData
// Depends on: organizer/app.js (state, saveData, render functions)
// Notes: docs/notes/organizer/data-io.js.md

function exportData() {
  const exportObj = {
    unsortedChats: allChats.map(c => ({
      id: c.id,
      title: c.title,
      url: c.url,
      date: c.date,
      relativeDate: c.relativeDate || '',
      snippet: c.snippet || ''
    })),
    existingFolders: folders.map(f => ({
      id: f.id,
      name: f.name,
      category: f.category,
      chatCount: f.chats ? f.chats.length : 0
    })),
    categories: categories,
    instructions: "Please organize these chats into folders by topic. Return JSON with same structure: {folders:[{id,name,category,chats:[{id,title,url,date,relativeDate}]}],categories:[...]}"
  };
  
  const json = JSON.stringify(exportObj, null, 2);
  
  navigator.clipboard.writeText(json).then(() => {
    alert('Data copied to clipboard! Paste it to Claude for organization.\n\nA backup file is also being downloaded.');
  }).catch(() => {
    alert('Downloading export file...');
  });
  
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `claude-folders-export-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function showImportModal() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay';
  modal.innerHTML = `
    <div class="modal-box" style="width:700px;max-width:95vw;">
      <h2 style="margin:0 0 16px 0;color:var(--title-color);">Import Organized Data</h2>
      <p style="color:var(--text-secondary);font-size:13px;margin-bottom:12px;">Paste the JSON that Claude organized for you:</p>
      <textarea id="importDataTextarea" placeholder='{"folders":[...],"categories":[...]}' style="width:100%;height:350px;padding:12px;border:1px solid var(--input-border);border-radius:6px;background:var(--input-bg);color:var(--title-color);font-family:monospace;font-size:12px;resize:vertical;box-sizing:border-box;"></textarea>
      <div style="margin-top:12px;padding:12px;background:var(--input-bg);border-radius:6px;font-size:12px;color:var(--text-secondary);">
        <strong>Options:</strong><br>
        <label style="display:flex;align-items:center;gap:8px;margin-top:8px;cursor:pointer;">
          <input type="radio" name="importMode" value="merge" checked> Merge with existing (add new folders/chats)
        </label>
        <label style="display:flex;align-items:center;gap:8px;margin-top:4px;cursor:pointer;">
          <input type="radio" name="importMode" value="replace"> Replace all (clear existing data first)
        </label>
      </div>
      <div style="display:flex;gap:10px;justify-content:flex-end;margin-top:16px;">
        <button class="modal-cancel-btn">Cancel</button>
        <button class="modal-create-btn">Import</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  
  modal.querySelector('.modal-cancel-btn').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
  
  modal.querySelector('.modal-create-btn').addEventListener('click', async () => {
    try {
      const text = modal.querySelector('#importDataTextarea').value.trim();
      const data = JSON.parse(text);
      const mode = modal.querySelector('input[name="importMode"]:checked').value;
      
      if (mode === 'replace') {
        folders = [];
        allChats = [];
        categories = ['Personal', 'Work', 'Projects'];
      }
      
      if (data.folders && Array.isArray(data.folders)) {
        for (const f of data.folders) {
          const existingFolder = folders.find(ef => ef.id === f.id || ef.name === f.name);
          if (existingFolder) {
            if (f.chats) {
              for (const c of f.chats) {
                if (!existingFolder.chats.some(ec => ec.id === c.id)) {
                  existingFolder.chats.push(c);
                }
              }
            }
          } else {
            folders.push({
              id: f.id || 'folder-' + Date.now() + '-' + Math.random().toString(36).substr(2,5),
              name: f.name,
              category: f.category || 'Personal',
              chats: f.chats || []
            });
          }
        }
      }
      
      if (data.categories && Array.isArray(data.categories)) {
        for (const cat of data.categories) {
          if (!categories.includes(cat)) {
            categories.push(cat);
          }
        }
      }
      
      allChats = [];
      folders.forEach(f => {
        if (f.chats) allChats.push(...f.chats);
      });
      
      folders = folders.map(f => ({
        ...f,
        lastActivity: f.chats && f.chats.length > 0 ? Math.max(...f.chats.map(c => new Date(c.date || 0).getTime())) : 0
      }));
      
      await saveData();
      renderCategoryFilters();
      renderFolderList();
      renderRecentChats();
      modal.remove();
      alert('Import successful! ' + folders.length + ' folders, ' + allChats.length + ' chats.');
    } catch (e) {
      alert('Invalid JSON: ' + e.message);
    }
  });
}

function clearData() {
  if (confirm('Clear ALL folders, categories, and chats? This cannot be undone.')) {
    if (confirm('Are you sure? All organized data will be lost.')) {
      folders = [];
      allChats = [];
      categories = [];
      metadata = {};
      saveData().then(() => {
        renderFolderList();
        renderRecentChats();
        alert('All data cleared.');
      });
    }
  }
}