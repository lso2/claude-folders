// popup/popup-import.js
// Runs the popup's Sync dialog: starts the automatic import or imports pasted chat data.
// Globals: showImportModal, importChats
// Depends on: popup/popup.js (state, saveData), popup/popup-folders.js (renderFolders)
// Notes: docs/notes/popup/popup-import.js.md

function showImportModal() {
  const modal = document.getElementById('importModal');
  modal.classList.remove('hidden');
  
  document.querySelectorAll('.mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const mode = btn.dataset.mode;
      document.querySelectorAll('.import-mode').forEach(m => m.classList.add('hidden'));
      document.querySelector(`.${mode}-mode`)?.classList.remove('hidden');
      const pasteSection = document.querySelector('.import-paste-section');
      if (pasteSection) {
        pasteSection.classList.toggle('hidden', mode === 'quick');
      }
    });
  });
  
  document.getElementById('autoScrapeBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('autoScrapeBtn');
    btn.disabled = true;
    btn.textContent = 'Opening recents...';
    try {
      const response = await chrome.runtime.sendMessage({ action: 'startAutoScrape' });
      if (!response.success) {
        alert('Error: ' + (response.error || 'Unknown error'));
        btn.disabled = false;
        btn.textContent = 'Auto-Import from Claude.ai';
        return;
      }
      btn.textContent = 'Scraping (wait for notification)...';
      
      // Poll for changes every 2 seconds for up to 60 seconds
      let attempts = 0;
      const maxAttempts = 30;
      const pollInterval = setInterval(async () => {
        attempts++;
        const result = await chrome.storage.local.get('cachedData');
        const chatCount = countChatsInData(result.cachedData);
        btn.textContent = `Found ${chatCount} chats...`;
        
        if (attempts >= maxAttempts) {
          clearInterval(pollInterval);
          // Final load and write
          await loadData();
          modal.classList.add('hidden');
          btn.disabled = false;
          btn.textContent = 'Auto-Import from Claude.ai';
        }
      }, 2000);
      
    } catch (error) {
      alert('Error: ' + error.message);
      btn.disabled = false;
      btn.textContent = 'Auto-Import from Claude.ai';
    }
  });
  
  document.querySelectorAll('.copy-prompt-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const promptBox = e.target.previousElementSibling;
      navigator.clipboard.writeText(promptBox.textContent);
      e.target.textContent = 'Copied!';
      setTimeout(() => e.target.textContent = 'Copy Prompt', 2000);
    });
  });
  
  document.getElementById('cancelImportBtn')?.addEventListener('click', () => modal.classList.add('hidden'));
  document.getElementById('confirmImportBtn')?.addEventListener('click', importChats);
}

async function importChats() {
  const textarea = document.getElementById('importTextarea');
  const statusDiv = document.getElementById('importStatus');
  const confirmBtn = document.getElementById('confirmImportBtn');
  
  try {
    const jsonText = textarea.value.trim();
    if (!jsonText) throw new Error('Please paste the JSON data');
    
    let data;
    try {
      data = JSON.parse(jsonText);
    } catch (e) {
      throw new Error('Invalid JSON format');
    }
    
    confirmBtn.disabled = true;
    confirmBtn.textContent = 'Importing...';
    
    if (data.categories && data.folders) {
      // AI organize mode - replace all data
      folders = data.folders;
      categories = data.categories;
      metadata = data.metadata || {};
    } else if (Array.isArray(data)) {
      // Simple chat array - add to unsorted
      let unsorted = folders.find(f => f.id === 'unsorted');
      if (!unsorted) {
        unsorted = { id: 'unsorted', category: 'Personal', name: 'Unsorted Chats', chats: [] };
        folders.push(unsorted);
      }
      const existingIds = new Set();
      folders.forEach(f => f.chats.forEach(c => existingIds.add(c.id)));
      const newChats = data.filter(c => !existingIds.has(c.id));
      unsorted.chats.push(...newChats);
    } else {
      throw new Error('Unrecognized JSON format');
    }
    
    await saveData();
    await loadData();
    
    statusDiv.className = 'import-status success';
    statusDiv.textContent = 'Import successful!';
    statusDiv.classList.remove('hidden');
    
    setTimeout(() => {
      document.getElementById('importModal').classList.add('hidden');
      textarea.value = '';
      statusDiv.classList.add('hidden');
      confirmBtn.disabled = false;
      confirmBtn.textContent = 'Import';
    }, 2000);
    
  } catch (error) {
    statusDiv.className = 'import-status error';
    statusDiv.textContent = error.message;
    statusDiv.classList.remove('hidden');
    confirmBtn.disabled = false;
    confirmBtn.textContent = 'Import';
  }
}
