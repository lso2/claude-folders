// content/cf-organize.js
// Builds the Ask Claude to Organize prompt and applies Claude's category response to the folders.
// Globals: askClaudeToOrganize, analyzeChatsLocally, cfTokenize, cfEscapeRe, cfNormKw,
//          cfBuildKeywordIndex, cfScoreText, cfReconcileTokens, cfJaccard, cfReconcile,
//          applyCategorization, showApplyCategoriesModal
// Depends on: content/cf-state.js, content/cf-account.js, content/cf-notify.js
// Notes: docs/notes/content/cf-organize.js.md

async function askClaudeToOrganize() {
  showNotification('Analyzing chat patterns...');

  const analysis = analyzeChatsLocally();

  if (analysis.totalChats === 0) {
    showNotification('No chats to organize! Import chats first.', true);
    return;
  }

  // Send Claude the real numbered titles (so it can both design folders AND
  // directly assign the obvious ones) plus the frequency hints. The number->id
  // map is stored so the pasted-back response resolves to real chats.
  cfOrganizeIndex = allChats.map(c => c.id);
  const MAX_TITLES = 2000;
  const numbered = allChats.slice(0, MAX_TITLES)
    .map((c, i) => `${i + 1}. ${String(c.title || '').replace(/\s+/g, ' ').slice(0, 120)}`)
    .join('\n');

  const prompt = `I have ${analysis.totalChats} Claude chat titles to organize into folders. Each title is numbered.

FREQUENT WORDS: ${analysis.topWords.map(w => w.word).join(', ')}
FREQUENT PHRASES: ${analysis.topPhrases.map(p => p.phrase).join(', ')}

NUMBERED TITLES:
${numbered}

Design a folder system AND assign the clearly-matching titles. Return ONLY valid JSON in this shape:
{
  "categories": [
    {
      "name": "Category Name",
      "folders": [
        {"name": "Folder Name", "keywords": ["distinctive phrase", "specific term"], "chats": [12, 47, 103]}
      ]
    }
  ]
}

Rules:
- 6-9 categories, 2-5 folders each. Order the most specific category/folder first.
- keywords: 6-15 per folder. Strongly prefer DISTINCTIVE multi-word phrases ("global payments", "android app", "wordpress plugin") and specific nouns. Never use a generic word on its own (app, code, data, system, design, file, update, project, fix, build, error) - only inside a longer phrase. Keywords match whole words, case-insensitive.
- chats: the NUMBERS of titles that clearly belong in that folder. Include only ones you are confident about and leave the rest out (the keywords catch them). Each number in at most one folder.
- Last category "Miscellaneous", folder "General", keywords [], no chats.
- Return ONLY the JSON, no markdown, no commentary.`;

  await chrome.storage.local.set({
    pendingOrganizePrompt: prompt,
    pendingOrganizeAnalysis: analysis,
    ['organizeIndex__' + cfAccountKey]: cfOrganizeIndex
  });

  window.open('https://claude.ai/new', '_blank');
  showNotification('Opening Claude - paste the response back to apply it!');
}

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
    
    // Extract words (3+ chars, not stop words)
    const words = title.match(/\b[a-z]{3,}\b/g) || [];
    const filteredWords = words.filter(w => !stopWords.has(w));
    
    filteredWords.forEach(word => {
      wordCounts[word] = (wordCounts[word] || 0) + 1;
    });
    
    // Extract bigrams
    for (let i = 0; i < filteredWords.length - 1; i++) {
      const bigram = `${filteredWords[i]} ${filteredWords[i+1]}`;
      phraseCounts[bigram] = (phraseCounts[bigram] || 0) + 1;
    }
  });
  
  // Sort and get top results
  const topWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 80)
    .map(([word, count]) => ({ word, count }));
  
  const topPhrases = Object.entries(phraseCounts)
    .filter(([_, count]) => count >= 2) // Only phrases that appear 2+ times
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([phrase, count]) => ({ phrase, count }));
  
  return {
    totalChats: allChats.length,
    topWords,
    topPhrases
  };
}

// ===== Shared text helpers for the categorizer =====
function cfTokenize(text) { return (String(text || '').toLowerCase().match(/[a-z0-9]+/g) || []); }
function cfEscapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function cfNormKw(s) { return String(s || '').toLowerCase().trim(); }

// Precompile folder keyword rules. A keyword shared across many folders gets an
// IDF down-weight (1/df) so generic words like "design" barely score, while
// distinctive phrases score high. Single words match on whole-word boundaries
// so "car" no longer matches inside "scorecard".
function cfBuildKeywordIndex(cats) {
  const folderCountByKw = new Map();
  const raw = [];
  (cats || []).forEach(cat => (cat.folders || []).forEach(fd => {
    const uniq = [...new Set((fd.keywords || []).map(cfNormKw).filter(Boolean))];
    raw.push({ category: cat.name, name: fd.name, keywords: uniq });
    uniq.forEach(kw => folderCountByKw.set(kw, (folderCountByKw.get(kw) || 0) + 1));
  }));
  return raw.map(rf => ({
    category: rf.category, name: rf.name,
    rules: rf.keywords.map(kw => {
      const isPhrase = kw.includes(' ');
      const df = folderCountByKw.get(kw) || 1;
      let base = isPhrase ? 3 : 1;
      if (kw.length >= 7) base += 0.5;
      base *= 1 / df;
      return { kw, isPhrase, base, re: isPhrase ? null : new RegExp('(^|[^a-z0-9])' + cfEscapeRe(kw) + '([^a-z0-9]|$)') };
    })
  }));
}

function cfScoreText(text, folder) {
  let s = 0;
  for (const r of folder.rules) {
    if (r.isPhrase) { if (text.includes(r.kw)) s += r.base; }
    else { if (r.re.test(text)) s += r.base; }
  }
  return s;
}

function cfReconcileTokens(name) { return new Set(cfTokenize(name).filter(t => t.length > 2 && t !== 'and' && t !== 'the')); }
function cfJaccard(a, b) { if (!a.size || !b.size) return 0; let i = 0; a.forEach(x => { if (b.has(x)) i++; }); return i / (a.size + b.size - i); }

// Merge + reconcile: snap a pre-existing category onto the closest new canonical
// name (so "Data & Analytics" folds into "Data & Analysis"), then merge folders
// that share a category and normalized name. The Unsorted bucket is left alone.
function cfReconcile(folderList, canonicalCats) {
  const canon = (canonicalCats || []).filter(Boolean);
  const canonTok = canon.map(c => ({ name: c, tok: cfReconcileTokens(c) }));
  const remap = new Map();
  folderList.forEach(f => {
    if (f.id === 'unsorted') { f.category = 'Unsorted'; return; }
    if (!f.category) f.category = 'Miscellaneous';
    if (canon.includes(f.category)) return;
    if (remap.has(f.category)) { f.category = remap.get(f.category); return; }
    const ft = cfReconcileTokens(f.category);
    let best = null, bestJ = 0;
    canonTok.forEach(c => { const j = cfJaccard(ft, c.tok); if (j > bestJ) { bestJ = j; best = c.name; } });
    const mapped = (best && bestJ >= 0.30) ? best : f.category;
    remap.set(f.category, mapped);
    f.category = mapped;
  });
  const normName = s => cfTokenize(s).join(' ');
  const seen = new Map();
  const out = [];
  for (const f of folderList) {
    const key = f.category.toLowerCase().trim() + '::' + normName(f.name);
    if (seen.has(key)) {
      const tgt = seen.get(key);
      const have = new Set(tgt.chats.map(c => c.id));
      (f.chats || []).forEach(c => { if (!have.has(c.id)) { tgt.chats.push(c); have.add(c.id); } });
    } else { seen.set(key, f); out.push(f); }
  }
  return out;
}

function applyCategorization(categoryDefs) {
  // Hybrid merge: (1) apply Claude's confident per-folder chat assignments, then
  // (2) a scored keyword matcher (whole-word, phrase-weighted, generic keywords
  // IDF-damped, best match wins) for the rest, (3) leftovers to Unsorted, then
  // (4) reconcile near-duplicate categories. Preserves existing folder ids/names.
  const merged = JSON.parse(JSON.stringify(folders || []));
  const preExistingIds = new Set((folders || []).map(f => f.id));
  const folderKey = (cat, name) => `${(cat || '').toLowerCase().trim()}::${(name || '').toLowerCase().trim()}`;
  const byKey = new Map();
  merged.forEach(f => byKey.set(folderKey(f.category, f.name), f));

  const chatById = new Map();
  (allChats || []).forEach(c => chatById.set(c.id, c));
  merged.forEach(f => f.chats?.forEach(c => { if (!chatById.has(c.id)) chatById.set(c.id, c); }));

  let nextIdNum = 1;
  const makeId = () => { let id; do { id = `folder-${nextIdNum++}`; } while (merged.some(f => f.id === id)); return id; };
  const getOrCreateFolder = (category, name) => {
    const key = folderKey(category, name);
    let f = byKey.get(key);
    if (!f) { f = { id: makeId(), name: name || 'Untitled', category: category || 'Miscellaneous', chats: [] }; merged.push(f); byKey.set(key, f); }
    if (!Array.isArray(f.chats)) f.chats = [];
    return f;
  };
  const assignChat = (target, chatId) => {
    const meta = chatById.get(chatId) || { id: chatId, title: 'Untitled Chat', url: `https://claude.ai/chat/${chatId}`, date: new Date().toISOString().split('T')[0] };
    merged.forEach(f => { if (f.chats) f.chats = f.chats.filter(c => c.id !== chatId); });
    target.chats.push({ id: chatId, title: meta.title, url: meta.url, date: meta.date, relativeDate: meta.relativeDate, snippet: meta.snippet || '', tags: meta.tags || [], exported: meta.exported });
  };

  // Resolve a chat reference: a 1-based number (from the prompt), numeric string,
  // an id, or {id}/{index}. Numbers map through the stored prompt index.
  const arrIdx = (cfOrganizeIndex && cfOrganizeIndex.length) ? cfOrganizeIndex : (allChats || []).map(c => c.id);
  const resolveId = (ref) => {
    if (ref == null) return null;
    if (typeof ref === 'object') ref = ref.id ?? ref.chatId ?? ref.index;
    if (typeof ref === 'number' || /^\d+$/.test(String(ref))) {
      const n = Number(ref);
      if (n >= 1 && n <= arrIdx.length) return arrIdx[n - 1];
      if (arrIdx[n] != null) return arrIdx[n];
      return null;
    }
    return String(ref);
  };

  const assigned = new Set();
  const cats = Array.isArray(categoryDefs.categories) ? categoryDefs.categories : [];
  const explicitFolders = Array.isArray(categoryDefs.folders) ? categoryDefs.folders : null;

  // PHASE 1 - Claude's confident assignments (chats listed per folder) win first
  const applyExplicit = (category, name, refs) => {
    if (!Array.isArray(refs) || !refs.length) return;
    const target = getOrCreateFolder(category, name);
    for (const ref of refs) {
      const id = resolveId(ref);
      if (!id || assigned.has(id) || !chatById.has(id)) continue;
      assignChat(target, id);
      assigned.add(id);
    }
  };
  if (explicitFolders) { for (const fd of explicitFolders) { if (fd) applyExplicit(fd.category, fd.name, fd.chats || fd.chatIndices); } }
  for (const cat of cats) { for (const fd of (cat.folders || [])) { applyExplicit(cat.name, fd.name, fd.chats || fd.chatIndices); } }

  // PHASE 2 - scored keyword matching, best folder wins, for the remainder
  const ruleFolders = cfBuildKeywordIndex(cats);
  const THRESH = 0.6;
  for (const chat of (allChats || [])) {
    if (assigned.has(chat.id)) continue;
    const text = ' ' + String(chat.title || '').toLowerCase() + ' ' + String(chat.snippet || '').toLowerCase() + ' ';
    let best = null, bestScore = 0;
    for (const rf of ruleFolders) {
      if (!rf.rules.length) continue;
      const sc = cfScoreText(text, rf);
      if (sc > bestScore) { bestScore = sc; best = rf; }
    }
    if (best && bestScore >= THRESH) { assignChat(getOrCreateFolder(best.category, best.name), chat.id); assigned.add(chat.id); }
  }

  // PHASE 3 - anything still unplaced goes to Unsorted (kept visible, never absorbed)
  let unsorted = merged.find(f => f.id === 'unsorted');
  (allChats || []).forEach(c => {
    if (merged.some(f => f.chats?.some(x => x.id === c.id))) return;
    if (!unsorted) { unsorted = { id: 'unsorted', name: 'Unsorted Chats', category: 'Unsorted', chats: [] }; merged.push(unsorted); }
    unsorted.chats.push({ id: c.id, title: c.title, url: c.url, date: c.date, relativeDate: c.relativeDate, snippet: c.snippet || '', tags: c.tags || [], exported: c.exported });
  });

  let result = merged.filter(f => (f.chats && f.chats.length > 0) || preExistingIds.has(f.id) || f.id === 'unsorted');

  // PHASE 4 - collapse near-duplicate categories/folders
  result = cfReconcile(result, cats.map(c => c.name));

  const uniqueCategories = [...new Set([...(categories || []), ...result.map(f => f.category)].filter(Boolean))];
  return { categories: uniqueCategories, folders: result };
}

function showApplyCategoriesModal() {
  // Restore the number->id map from the last "Ask Claude" run so pasted-back
  // numeric assignments resolve, even if this is a fresh page load.
  if (!cfOrganizeIndex.length) {
    chrome.storage.local.get('organizeIndex__' + cfAccountKey, (r) => {
      const idx = r['organizeIndex__' + cfAccountKey];
      if (Array.isArray(idx) && idx.length) cfOrganizeIndex = idx;
    });
  }

  // Create modal overlay
  const overlay = document.createElement('div');
  overlay.className = 'categories-modal-overlay';
  overlay.innerHTML = `
    <div class="categories-modal">
      <div class="categories-modal-header">
        <h3>Apply Claude's Categories</h3>
        <button class="modal-close-btn">×</button>
      </div>
      <div class="categories-modal-body">
        <p>Paste Claude's JSON response below:</p>
        <textarea id="categoriesJsonInput" placeholder='{"categories": [{"name": "...", "folders": [...]}]}'></textarea>
        <div class="modal-stats" id="modalStats"><span style="color:#9c9a92;">Step 1: Paste JSON, then click Preview Categories</span></div>
      </div>
      <div class="categories-modal-footer">
        <button class="modal-btn cancel-btn">Cancel</button>
        <button class="modal-btn preview-btn" id="previewBtn">Preview Categories</button>
        <button class="modal-btn apply-btn" id="applyBtn" disabled title="Preview first to verify">Apply & Save</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  const textarea = overlay.querySelector('#categoriesJsonInput');
  const statsDiv = overlay.querySelector('#modalStats');
  const previewBtn = overlay.querySelector('#previewBtn');
  const applyBtn = overlay.querySelector('#applyBtn');
  let previewResult = null;
  
  overlay.querySelector('.modal-close-btn').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.cancel-btn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  
  previewBtn.addEventListener('click', () => {
    try {
      const json = JSON.parse(textarea.value);
      if (!json.categories || !Array.isArray(json.categories)) {
        throw new Error('Invalid format - need {categories: [...]}');
      }
      
      previewResult = applyCategorization(json);
      
      const totalChats = previewResult.folders.reduce((sum, f) => sum + f.chats.length, 0);
      const byCategory = {};
      previewResult.folders.forEach(f => {
        byCategory[f.category] = (byCategory[f.category] || 0) + f.chats.length;
      });
      
      let statsHtml = `<strong>✓ Preview Ready:</strong> ${previewResult.categories.length} categories, ${previewResult.folders.length} folders, ${totalChats} chats<br><br>`;
      Object.entries(byCategory).forEach(([cat, count]) => {
        statsHtml += `• ${cat}: ${count} chats<br>`;
      });
      statsHtml += `<br><span style="color:#10b981;">Step 2: Click "Apply & Save" to finish</span>`;
      
      statsDiv.innerHTML = statsHtml;
      statsDiv.style.color = '#10b981';
      
      // Toggle button states
      previewBtn.classList.add('done');
      previewBtn.textContent = '✓ Previewed';
      applyBtn.disabled = false;
      applyBtn.classList.add('ready');
    } catch (e) {
      statsDiv.innerHTML = `<span style="color:#ef4444;">Error: ${cfEscapeHtml(e.message)}</span>`;
      applyBtn.disabled = true;
    }
  });
  
  applyBtn.addEventListener('click', async () => {
    if (!previewResult) return;
    
    applyBtn.textContent = 'Saving...';
    applyBtn.disabled = true;
    
    try {
      // Update global state
      folders = previewResult.folders;
      categories = previewResult.categories;
      allChats = [];
      folders.forEach(f => { if (f.chats) allChats.push(...f.chats); });
      
      // Ensure metadata exists
      if (typeof metadata === 'undefined' || !metadata) {
        metadata = {};
      }
      
      // Save to storage and file
      const dataToSave = { folders, categories, metadata };
      await chrome.storage.local.set({ cachedData: dataToSave });
      
      // Tell background to sync and wait for it
      await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'saveData', data: dataToSave }, (response) => {
          if (chrome.runtime.lastError) {
            console.log('[CONTENT] Save error:', chrome.runtime.lastError.message);
          }
          resolve();
        });
      });
      
      overlay.remove();
      showNotification(`Organized ${allChats.length} chats into ${folders.length} folders!`);
      
      // Refresh the panel
      const panel = document.querySelector('.claude-folders-panel');
      if (panel) renderPanelContent(panel);
    } catch (e) {
      console.log('[CONTENT] Apply error:', e.message);
      showNotification('Error saving: ' + e.message, true);
      applyBtn.textContent = 'Apply & Save';
      applyBtn.disabled = false;
    }
  });
}
