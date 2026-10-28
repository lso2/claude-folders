// content/cf-sync.js
// Collects the account's conversations into the folders store and exports the ones missing on disk.
// Globals: cfRelativeToISODate, CF_SYNC_OVERLAP_DAYS, CF_SYNC_CLEAN_PAGES, cfParseChatLink,
//          cfFindScroller, CF_MORE_CONTROL, cfIsOwnUi, cfAdvanceChatList, cfCollectChatsByScrolling,
//          cfReadWatermark, cfWriteWatermark, cfHeldChatIds, cfCollectAllChats, scrapeAllChats,
//          CF_SYNC_AFTER_ACCESS_KEY, cfRememberSyncRequest, cfTakeSyncRequest, scrapeRecentsPage
// Depends on: lib/chat-exporter.js, content/cf-disk.js, content/cf-export-run.js,
//             content/cf-sync-summary.js, content/cf-cowork-sync.js
// Notes: docs/notes/content/cf-sync.js.md

// Convert a relative label like "3 hours ago" / "Yesterday" to an ISO date
function cfRelativeToISODate(relativeDate) {
  let date = new Date();
  if (relativeDate) {
    const d = new Date();
    const num = (re) => { const m = relativeDate.match(re); return m ? parseInt(m[1]) : null; };
    const minutes = num(/(\d+)\s+minute/i);
    const hours = num(/(\d+)\s+hour/i);
    const days = num(/(\d+)\s+day/i);
    const weeks = num(/(\d+)\s+week/i);
    const months = num(/(\d+)\s+month/i);
    const years = num(/(\d+)\s+year/i);
    if (minutes !== null) d.setMinutes(d.getMinutes() - minutes);
    else if (hours !== null) d.setHours(d.getHours() - hours);
    else if (days !== null) d.setDate(d.getDate() - days);
    else if (weeks !== null) d.setDate(d.getDate() - weeks * 7);
    else if (months !== null) d.setMonth(d.getMonth() - months);
    else if (years !== null) d.setFullYear(d.getFullYear() - years);
    else if (relativeDate.toLowerCase().includes('yesterday')) d.setDate(d.getDate() - 1);
    date = d;
  }
  return date.toISOString().split('T')[0];
}

// How far past the newest conversation this account already holds an incremental
// sync keeps reading, so a chat edited a few weeks after it was created is still
// picked up rather than left behind the cutoff
const CF_SYNC_OVERLAP_DAYS = 30;

// Consecutive pages that must contain nothing unimported before an incremental
// read stops. One page is not enough, because a fully-held page can sit directly
// above conversations that were never imported.
const CF_SYNC_CLEAN_PAGES = 3;

// Parse a recents chat <a> element into a chat record (or null if not a chat)
function cfParseChatLink(link) {
  const href = link.getAttribute('href');
  if (!href || !href.includes('/chat/')) return null;
  const match = href.match(/\/chat\/([a-f0-9-]+)/i);
  if (!match) return null;

  let title = '';
  let relativeDate = '';
  const titleEl = link.querySelector('[class*="title"]') ||
                  link.querySelector('[class*="name"]') ||
                  link.querySelector('div > div:first-child');
  const dateEl = link.querySelector('[class*="time"]') ||
                 link.querySelector('[class*="date"]') ||
                 link.querySelector('[class*="ago"]');
  if (titleEl) title = titleEl.textContent?.trim() || '';
  if (dateEl) relativeDate = dateEl.textContent?.trim() || '';

  if (!title || !relativeDate) {
    const fullText = link.textContent?.trim() || '';
    const timeMatch = fullText.match(/(\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago|Yesterday|Today)/i);
    if (timeMatch) {
      relativeDate = relativeDate || timeMatch[1];
      const idx = fullText.indexOf('Last message');
      if (idx > 0) title = title || fullText.substring(0, idx).trim();
      else title = title || fullText.replace(/Last message.*$/i, '').replace(timeMatch[0], '').trim();
    } else if (!title) {
      title = fullText;
    }
  }

  title = title.replace(/\s+/g, ' ').trim();
  if (title.length > 200) title = title.substring(0, 197) + '...';
  if (!title || title.length < 2) title = 'Untitled Chat';

  return {
    id: match[1],
    title,
    url: href.startsWith('http') ? href : `https://claude.ai${href}`,
    date: cfRelativeToISODate(relativeDate),
    relativeDate: relativeDate || 'Today',
    snippet: '',
    tags: []
  };
}

// Find the element that actually scrolls the chat list. Claude's list container
// reports overflow-y as visible while still being taller than its box, so testing
// the computed overflow alone found nothing and the fallback never advanced.
// Any ancestor whose content overflows its box is treated as drivable.
function cfFindScroller(root) {
  let el = root.querySelector('a[href*="/chat/"]');
  let best = null;
  while (el && el !== document.body) {
    if (el.scrollHeight > el.clientHeight + 20) best = best || el;
    el = el.parentElement;
  }
  if (best) return best;
  const doc = document.scrollingElement || document.documentElement;
  return doc.scrollHeight > doc.clientHeight + 20 ? doc : null;
}

// Advance the rendered list by one screen. Claude's list pages render a fixed
// window of roughly thirty rows whose scroll container pins at its bottom without
// loading more, so this reports when it has run out of room instead of spinning.
// Control matching is exact: a substring test for "older" also matches the word
// "Folders", which would click this extension's own sidebar row.
const CF_MORE_CONTROL = /^(view all conversations|view all|show more|load more|older conversations|show older)$/;

function cfIsOwnUi(el) {
  return !!(el.closest('[data-folders-link]') || el.closest('.claude-folders-panel') || el.closest('.claude-folders-btn'));
}

function cfAdvanceChatList(root) {
  const control = Array.from(root.querySelectorAll('button, a')).find(el => {
    if (el.disabled || cfIsOwnUi(el)) return false;
    return CF_MORE_CONTROL.test(cfStripGlyphs(el.textContent).toLowerCase());
  });
  if (control) {
    control.click();
    return 'control';
  }

  const links = root.querySelectorAll('a[href*="/chat/"]');
  const last = links[links.length - 1];
  if (last) last.scrollIntoView({ block: 'end' });

  const scroller = cfFindScroller(root);
  if (!scroller) return last ? 'row' : 'none';

  const atBottom = scroller.scrollTop + scroller.clientHeight >= scroller.scrollHeight - 4;
  if (atBottom) return 'bottom';
  scroller.scrollTop = Math.min(scroller.scrollTop + Math.max(scroller.clientHeight, 400), scroller.scrollHeight);
  return 'scrolled';
}

async function cfCollectChatsByScrolling(rootEl, onProgress) {
  const root = rootEl || document.body;
  const seenIds = new Set();
  const collected = [];
  let stagnantRounds = 0;
  let lastCount = -1;

  for (let round = 0; round < 200; round++) {
    // Every chat link counts, including the sidebar's: duplicates are filtered by
    // id, and on a chat page the sidebar is the only list rendered
    const links = root.querySelectorAll('a[href*="/chat/"]');
    for (const link of links) {
      const record = cfParseChatLink(link);
      if (!record || seenIds.has(record.id)) continue;
      seenIds.add(record.id);
      collected.push(record);
    }

    if (onProgress) onProgress(collected.length);

    // Stop once the count stops growing across several scroll attempts
    if (collected.length === lastCount) {
      if (++stagnantRounds >= 4) break;
    } else {
      stagnantRounds = 0;
      lastCount = collected.length;
    }

    // 'bottom' means the container is scrolled out and nothing further loaded, so
    // the rendered list has no more rows to give
    const step = cfAdvanceChatList(root);
    if (step === 'none') break;
    if (step === 'bottom' && stagnantRounds >= 1) {
      console.log('[SCRAPER] The rendered list stops at', collected.length, 'rows and loads no more on scroll');
      break;
    }
    await new Promise(r => setTimeout(r, 1200));
  }

  console.log('[SCRAPER] Page reading collected', collected.length, 'chats from the rendered list');
  return collected;
}

// The watermark is the oldest stamp below which this account's history is known to
// be contiguous, written only by a run that actually reached the end of the list.
// An incremental sync reads back to it. Anchoring on the newest chat instead pinned
// the window to the last month forever, which is what made a sync stop at one page.
async function cfReadWatermark(orgId) {
  try {
    const key = cfWatermarkKey(orgId);
    const stored = await chrome.storage.local.get(key);
    return stored[key] ? String(stored[key]) : null;
  } catch (e) {
    return null;
  }
}

async function cfWriteWatermark(orgId, stamp) {
  if (!stamp) return;
  try {
    await chrome.storage.local.set({ [cfWatermarkKey(orgId)]: String(stamp) });
  } catch (e) {
    console.log('[SCRAPER] Could not store the watermark:', e.message);
  }
}

// Ids already held, so paging can keep going past the cutoff for as long as
// unimported conversations keep appearing
function cfHeldChatIds() {
  const held = new Set();
  folders.forEach(f => (f.chats || []).forEach(c => { if (c.id) held.add(c.id); }));
  return held;
}

// Collect conversations for this account. The list endpoint is authoritative and
// returns real timestamps newest-first, so a run that already holds recent history
// reads back one month past it and stops rather than walking to the first
// conversation again. The rendered page is read only when the endpoint is
// unreachable, and that path sees only the rows Claude has mounted.
async function cfCollectAllChats(rootEl, onProgress, fullResync) {
  if (window.chatExporter?.listConversationsAllOrgs) {
    try {
      const held = cfHeldChatIds();
      const result = await window.chatExporter.listConversationsAllOrgs((count, total) => {
        if (onProgress) onProgress(count, total, 'api');
      }, {
        overlapDays: CF_SYNC_OVERLAP_DAYS,
        cleanPagesToStop: CF_SYNC_CLEAN_PAGES,
        isKnown: (id) => held.has(id),
        watermarkFor: (orgId) => (fullResync ? null : cfReadWatermark(orgId))
      });

      for (const org of result.orgs) {
        if (org.error) {
          console.log('[SCRAPER]', org.name, 'failed:', org.error);
          continue;
        }
        console.log('[SCRAPER]', org.name + ':', org.collected, 'of', org.accountTotal,
          'in', org.pages, 'pages', org.stoppedEarly ? '(stopped at the watermark)' : '(read to the end)');
        // Only a run that walked to the end of one organization's list can claim
        // contiguous coverage of it
        if (org.reachedEnd && org.oldestStamp) await cfWriteWatermark(org.id, org.oldestStamp);
      }

      // Cowork sessions are listed in full on every sync, from the organizations read above
      const cowork = await cfCollectCoworkSessions(result.orgs.filter(o => !o.error));
      if (result.records.length || cowork.length) {
        const readToEnd = result.orgs.every(o => o.error || o.reachedEnd);
        console.log('[SCRAPER] Collected', result.records.length, 'conversations and', cowork.length, 'Cowork sessions across',
          result.orgs.length, 'organizations,', result.accountTotal, 'conversations on this login');
        return {
          chats: result.records.concat(cowork), source: 'api', stoppedEarly: !readToEnd,
          accountTotal: result.accountTotal, orgs: result.orgs, coworkCount: cowork.length
        };
      }
      console.log('[SCRAPER] The list endpoint returned no conversations, reading the page instead');
    } catch (e) {
      console.log('[SCRAPER] List endpoint failed:', e.message, '- reading the page instead');
    }
  }
  // Give the list a moment to render before reading it
  await new Promise(r => setTimeout(r, 2000));
  const scraped = await cfCollectChatsByScrolling(rootEl, (count) => {
    if (onProgress) onProgress(count, null, 'dom');
  });
  return { chats: scraped, source: 'dom', stoppedEarly: false, accountTotal: null, orgs: null, coworkCount: 0 };
}

async function scrapeAllChats() {
  console.log('[SCRAPER] Starting...');
  showNotification('Scraping chats...');

  monitoredNewChats.clear();
  chrome.storage.local.set({ [cfMonitorKey()]: [] });
  hideSyncNotification();

  const existingIds = new Set();
  folders.forEach(f => { if (f.chats) f.chats.forEach(c => existingIds.add(c.id)); });
  console.log('[SCRAPER] Existing chat IDs:', existingIds.size);

  const { chats: collected, source } = await cfCollectAllChats(document.body, (count, total) => {
    showNotification(total ? `Reading ${count} of ${total} chats...` : `Reading... ${count} chats found`);
  }, true);
  console.log('[SCRAPER] Collected', collected.length, 'chats via', source);
  const newChats = collected.filter(c => !existingIds.has(c.id));

  // Send everything: background adds new chats and refreshes changed metadata
  if (collected.length > 0) {
    try {
      await chrome.runtime.sendMessage({ action: 'scrapedChats', chats: collected });
    } catch (error) {
      console.log('[SCRAPER] Error:', error.message);
    }
  }

  showNotification(`Done! ${newChats.length} new, ${collected.length} scanned`);
  await loadData();
}

// A sync asked for while the data folder cannot be written is kept for this tab
// and started by the folderAccessChanged broadcast
const CF_SYNC_AFTER_ACCESS_KEY = 'cf-sync-after-access';

function cfRememberSyncRequest(exportAllMissing, fullResync) {
  sessionStorage.setItem(CF_SYNC_AFTER_ACCESS_KEY, JSON.stringify({ exportAllMissing: !!exportAllMissing, fullResync: !!fullResync }));
}

function cfTakeSyncRequest() {
  const raw = sessionStorage.getItem(CF_SYNC_AFTER_ACCESS_KEY);
  sessionStorage.removeItem(CF_SYNC_AFTER_ACCESS_KEY);
  try {
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

// Scrape specifically from the recents page (not sidebar)
// exportAllMissing: true = check ALL chats for missing MD (popup manual sync)
//                   false = only export newly scraped chats (passive 30 notification)
async function scrapeRecentsPage(exportAllMissing = false, fullResync = false) {
  // A sync runs only with a writable data folder. A request made without one is
  // kept and started once access is granted.
  const access = await cfCheckWriteAccess();
  if (!access.ok) {
    cfRememberSyncRequest(exportAllMissing, fullResync);
    console.log('[SCRAPER] Sync waiting for folder access:', access.error);
    if (access.code === 'no-folder' || access.code === 'permission') {
      cfPromptFolderAccess(access.code, access.folderName, access.permission);
    } else {
      showNotification('Sync stopped: ' + access.error, true);
    }
    return;
  }

  // The API listing works from any Claude page, so the recents detour only
  // happens when the API is unavailable and the rendered list is the only source
  const apiAvailable = !!window.chatExporter?.listAllConversations;
  if (!apiAvailable && !window.location.pathname.includes('/recents')) {
    console.log('[SCRAPER] No API listing available, moving to recents to read the page');
    sessionStorage.setItem('cf-pending-sync', 'true');
    window.location.href = 'https://claude.ai/recents';
    return;
  }
  
  // Mark sync in progress to suppress monitor notifications
  syncInProgress = true;
  
  // Hide any existing sync notification
  hideSyncNotification();
  const existingNotif = document.getElementById('cf-sync-notification');
  if (existingNotif) existingNotif.remove();
  const existingNotif2 = document.getElementById('claude-folders-sync-notification');
  if (existingNotif2) existingNotif2.remove();
  
  // Clear both monitor systems
  pendingNewChats = [];
  if (typeof monitoredNewChats !== 'undefined') {
    monitoredNewChats.clear();
    chrome.storage.local.set({ [cfMonitorKey()]: [] });
  }
  
  console.log('[SCRAPER] Sync starting');
  showSyncProgressBar('Reading your conversation list');

  // Get existing IDs from all folders
  const existingIds = new Set();
  folders.forEach(f => {
    if (f.chats) f.chats.forEach(c => existingIds.add(c.id));
  });
  console.log('[SCRAPER] Existing chat IDs:', existingIds.size);

  // Fallback root for the page-reading path (never the sidebar)
  const mainContent = document.querySelector('main') || document.body;

  const { chats: collected, source, stoppedEarly, accountTotal, orgs: orgSummaries, coworkCount } = await cfCollectAllChats(mainContent, (count, total) => {
    showSyncProgressBar(total ? `Reading ${count} of ${total} chats...` : `Reading... ${count} chats found`);
  }, fullResync);
  // scrapedChats = the genuinely new ones (used below for passive export + counts)
  const scrapedChats = collected.filter(c => !existingIds.has(c.id));
  console.log('[SCRAPER] Collected', collected.length, 'chats via', source, '-', scrapedChats.length, 'new', stoppedEarly ? '(incremental)' : '(full)');
  if (source === 'dom') {
    showNotification(`Read the page instead of the conversation list, so this run covers only the ${collected.length} rows Claude had rendered`, true);
  }

  // Send everything: background adds new chats and refreshes changed metadata
  if (collected.length > 0) {
    try {
      await chrome.runtime.sendMessage({ action: 'scrapedChats', chats: collected });
      // Update known IDs so the passive monitor doesn't re-flag these
      collected.forEach(c => knownChatIds.add(c.id));
      await chrome.storage.local.set({ [cfKnownKey()]: Array.from(knownChatIds) });
    } catch (error) {
      console.log('[SCRAPER] Error:', error.message);
    }
  }
  
  await loadData();
  
  // Refresh known IDs from updated folders so monitor doesn't re-detect
  await loadKnownChatIds();
  
  // Clear any pending new chats that accumulated during sync
  pendingNewChats = [];
  await chrome.storage.local.set({ [cfPendingKey()]: [] });
  if (typeof monitoredNewChats !== 'undefined') {
    monitoredNewChats.clear();
    await chrome.storage.local.set({ [cfMonitorKey()]: [] });
  }
  
  // Exports for the chats this run covers, written by the shared export runner
  let chatsToExport = [];
  if (exportAllMissing) {
    folders.forEach(f => (f.chats || []).forEach(c => chatsToExport.push(c)));
  } else {
    chatsToExport = scrapedChats;
  }

  // The organizations this run read are the ones this login can export from
  const readableOrgIds = orgSummaries && orgSummaries.some(org => !org.error)
    ? new Set(orgSummaries.filter(org => !org.error).map(org => org.id))
    : null;

  let outcome = null;
  if (chatsToExport.length > 0) {
    outcome = await cfExportChatList(chatsToExport, {
      readableOrgIds,
      onCheck: (count) => {
        showSyncProgressBar(`Checking ${count} chat${count === 1 ? '' : 's'} against the files on disk...`);
      },
      onProgress: (done, total, chat) => {
        showSyncProgressBar(`Exporting ${done} of ${total}: ${String(chat.title || 'Untitled').substring(0, 30)}`);
      }
    });
  }

  // Mark sync complete
  syncInProgress = false;
  
  // The account total counts conversations; Cowork sessions are added to it
  const chatTotal = accountTotal || (collected.length - coworkCount);
  showSyncSuccessModal(scrapedChats.length, chatTotal + coworkCount, outcome, orgSummaries, coworkCount);
}
