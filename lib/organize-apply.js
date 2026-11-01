// lib/organize-apply.js
// Files the chats into folders from Claude's answer to the Ask Claude to Organize request.
// Globals: CF_ORGANIZE_MATCH_THRESHOLD, cfTokenize, cfEscapeRe, cfNormKw, cfBuildKeywordIndex, cfScoreText,
//          cfReconcileTokens, cfJaccard, cfReconcile, applyCategorization
// Notes: docs/notes/lib/organize-apply.js.md

// Lowest keyword score that files a chat Claude did not assign itself
const CF_ORGANIZE_MATCH_THRESHOLD = 0.6;

function cfTokenize(text) { return (String(text || '').toLowerCase().match(/[a-z0-9]+/g) || []); }
function cfEscapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function cfNormKw(s) { return String(s || '').toLowerCase().trim(); }

// A keyword shared by several folders is weighted 1/df, so a generic word barely scores and a
// distinctive phrase scores high. Single words match on whole-word boundaries ("car" never
// matches inside "scorecard").
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
    else if (r.re.test(text)) s += r.base;
  }
  return s;
}

function cfReconcileTokens(name) { return new Set(cfTokenize(name).filter(t => t.length > 2 && t !== 'and' && t !== 'the')); }
function cfJaccard(a, b) { if (!a.size || !b.size) return 0; let i = 0; a.forEach(x => { if (b.has(x)) i++; }); return i / (a.size + b.size - i); }

// An existing category is moved onto the closest new category name ("Data & Analytics" onto
// "Data & Analysis"), then folders with the same category and normalized name are merged.
// The Unsorted folder is left alone.
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

// state: { folders, categories, chats, index }, where index holds the chat ids in the order the
// request numbered them. Returns { categories, folders } and leaves state unchanged.
// 1. Claude's own per-folder assignments are applied first.
// 2. Each remaining chat goes to the folder whose keywords score highest, at or above the threshold.
// 3. Chats still unplaced go to Unsorted.
// 4. Near-duplicate categories and folders are merged. Existing folder ids and names are kept.
function applyCategorization(categoryDefs, state) {
  const current = state || {};
  const chats = current.chats || [];
  const merged = JSON.parse(JSON.stringify(current.folders || []));
  const preExistingIds = new Set((current.folders || []).map(f => f.id));
  const folderKey = (cat, name) => `${(cat || '').toLowerCase().trim()}::${(name || '').toLowerCase().trim()}`;
  const byKey = new Map();
  merged.forEach(f => byKey.set(folderKey(f.category, f.name), f));

  const chatById = new Map();
  chats.forEach(c => chatById.set(c.id, c));
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
  // Only chats in chatById are assigned. Every stored field is kept, including the organization and update time.
  const assignChat = (target, chatId) => {
    const meta = chatById.get(chatId);
    merged.forEach(f => { if (f.chats) f.chats = f.chats.filter(c => c.id !== chatId); });
    target.chats.push({ ...meta, id: chatId, snippet: meta.snippet || '', tags: meta.tags || [] });
  };

  // A chat reference is a 1-based number from the request, a numeric string, an id, or {id}/{index}
  const arrIdx = (current.index && current.index.length) ? current.index : chats.map(c => c.id);
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

  const ruleFolders = cfBuildKeywordIndex(cats);
  for (const chat of chats) {
    if (assigned.has(chat.id)) continue;
    const text = ' ' + String(chat.title || '').toLowerCase() + ' ' + String(chat.snippet || '').toLowerCase() + ' ';
    let best = null, bestScore = 0;
    for (const rf of ruleFolders) {
      if (!rf.rules.length) continue;
      const sc = cfScoreText(text, rf);
      if (sc > bestScore) { bestScore = sc; best = rf; }
    }
    if (best && bestScore >= CF_ORGANIZE_MATCH_THRESHOLD) { assignChat(getOrCreateFolder(best.category, best.name), chat.id); assigned.add(chat.id); }
  }

  let unsorted = merged.find(f => f.id === 'unsorted');
  chats.forEach(c => {
    if (merged.some(f => f.chats?.some(x => x.id === c.id))) return;
    if (!unsorted) { unsorted = { id: 'unsorted', name: 'Unsorted Chats', category: 'Unsorted', chats: [] }; merged.push(unsorted); }
    unsorted.chats.push({ ...c, snippet: c.snippet || '', tags: c.tags || [] });
  });

  let result = merged.filter(f => (f.chats && f.chats.length > 0) || preExistingIds.has(f.id) || f.id === 'unsorted');
  result = cfReconcile(result, cats.map(c => c.name));

  const uniqueCategories = [...new Set([...(current.categories || []), ...result.map(f => f.category)].filter(Boolean))];
  return { categories: uniqueCategories, folders: result };
}
