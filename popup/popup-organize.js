// popup/popup-organize.js
// Builds the Ask Claude to Organize prompt and applies Claude's category response to the folders.
// Globals: analyzeChatsLocally, askClaudeToOrganize, applyCategorization, showApplyCategoriesModal
// Depends on: popup/popup.js (state, saveData), popup/popup-folders.js (renderFolders)
// Notes: docs/notes/popup/popup-organize.js.md

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
