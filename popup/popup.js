// Popup UI Logic - All data stored in data.json, cached in chrome.storage.local

let folders = [];
let categories = [];
let allChats = [];
let metadata = {};
let currentFilter = 'all';
let searchTerm = '';

document.addEventListener('DOMContentLoaded', init);

function init() {
  console.log('[POPUP] init');
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[POPUP] Message:', message.action);
    
    if (message.action === 'getData') {
      sendResponse({ 
        success: true, 
        folders: folders, 
        categories: categories, 
        allChats: allChats 
      });
      return true;
    }
    
    if (message.action === 'syncToDisk') {
      // Read fresh from storage - don't trust message data
      console.log('[POPUP] syncToDisk - reading from storage');
      chrome.storage.local.get('cachedData').then(async (result) => {
        const data = result.cachedData;
        console.log('[POPUP] Storage has:', data?.folders?.length, 'folders');
        
        if (data && data.folders) {
          folders = data.folders;
          categories = data.categories || ['Personal', 'Work', 'Projects'];
          metadata = data.metadata || {};
          allChats = [];
          folders.forEach(f => f.chats?.forEach(c => allChats.push(c)));
          
          console.log('[POPUP] Writing to file...');
          const success = await writeDataFile({ folders, categories, metadata });
          console.log('[POPUP] Write result:', success);
          
          renderFolders();
          updateStats();
        }
      });
      sendResponse({ success: true });
      return true;
    }
    
    if (message.action === 'reloadData') {
      loadData().then(() => sendResponse({ success: true }));
      return true;
    }
  });
  
  checkDataFolder().then(hasFolder => {
    if (hasFolder) {
      showMainScreen();
      loadData().then(() => {
        setupEventListeners();
        processPendingExports(); // Process any pending exports
      });
    } else {
      showSetupScreen();
    }
  });
}

async function checkDataFolder() {
  return await hasFolderHandle();
}

function showSetupScreen() {
  document.getElementById('setupScreen').classList.remove('hidden');
  document.getElementById('mainScreen').classList.add('hidden');
  
  document.getElementById('selectFolderBtn').addEventListener('click', async () => {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
      await saveFolderHandle(handle);
      
      // Copy organizer files to the data folder for standalone viewing
      await copyOrganizerFiles(handle);
      
      showMainScreen();
      await loadData();
      setupEventListeners();
    } catch (error) {
      if (error.name !== 'AbortError') {
        alert('Error: ' + error.message);
      }
    }
  });
}

async function copyOrganizerFiles(folderHandle) {
  // Copy standalone viewer files from extension
  const files = [
    { name: 'index.html', path: 'standalone/index.html' },
    { name: 'styles.css', path: 'standalone/styles.css' },
    { name: 'app.js', path: 'standalone/app.js' }
  ];
  
  for (const file of files) {
    try {
      const url = chrome.runtime.getURL(file.path);
      const response = await fetch(url);
      const content = await response.text();
      
      const fileHandle = await folderHandle.getFileHandle(file.name, { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(content);
      await writable.close();
      console.log('[POPUP] Copied', file.name);
    } catch (e) {
      console.log('[POPUP] Failed to copy', file.name, e.message);
    }
  }
}

function showMainScreen() {
  document.getElementById('setupScreen').classList.add('hidden');
  document.getElementById('mainScreen').classList.remove('hidden');
}

function countChatsInData(data) {
  if (!data || !data.folders) return 0;
  let count = 0;
  data.folders.forEach(f => { if (f.chats) count += f.chats.length; });
  return count;
}

async function loadData() {
  console.log('[POPUP] ===== loadData START =====');
  
  let fileData = null;
  let cacheData = null;
  
  try {
    fileData = await readDataFile();
    console.log('[POPUP] File:', fileData?.folders?.length || 0, 'folders');
  } catch (e) {
    console.log('[POPUP] File read failed:', e.message);
  }
  
  try {
    const result = await chrome.storage.local.get('cachedData');
    cacheData = result.cachedData;
    console.log('[POPUP] Cache:', cacheData?.folders?.length || 0, 'folders');
  } catch (e) {
    console.log('[POPUP] Cache read failed:', e.message);
  }
  
  const fileChats = countChatsInData(fileData);
  const cacheChats = countChatsInData(cacheData);
  const fileFolders = fileData?.folders?.length || 0;
  const cacheFolders = cacheData?.folders?.length || 0;
  console.log('[POPUP] File has', fileChats, 'chats in', fileFolders, 'folders, cache has', cacheChats, 'chats in', cacheFolders, 'folders');
  
  let data = null;
  // Use cache if it has more chats OR more folders (organized data)
  if (cacheChats > fileChats || cacheFolders > fileFolders) {
    console.log('[POPUP] Using cache (more data or more folders)');
    data = cacheData;
    // Sync cache to file
    if (cacheData) {
      writeDataFile(cacheData).catch(e => console.log('[POPUP] Sync failed:', e));
    }
  } else if (fileChats > 0) {
    data = fileData;
  } else if (cacheData) {
    data = cacheData;
  } else {
    data = fileData;
  }
  
  if (data) {
    folders = data.folders || [];
    categories = data.categories || ['Personal', 'Work', 'Projects'];
    metadata = data.metadata || {};
    
    // ALWAYS write to file when we have data from cache
    if (folders.length > 0 || countChatsInData(data) > 0) {
      console.log('[POPUP] Writing data to file...');
      const writeSuccess = await writeDataFile({ folders, categories, metadata });
      console.log('[POPUP] Write result:', writeSuccess);
    }
  } else {
    folders = [];
    categories = ['Personal', 'Work', 'Projects'];
    metadata = {};
  }
  
  allChats = [];
  folders.forEach(f => {
    if (f.chats) allChats.push(...f.chats);
  });
  
  console.log('[POPUP] folders:', folders.length);
  console.log('[POPUP] allChats:', allChats.length);
  
  await chrome.runtime.sendMessage({ 
    action: 'updateCache', 
    data: { folders, categories, metadata } 
  });
  
  console.log('[POPUP] ===== loadData END =====');
  
  renderCategoryFilters();
  renderFolders();
  updateStats();
}

async function saveData() {
  console.log('[POPUP] saveData');
  const data = { folders, categories, metadata };
  const success = await writeDataFile(data);
  if (success) {
    // Update cache
    await chrome.runtime.sendMessage({ action: 'updateCache', data });
  }
  return success;
}

function setupEventListeners() {
  document.getElementById('searchInput')?.addEventListener('input', (e) => {
    searchTerm = e.target.value.toLowerCase();
    renderFolders();
  });
  
  document.getElementById('importBtn')?.addEventListener('click', showImportModal);
  
  document.getElementById('exportAllBtn')?.addEventListener('click', showExportAllModal);
  
  document.getElementById('openOrganizerBtn')?.addEventListener('click', async () => {
    await chrome.runtime.sendMessage({ action: 'openOrganizer' });
  });
  
  document.getElementById('editCategoriesBtn')?.addEventListener('click', showEditCategoriesModal);
  
  // New organize buttons
  document.getElementById('askClaudeBtn')?.addEventListener('click', askClaudeToOrganize);
  document.getElementById('applyCategoriesBtn')?.addEventListener('click', showApplyCategoriesModal);
  document.getElementById('applyHeaderBtn')?.addEventListener('click', showApplyCategoriesModal);
  
  // Analytics toggle
  document.getElementById('analyticsBtn')?.addEventListener('click', toggleAnalytics);
  document.getElementById('backToFoldersBtn')?.addEventListener('click', hideAnalytics);
  
  // Coffee/support button
  document.getElementById('coffeeBtn')?.addEventListener('click', () => {
    document.getElementById('coffeeModal')?.classList.remove('hidden');
  });
  
  // Toggle setup instructions button
  document.getElementById('toggleSetupBtn')?.addEventListener('click', () => {
    const setupInstructions = document.getElementById('setupInstructions');
    if (setupInstructions) {
      setupInstructions.classList.toggle('hidden');
    }
  });
  
  document.querySelectorAll('.close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      const modalId = btn.dataset.modal;
      document.getElementById(modalId)?.classList.add('hidden');
    });
  });
}

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

function showEditCategoriesModal() {
  const modal = document.getElementById('editCategoriesModal');
  modal.classList.remove('hidden');
  renderCategoriesList();
  
  document.getElementById('addCategoryBtn')?.addEventListener('click', async () => {
    const input = document.getElementById('newCategoryInput');
    const name = input.value.trim();
    if (name && !categories.includes(name)) {
      categories.push(name);
      await saveData();
      renderCategoriesList();
      renderCategoryFilters();
      input.value = '';
    }
  });
}

function renderCategoriesList() {
  const list = document.getElementById('categoriesList');
  if (!list) return;
  list.innerHTML = categories.map((cat, idx) => `
    <div class="edit-list-item">
      <span>${cat}</span>
      <button class="btn-icon-delete" data-index="${idx}">×</button>
    </div>
  `).join('');
  
  list.querySelectorAll('.btn-icon-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      categories.splice(parseInt(btn.dataset.index), 1);
      await saveData();
      renderCategoriesList();
      renderCategoryFilters();
    });
  });
}

function renderCategoryFilters() {
  const container = document.getElementById('filterPills');
  if (!container) return;
  
  let html = '<button class="filter-pill active" data-filter="all">All</button>';
  categories.forEach(cat => {
    html += `<button class="filter-pill" data-filter="${cat}">${cat}</button>`;
  });
  container.innerHTML = html;
  
  container.querySelectorAll('.filter-pill').forEach(btn => {
    btn.addEventListener('click', () => {
      container.querySelectorAll('.filter-pill').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.dataset.filter;
      renderFolders();
    });
  });
}

function renderFolders() {
  const container = document.getElementById('folderList');
  const setupInstructions = document.getElementById('setupInstructions');
  const toggleSetupBtn = document.getElementById('toggleSetupBtn');
  if (!container) return;
  
  // Check if we have any organized folders (exclude unsorted)
  const organizedFolders = folders.filter(f => f.id !== 'unsorted');
  const hasOrganizedData = organizedFolders.length > 0 && categories.length > 0;
  
  // Show/hide setup instructions and toggle button
  if (setupInstructions && toggleSetupBtn) {
    if (hasOrganizedData) {
      setupInstructions.classList.add('hidden');
      toggleSetupBtn.classList.remove('hidden');
    } else {
      setupInstructions.classList.remove('hidden');
      toggleSetupBtn.classList.add('hidden');
    }
  }
  
  let filtered = folders;
  if (currentFilter !== 'all') {
    filtered = filtered.filter(f => f.category === currentFilter);
  }
  if (searchTerm) {
    filtered = filtered.filter(f => 
      f.name.toLowerCase().includes(searchTerm) ||
      f.chats.some(c => c.title.toLowerCase().includes(searchTerm))
    );
  }
  
  if (folders.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No folders yet</p><p>Import chats using the button above</p></div>`;
    return;
  }
  
  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><p>No folders found</p></div>`;
    return;
  }
  
  // Group by category
  const byCategory = {};
  filtered.forEach(f => {
    const cat = f.category || 'Uncategorized';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(f);
  });
  
  let html = '';
  Object.keys(byCategory).sort().forEach(cat => {
    const catFolders = byCategory[cat];
    const totalChats = catFolders.reduce((sum, f) => sum + (f.chats?.length || 0), 0);
    html += `
      <div class="folder-category-group collapsed">
        <div class="folder-category-header" data-category="${cat}">
          <span>${cat} (${totalChats})</span>
          <svg class="category-toggle-icon" width="12" height="12" viewBox="0 0 16 16" fill="currentColor">
            <path d="M6 4l4 4-4 4"/>
          </svg>
        </div>
        <div class="folder-category-content">
          ${catFolders.map(folder => `
            <div class="folder-item" data-folder-id="${folder.id}">
              <div class="folder-header">
                <div class="folder-info">
                  <span class="folder-name">${folder.name}</span>
                </div>
                <div class="folder-actions">
                  <span class="folder-count">${folder.chats?.length || 0}</span>
                  <button class="folder-menu-btn" data-folder-id="${folder.id}">⋮</button>
                </div>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    `;
  });
  
  container.innerHTML = html;
  
  // Category toggle
  container.querySelectorAll('.folder-category-header').forEach(header => {
    header.addEventListener('click', () => {
      header.closest('.folder-category-group').classList.toggle('collapsed');
    });
  });
  
  container.querySelectorAll('.folder-header').forEach(header => {
    header.addEventListener('click', (e) => {
      if (e.target.closest('.folder-menu-btn')) return;
      const folderId = header.closest('.folder-item').dataset.folderId;
      chrome.runtime.sendMessage({ action: 'openOrganizer', folderId });
    });
  });
  
  container.querySelectorAll('.folder-menu-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      showFolderMenu(btn, btn.dataset.folderId);
    });
  });
}

function showFolderMenu(btn, folderId) {
  document.querySelectorAll('.context-menu').forEach(m => m.remove());
  
  const menu = document.createElement('div');
  menu.className = 'context-menu';
  const rect = btn.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 4}px`;
  menu.style.right = `${window.innerWidth - rect.right}px`;
  
  menu.innerHTML = `
    <div class="context-menu-item" data-action="rename">Rename</div>
    <div class="context-menu-item" data-action="delete">Delete</div>
  `;
  
  document.body.appendChild(menu);
  
  menu.querySelectorAll('.context-menu-item').forEach(item => {
    item.addEventListener('click', async () => {
      const action = item.dataset.action;
      menu.remove();
      if (action === 'rename') {
        const folder = folders.find(f => f.id === folderId);
        const newName = prompt('New name:', folder.name);
        if (newName) {
          folder.name = newName;
          await saveData();
          renderFolders();
        }
      } else if (action === 'delete') {
        if (confirm('Delete this folder?')) {
          folders = folders.filter(f => f.id !== folderId);
          await saveData();
          renderFolders();
        }
      }
    });
  });
  
  setTimeout(() => {
    document.addEventListener('click', function close(e) {
      if (!menu.contains(e.target)) {
        menu.remove();
        document.removeEventListener('click', close);
      }
    });
  }, 0);
}

function updateStats() {
  const el = document.getElementById('statsText');
  if (el) {
    el.textContent = `${folders.length} folders • ${allChats.length} chats`;
  }
}

// ========== AI Organize Functions ==========

function analyzeChatsLocally() {
  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'about', 'how', 'why', 'what', 'when', 
    'where', 'this', 'that', 'your', 'new', 'can', 'you', 'help', 'need', 'want',
    'get', 'make', 'use', 'would', 'could', 'should', 'have', 'has', 'been', 'being',
    'will', 'are', 'was', 'were', 'they', 'them', 'their', 'there', 'here', 'which',
    'more', 'some', 'any', 'all', 'each', 'into', 'than', 'then', 'also', 'just',
    'like', 'know', 'think', 'does', 'did', 'doing', 'done', 'way', 'well', 'very'
  ]);
  
  const wordCounts = {};
  const phraseCounts = {};
  
  allChats.forEach(chat => {
    const title = chat.title.toLowerCase();
    const words = title.match(/\b[a-z]{3,}\b/g) || [];
    const filteredWords = words.filter(w => !stopWords.has(w));
    
    filteredWords.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    for (let i = 0; i < filteredWords.length - 1; i++) {
      const bigram = `${filteredWords[i]} ${filteredWords[i+1]}`;
      phraseCounts[bigram] = (phraseCounts[bigram] || 0) + 1;
    }
  });
  
  const topWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([word, count]) => ({ word, count }));
  
  const topPhrases = Object.entries(phraseCounts)
    .filter(([_, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([phrase, count]) => ({ phrase, count }));
  
  return { totalChats: allChats.length, topWords, topPhrases };
}

async function askClaudeToOrganize() {
  if (allChats.length === 0) {
    alert('No chats to organize! Import chats first.');
    return;
  }
  
  const analysis = analyzeChatsLocally();
  
  const prompt = `I have ${analysis.totalChats} Claude chats to organize. Here's the word frequency analysis:

TOP 80 KEYWORDS (word: count):
${analysis.topWords.map(w => `${w.word}(${w.count})`).join(', ')}

TOP 40 PHRASES (phrase: count):
${analysis.topPhrases.map(p => `${p.phrase}(${p.count})`).join(', ')}

Based on these patterns, design a categorization system. Return ONLY valid JSON in this exact format:
{
  "categories": [
    {
      "name": "Category Name",
      "folders": [
        {"name": "Folder Name", "keywords": ["keyword1", "keyword2", "phrase match"]}
      ]
    }
  ]
}

Requirements:
- 6-8 broad categories representing major areas (e.g., "Development", "Business", "Personal", "Learning")
- 2-6 folders per category
- 5-15 keywords per folder (use words/phrases from my data above)
- Keywords are case-insensitive substring matches
- Order categories/folders from most specific to least (first match wins)
- Last category should be "Miscellaneous" with folder "General" and empty keywords []
- Return ONLY the JSON, no markdown, no explanation`;

  // Copy to clipboard
  await navigator.clipboard.writeText(prompt);
  
  // Open new Claude chat
  chrome.tabs.create({ url: 'https://claude.ai/new' });
  
  alert('Prompt copied to clipboard! Paste it in the new Claude chat, then use "Apply Claude\'s Response" with the result.');
}

function applyCategorization(categoryDefs) {
  const results = [];
  const usedChatIds = new Set();
  let folderId = 1;
  
  for (const category of categoryDefs.categories) {
    for (const folderDef of category.folders) {
      const matchedChats = [];
      if (folderDef.keywords.length === 0) continue;
      
      for (const chat of allChats) {
        if (usedChatIds.has(chat.id)) continue;
        const titleLower = chat.title.toLowerCase();
        const matches = folderDef.keywords.some(kw => titleLower.includes(kw.toLowerCase()));
        
        if (matches) {
          matchedChats.push({ id: chat.id, title: chat.title, url: chat.url, date: chat.date });
          usedChatIds.add(chat.id);
        }
      }
      
      if (matchedChats.length > 0) {
        results.push({
          id: `folder-${folderId++}`,
          name: folderDef.name,
          category: category.name,
          chats: matchedChats
        });
      }
    }
  }
  
  const uncategorized = allChats
    .filter(c => !usedChatIds.has(c.id))
    .map(c => ({ id: c.id, title: c.title, url: c.url, date: c.date }));
  
  if (uncategorized.length > 0) {
    results.push({
      id: `folder-${folderId}`,
      name: 'General',
      category: 'Miscellaneous',
      chats: uncategorized
    });
  }
  
  const uniqueCategories = [...new Set(results.map(f => f.category))];
  return { categories: uniqueCategories, folders: results };
}

function showApplyCategoriesModal() {
  // Remove any existing modal
  document.querySelector('.apply-modal-overlay')?.remove();
  
  const overlay = document.createElement('div');
  overlay.className = 'apply-modal-overlay';
  overlay.style.cssText = `
    position: fixed; top: 0; left: 0; right: 0; bottom: 0;
    background: rgba(0,0,0,0.7); z-index: 10000;
    display: flex; align-items: center; justify-content: center;
  `;
  
  overlay.innerHTML = `
    <div style="background: #2a2a28; border-radius: 12px; width: 90%; max-width: 500px; max-height: 80vh; display: flex; flex-direction: column;">
      <div style="padding: 16px 20px; border-bottom: 1px solid #3d3d3a; display: flex; justify-content: space-between; align-items: center;">
        <h3 style="margin: 0; color: #e8e6e3;">Apply Claude's Categories</h3>
        <button class="modal-close" style="background: none; border: none; color: #9c9a92; font-size: 24px; cursor: pointer;">×</button>
      </div>
      <div style="padding: 20px; flex: 1; overflow-y: auto;">
        <p style="color: #9c9a92; margin: 0 0 12px;">Paste Claude's JSON response:</p>
        <textarea id="applyJsonInput" style="width: 100%; height: 150px; background: #1a1a18; border: 1px solid #3d3d3a; border-radius: 8px; color: #e8e6e3; font-family: monospace; font-size: 12px; padding: 12px; resize: vertical;" placeholder='{"categories": [...]}'></textarea>
        <div id="applyStats" style="margin-top: 12px; padding: 12px; background: #1a1a18; border-radius: 8px; font-size: 13px; color: #9c9a92;">Step 1: Paste JSON, then click Preview Categories</div>
      </div>
      <div style="padding: 16px 20px; border-top: 1px solid #3d3d3a; display: flex; justify-content: flex-end; gap: 10px;">
        <button class="modal-cancel" style="padding: 10px 20px; background: transparent; border: 1px solid #3d3d3a; border-radius: 6px; color: #9c9a92; cursor: pointer;">Cancel</button>
        <button id="previewBtn" style="padding: 10px 20px; background: linear-gradient(135deg, #d97706, #b45309); border: none; border-radius: 6px; color: #fff; cursor: pointer;">Preview Categories</button>
        <button id="applyBtn" style="padding: 10px 20px; background: #3d3d3a; border: none; border-radius: 6px; color: #9c9a92; cursor: not-allowed; opacity: 0.6;" disabled>Apply & Save</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const textarea = overlay.querySelector('#applyJsonInput');
  const statsDiv = overlay.querySelector('#applyStats');
  const previewBtn = overlay.querySelector('#previewBtn');
  const applyBtn = overlay.querySelector('#applyBtn');
  let previewResult = null;
  
  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  
  previewBtn.addEventListener('click', () => {
    try {
      const rawValue = textarea.value.trim();
      if (!rawValue) {
        throw new Error('Please paste JSON first');
      }
      console.log('[POPUP] Parsing JSON, length:', rawValue.length);
      const json = JSON.parse(rawValue);
      if (!json.categories || !Array.isArray(json.categories)) {
        throw new Error('Invalid format - need {categories: [...]}');
      }
      
      if (allChats.length === 0) {
        throw new Error('No chats to organize. Import chats first using the Import button.');
      }
      
      previewResult = applyCategorization(json);
      
      const totalChats = previewResult.folders.reduce((sum, f) => sum + f.chats.length, 0);
      const byCategory = {};
      previewResult.folders.forEach(f => {
        byCategory[f.category] = (byCategory[f.category] || 0) + f.chats.length;
      });
      
      let statsHtml = `<strong style="color:#10b981;">✓ Preview Ready:</strong> ${previewResult.categories.length} categories, ${previewResult.folders.length} folders, ${totalChats} chats<br><br>`;
      Object.entries(byCategory).forEach(([cat, count]) => {
        statsHtml += `• ${cat}: ${count} chats<br>`;
      });
      statsHtml += `<br><span style="color:#10b981;">Step 2: Click "Apply & Save" to finish</span>`;
      
      statsDiv.innerHTML = statsHtml;
      
      previewBtn.style.background = '#3d3d3a';
      previewBtn.style.color = '#9c9a92';
      previewBtn.textContent = '✓ Previewed';
      
      applyBtn.disabled = false;
      applyBtn.style.background = 'linear-gradient(135deg, #059669, #047857)';
      applyBtn.style.color = '#fff';
      applyBtn.style.cursor = 'pointer';
      applyBtn.style.opacity = '1';
    } catch (e) {
      statsDiv.innerHTML = `<span style="color:#ef4444;">Error: ${e.message}</span>`;
    }
  });
  
  applyBtn.addEventListener('click', async () => {
    if (!previewResult) return;
    
    applyBtn.textContent = 'Saving...';
    applyBtn.disabled = true;
    
    folders = previewResult.folders;
    categories = previewResult.categories;
    allChats = [];
    folders.forEach(f => { if (f.chats) allChats.push(...f.chats); });
    
    await saveData();
    
    overlay.remove();
    renderCategoryFilters();
    renderFolders();
    updateStats();
    alert(`Organized ${allChats.length} chats into ${folders.length} folders!`);
  });
}

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

// ========== EXPORT ALL FUNCTIONALITY ==========
function showExportAllModal() {
  // Count total chats
  let totalChats = 0;
  folders.forEach(f => { if (f.chats) totalChats += f.chats.length; });
  
  if (totalChats === 0) {
    alert('No chats to export. Import some chats first.');
    return;
  }
  
  const estimatedMinutes = Math.ceil(totalChats * 0.5 / 60);
  
  const confirmed = confirm(
    `Export all ${totalChats} chats from ${folders.length} folders?\n\n` +
    `This will:\n` +
    `• Visit each chat page to extract content\n` +
    `• Save markdown files to your data folder/chats/\n\n` +
    `Estimated time: ${estimatedMinutes > 0 ? estimatedMinutes + ' minute(s)' : 'less than a minute'}\n\n` +
    `Note: This requires the Claude.ai tab to be open. The export will run in the content script.`
  );
  
  if (!confirmed) return;
  
  // Send message to content script to start bulk export
  startBulkExportAllFolders();
}

async function startBulkExportAllFolders() {
  try {
    // Get the active Claude.ai tab
    const tabs = await chrome.tabs.query({ url: 'https://claude.ai/*' });
    if (tabs.length === 0) {
      alert('Please open Claude.ai in a tab first, then try again.');
      return;
    }
    
    // Collect all chats with folder info
    const allChats = [];
    folders.forEach(folder => {
      if (folder.chats) {
        folder.chats.forEach(chat => {
          allChats.push({
            id: chat.id,
            title: chat.title,
            url: chat.url,
            folderName: folder.name
          });
        });
      }
    });
    
    // Send to content script
    await chrome.tabs.sendMessage(tabs[0].id, {
      action: 'startBulkExport',
      chats: allChats
    });
    
    alert(`Export started for ${allChats.length} chats. Check the Claude.ai tab for progress.`);
  } catch (e) {
    alert('Error starting export: ' + e.message);
  }
}


// ========== MESSAGE LISTENER FOR EXPORT ==========
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'processPendingExports') {
    processPendingExports()
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
  
  if (message.action === 'writeExportFile') {
    handleWriteExportFile(message.filename, message.content)
      .then(result => sendResponse(result))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true; // Keep channel open for async response
  }
  
  if (message.action === 'syncToDisk') {
    syncToDisk()
      .then(() => sendResponse({ success: true }))
      .catch(e => sendResponse({ success: false, error: e.message }));
    return true;
  }
});

async function handleWriteExportFile(filename, content) {
  try {
    const result = await writeExportFile(filename, content);
    return { success: result };
  } catch (e) {
    console.log('[POPUP] writeExportFile error:', e.message);
    return { success: false, error: e.message };
  }
}

async function processPendingExports() {
  const result = await chrome.storage.local.get('pendingExports');
  const pending = result.pendingExports || [];
  
  if (pending.length === 0) return;
  
  console.log('[POPUP] Processing', pending.length, 'pending exports');
  
  for (const exp of pending) {
    await writeExportFile(exp.filename, exp.content);
  }
  
  // Clear processed exports
  await chrome.storage.local.remove('pendingExports');
  console.log('[POPUP] Processed all pending exports');
}
