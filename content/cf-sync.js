// Claude Folders content script - conversation collection, sync and export runs

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

      if (result.records.length) {
        const readToEnd = result.orgs.every(o => o.error || o.reachedEnd);
        console.log('[SCRAPER] Collected', result.records.length, 'conversations across',
          result.orgs.length, 'organizations,', result.accountTotal, 'on this login');
        return { chats: result.records, source: 'api', stoppedEarly: !readToEnd, accountTotal: result.accountTotal, orgs: result.orgs };
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
  return { chats: scraped, source: 'dom', stoppedEarly: false, accountTotal: null, orgs: null };
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

// Read the export folder once and key it by chat-id prefix, which is the part of
// the filename that never changes when a chat is renamed
async function cfLoadExportedPrefixes() {
  const prefixes = new Set();
  try {
    const response = await chrome.runtime.sendMessage({ action: 'listExports' });
    (response?.files || []).forEach(name => {
      const match = String(name).match(/^([a-f0-9]{8})_/i);
      if (match) prefixes.add(match[1].toLowerCase());
    });
    console.log('[SCRAPER] Found', prefixes.size, 'chats already exported to disk');
  } catch (e) {
    console.log('[SCRAPER] Could not list exports:', e.message);
  }
  return prefixes;
}

// Scrape specifically from the recents page (not sidebar)
// exportAllMissing: true = check ALL chats for missing MD (popup manual sync)
//                   false = only export newly scraped chats (passive 30 notification)
async function scrapeRecentsPage(exportAllMissing = false, fullResync = false) {
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

  const { chats: collected, source, stoppedEarly, accountTotal, orgs: orgSummaries } = await cfCollectAllChats(mainContent, (count, total) => {
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
  
  // Now export chats to markdown
  let exportSuccess = 0;
  let exportSkipped = 0;
  let exportEmpty = 0;
  let exportFail = 0;
  let exportUnavailable = 0;
  
  // Determine which chats to check for MD export
  let chatsToExport = [];
  if (exportAllMissing) {
    // Manual sync from popup: check ALL chats in folders for missing MD
    folders.forEach(f => {
      if (f.chats) {
        f.chats.forEach(c => chatsToExport.push(c));
      }
    });
  } else {
    // Passive sync (30 notification): only export newly scraped chats
    chatsToExport = scrapedChats;
  }
  
  // Every reason an export did not produce a file, counted by reason. The loop
  // used to fold a thrown error, a refused disk write and a genuinely empty chat
  // into one "empty chats" number, which named the wrong cause for every failure
  // that was not emptiness.
  const failureReasons = new Map();
  const noteFailure = (reason) => {
    const key = String(reason || 'unknown').slice(0, 120);
    failureReasons.set(key, (failureReasons.get(key) || 0) + 1);
  };

  if (chatsToExport.length > 0 && window.chatExporter) {
    showSyncProgressBar(`Checking ${chatsToExport.length} chats for missing exports...`);

    // One directory read instead of one message per chat, and matching on the id
    // prefix rather than the whole filename so a chat whose title changed since
    // its export is recognized as already on disk rather than written again
    const exportedPrefixes = await cfLoadExportedPrefixes();
    const unavailable = await cfLoadUnavailableChats();

    for (let i = 0; i < chatsToExport.length; i++) {
      const chat = chatsToExport[i];
      const chatId = String(chat && chat.id || '');
      const chatTitle = String(chat && chat.title || 'Untitled');
      showSyncProgressBar(`Exporting ${i + 1} of ${chatsToExport.length}: ${chatTitle.substring(0, 30)}`);

      if (chatId.length < 8) {
        exportUnavailable++;
        await cfMarkChatUnavailable(chatTitle, 'stored record has no id');
        continue;
      }

      if (unavailable[chatId]) {
        exportUnavailable++;
        continue;
      }

      if (cfIsCoworkId(chatId)) {
        // A Cowork session has no conversation endpoint, so there is no transcript
        // to write. Counted as unavailable rather than attempted and failed.
        exportUnavailable++;
        continue;
      }

      try {
        if (exportedPrefixes.has(chatId.substring(0, 8).toLowerCase())) {
          exportSkipped++;
          await markChatAsExported(chatId);
          continue;
        }

        const result = await window.chatExporter.exportChatById(chatId, chatTitle, chat && chat.orgId);

        if (result.success && result.markdown) {
          const saveResponse = await chrome.runtime.sendMessage({
            action: 'saveExport',
            filename: result.filename,
            content: result.markdown
          });

          if (saveResponse?.success) {
            exportSuccess++;
            exportedPrefixes.add(chatId.substring(0, 8).toLowerCase());
            await markChatAsExported(chatId);
          } else {
            exportFail++;
            const reason = 'disk write: ' + (saveResponse?.error || 'no response from the writer');
            noteFailure(reason);
            console.log('[SCRAPER]', reason, '-', chatId, chatTitle);
          }
        } else {
          // A chat with no messages is not a failure; anything else is
          const reason = result.error || 'no markdown returned';
          if (/no messages/i.test(reason)) {
            exportEmpty++; // counted on its own line, so it is not repeated in the tally
          } else if (/in any of the \d+ readable organizations/i.test(reason)) {
            // The account no longer has this conversation, so it is recorded once
            // rather than retried on every sync from here on
            exportUnavailable++;
            await cfMarkChatUnavailable(chatId, reason);
            console.log('[SCRAPER] No longer on the account:', chatId, chatTitle);
          } else {
            exportFail++;
            noteFailure(reason);
            console.log('[SCRAPER] No file for', chatId, chatTitle, '-', reason);
          }
        }
      } catch (e) {
        exportFail++;
        noteFailure(e.message || 'threw without a message');
        console.log('[SCRAPER] Export threw for', chatId, chatTitle, '-', e.message);
      }

      // Rate limit
      await new Promise(r => setTimeout(r, 300));
    }

    if (failureReasons.size) {
      console.log('[SCRAPER] Export outcomes by reason:', Array.from(failureReasons.entries()).map(([r, n]) => n + ' x ' + r).join(' | '));
    }
  } else if (chatsToExport.length > 0) {
    noteFailure('the export module was not loaded on this page');
    console.log('[SCRAPER] window.chatExporter missing, nothing was exported');
  }
  
  // Mark sync complete
  syncInProgress = false;
  
  // Show success modal
  showSyncSuccessModal(scrapedChats.length, exportSuccess, exportSkipped, exportEmpty, accountTotal || collected.length, exportFail, failureReasons, orgSummaries, exportUnavailable);
}

function showSyncSuccessModal(totalChats, exportSuccess, exportSkipped, exportEmpty, scannedTotal, exportFail, failureReasons, orgSummaries, exportUnavailable) {
  // One login can hold several organizations, and Claude's own list page shows only
  // the active one, so a single total invites arithmetic by hand. The breakdown says
  // where the number comes from.
  const orgLines = (orgSummaries || [])
    .filter(org => org && !org.error)
    .map(org => `${cfEscapeHtml(org.name)}: ${org.accountTotal}`);
  // Surface the actual reasons in the summary, so a run that wrote nothing says
  // why instead of reporting every chat as empty
  const reasonLines = Array.from((failureReasons || new Map()).entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([reason, count]) => `${count} x ${cfEscapeHtml(reason)}`);
  // Remove progress bar
  const progressBar = document.getElementById('cf-sync-progress');
  if (progressBar) progressBar.remove();
  
  const existing = document.querySelector('.sync-success-modal');
  if (existing) existing.remove();
  
  const modal = document.createElement('div');
  modal.className = 'sync-success-modal';
  modal.innerHTML = `
    <div style="
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.7);
      z-index: 100000;
      display: flex;
      align-items: center;
      justify-content: center;
    ">
      <div style="
        background: #2a2a28;
        border: 1px solid #3d3d3a;
        border-radius: 16px;
        padding: 32px;
        max-width: 400px;
        text-align: center;
        box-shadow: 0 8px 32px rgba(0,0,0,0.5);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      ">
        <div style="
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #10b981, #059669);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
        ">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="3">
            <path d="M20 6L9 17l-5-5"/>
          </svg>
        </div>
        <h2 style="color: #e8e6e3; margin: 0 0 12px; font-size: 24px;">Sync Complete!</h2>
        <div style="color: #9c9a92; font-size: 15px; line-height: 1.6; margin-bottom: 24px;">
          <div style="margin-bottom: 8px;">
            <span style="color: #10b981; font-weight: 600;">${totalChats}</span> new chats imported${scannedTotal ? ` of ${scannedTotal}${orgLines.length > 1 ? ` across ${orgLines.length} organizations` : ' on the account'}` : ''}
          </div>
          <div style="margin-bottom: 8px;">
            <span style="color: #10b981; font-weight: 600;">${exportSuccess}</span> exported to markdown
          </div>
          ${exportSkipped > 0 ? `
            <div style="margin-bottom: 8px; color: #9c9a92;">
              ${exportSkipped} already exported (skipped)
            </div>
          ` : ''}
          ${exportEmpty > 0 ? `
            <div style="margin-bottom: 8px; color: #9c9a92;">
              ${exportEmpty} empty chats (no content)
            </div>
          ` : ''}
          ${exportUnavailable > 0 ? `
            <div style="margin-bottom: 8px; color: #9c9a92;">
              ${exportUnavailable} no longer on the account
            </div>
          ` : ''}
          ${exportFail > 0 ? `
            <div style="margin-bottom: 8px; color: #f59e0b;">
              ${exportFail} did not produce a file
            </div>
          ` : ''}
          ${orgLines.length > 1 ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #3d3d3a; color: #9c9a92; font-size: 13px; text-align: left;">
              ${orgLines.map(line => `<div style="margin-bottom: 4px;">${line}</div>`).join('')}
            </div>
          ` : ''}
          ${reasonLines.length ? `
            <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid #3d3d3a; color: #9c9a92; font-size: 13px; text-align: left;">
              ${reasonLines.map(line => `<div style="margin-bottom: 4px;">${line}</div>`).join('')}
            </div>
          ` : ''}
        </div>
        <button id="syncSuccessClose" style="
          background: linear-gradient(135deg, #d97706, #b45309);
          border: none;
          color: white;
          padding: 12px 32px;
          border-radius: 8px;
          font-size: 15px;
          font-weight: 600;
          cursor: pointer;
          transition: transform 0.15s;
        ">Done</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(modal);
  
  modal.querySelector('#syncSuccessClose').addEventListener('click', () => {
    modal.remove();
  });
  
  // Also close on backdrop click
  modal.addEventListener('click', (e) => {
    if (e.target === modal.firstElementChild) {
      modal.remove();
    }
  });
}
