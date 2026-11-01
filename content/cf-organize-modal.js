// content/cf-organize-modal.js
// Shows the Apply Claude's Response modal, which files the chats from Claude's organize answer.
// Globals: showApplyCategoriesModal
// Depends on: lib/organize-apply.js (applyCategorization), lib/organize-json.js (cfParseOrganizeJson), content/cf-state.js, content/cf-account.js
//             (cfOrganizeIndexKey), content/cf-notify.js, content/cf-text.js (cfEscapeHtml), content/cf-panel.js
// Notes: docs/notes/content/cf-organize-modal.js.md

// prefill: Claude's answer read from the page by the one-click organize (content/cf-organize-auto.js). It is
// previewed at once, and Apply & Save stays a click of the person's.
async function showApplyCategoriesModal(prefill) {
  const fromPage = typeof prefill === 'string';
  // The numbers in Claude's answer resolve through the index stored by the last request, which can
  // be newer than this tab's copy when the request was started from the popup or another tab
  const stored = await chrome.storage.local.get(cfOrganizeIndexKey());
  const idx = stored[cfOrganizeIndexKey()];
  if (Array.isArray(idx) && idx.length) cfOrganizeIndex = idx;

  const overlay = document.createElement('div');
  overlay.className = 'categories-modal-overlay';
  overlay.innerHTML = `
    <div class="categories-modal">
      <div class="categories-modal-header">
        <h3>Apply Claude's Categories</h3>
        <button class="modal-close-btn" aria-label="Close">×</button>
      </div>
      <div class="categories-modal-body">
        <p>${fromPage ? "Claude's answer in this chat:" : "Paste Claude's JSON response below:"}</p>
        <textarea id="categoriesJsonInput" placeholder='{"categories": [{"name": "...", "folders": [...]}]}'></textarea>
        <div class="modal-stats" id="modalStats">Step 1: Paste the JSON, then click Preview Categories.</div>
      </div>
      <div class="categories-modal-footer">
        <button class="modal-btn cancel-btn">Cancel</button>
        <button class="modal-btn preview-btn" id="previewBtn">Preview Categories</button>
        <button class="modal-btn apply-btn" id="applyBtn" disabled title="Preview the categories first">Apply & Save</button>
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
      const json = cfParseOrganizeJson(textarea.value);
      previewResult = applyCategorization(json, { folders, categories, chats: allChats, index: cfOrganizeIndex });

      const totalChats = previewResult.folders.reduce((sum, f) => sum + f.chats.length, 0);
      const byCategory = {};
      previewResult.folders.forEach(f => { byCategory[f.category] = (byCategory[f.category] || 0) + f.chats.length; });
      let statsHtml = `<strong>Preview:</strong> ${previewResult.categories.length} categories, ${previewResult.folders.length} folders, ${totalChats} chats<br><br>`;
      Object.entries(byCategory).forEach(([cat, count]) => { statsHtml += `${cfEscapeHtml(cat)}: ${count} chat${count === 1 ? '' : 's'}<br>`; });
      statsHtml += fromPage ? '<br>Click Apply & Save to file the chats into these folders.' : '<br>Step 2: Click Apply & Save to finish.';
      statsDiv.innerHTML = statsHtml;

      previewBtn.classList.add('done');
      previewBtn.textContent = 'Previewed';
      applyBtn.disabled = false;
      applyBtn.classList.add('ready');
    } catch (e) {
      statsDiv.innerHTML = `<strong>Not previewed:</strong> ${cfEscapeHtml(e.message)}`;
      applyBtn.disabled = true;
    }
  });

  applyBtn.addEventListener('click', async () => {
    if (!previewResult) return;
    applyBtn.textContent = 'Saving...';
    applyBtn.disabled = true;
    try {
      folders = previewResult.folders;
      categories = previewResult.categories;
      allChats = [];
      folders.forEach(f => { if (f.chats) allChats.push(...f.chats); });
      if (typeof metadata === 'undefined' || !metadata) metadata = {};

      const dataToSave = { folders, categories, metadata };
      await chrome.storage.local.set({ cachedData: dataToSave });
      await new Promise((resolve) => {
        chrome.runtime.sendMessage({ action: 'saveData', data: dataToSave }, () => {
          if (chrome.runtime.lastError) console.log('[ORGANIZE] Save message failed:', chrome.runtime.lastError.message);
          resolve();
        });
      });

      overlay.remove();
      showNotification(`Organized ${allChats.length} chats into ${folders.length} folders.`);
      const panel = document.querySelector('.claude-folders-panel');
      if (panel) renderPanelContent(panel);
    } catch (e) {
      console.log('[ORGANIZE] Apply failed:', e.message);
      showNotification('The categories were not saved: ' + e.message, true);
      applyBtn.textContent = 'Apply & Save';
      applyBtn.disabled = false;
    }
  });

  if (fromPage) {
    textarea.value = prefill;
    previewBtn.click();
  }
}
