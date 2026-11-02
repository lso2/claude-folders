// popup/popup-organize-modal.js
// Shows the popup's Apply Claude's Categories modal, which files the chats from Claude's pasted organize answer.
// Globals: showApplyCategoriesModal
// Depends on: lib/organize-apply.js (applyCategorization), lib/organize-json.js (cfParseOrganizeJson), popup/popup-organize.js (popupOrganizeIndexKey),
//             popup/popup.js (state, saveData), popup/popup-folders.js (renderFolders, renderCategoryFilters, updateStats),
//             lib/page-dialog.js (cfPageNotice)
// Notes: docs/notes/popup/popup-organize-modal.js.md

function showApplyCategoriesModal() {
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
        <button class="modal-close" aria-label="Close" style="background: none; border: none; color: #9c9a92; font-size: 24px; cursor: pointer;">×</button>
      </div>
      <div style="padding: 20px; flex: 1; overflow-y: auto;">
        <p style="color: #9c9a92; margin: 0 0 12px;">Paste Claude's JSON response:</p>
        <textarea id="applyJsonInput" style="width: 100%; height: 150px; background: #1a1a18; border: 1px solid #3d3d3a; border-radius: 8px; color: #e8e6e3; font-family: monospace; font-size: 12px; padding: 12px; resize: vertical; box-sizing: border-box;" placeholder='{"categories": [...]}'></textarea>
        <div id="applyStats" style="margin-top: 12px; padding: 12px; background: #1a1a18; border-radius: 8px; font-size: 13px; color: #e8e6e3;">Step 1: Paste the JSON, then click Preview Categories.</div>
      </div>
      <div style="padding: 16px 20px; border-top: 1px solid #3d3d3a; display: flex; justify-content: flex-end; gap: 10px;">
        <button class="modal-cancel" style="padding: 10px 20px; background: #3d3d3a; border: none; border-radius: 6px; color: #e8e6e3; cursor: pointer;">Cancel</button>
        <button id="previewBtn" style="padding: 10px 20px; background: var(--cf-orange); border: none; border-radius: 6px; color: #fff; cursor: pointer;">Preview Categories</button>
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
  const esc = (s) => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  overlay.querySelector('.modal-close').addEventListener('click', () => overlay.remove());
  overlay.querySelector('.modal-cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

  previewBtn.addEventListener('click', async () => {
    try {
      const json = cfParseOrganizeJson(textarea.value);
      if (allChats.length === 0) throw new Error('there are no chats in the folders. Run a sync first.');

      // The numbers in Claude's answer resolve through the index stored by the last request
      const key = await popupOrganizeIndexKey();
      const index = (await chrome.storage.local.get(key))[key] || [];
      previewResult = applyCategorization(json, { folders, categories, chats: allChats, index });

      const totalChats = previewResult.folders.reduce((sum, f) => sum + f.chats.length, 0);
      const byCategory = {};
      previewResult.folders.forEach(f => { byCategory[f.category] = (byCategory[f.category] || 0) + f.chats.length; });
      let statsHtml = `<strong>Preview:</strong> ${previewResult.categories.length} categories, ${previewResult.folders.length} folders, ${totalChats} chats<br><br>`;
      Object.entries(byCategory).forEach(([cat, count]) => { statsHtml += `${esc(cat)}: ${count} chat${count === 1 ? '' : 's'}<br>`; });
      statsHtml += '<br>Step 2: Click Apply & Save to finish.';
      statsDiv.innerHTML = statsHtml;

      previewBtn.style.background = '#3d3d3a';
      previewBtn.style.color = '#9c9a92';
      previewBtn.textContent = 'Previewed';
      applyBtn.disabled = false;
      applyBtn.style.background = 'var(--cf-orange)';
      applyBtn.style.color = '#fff';
      applyBtn.style.cursor = 'pointer';
      applyBtn.style.opacity = '1';
    } catch (e) {
      statsDiv.innerHTML = `<strong>Not previewed:</strong> ${esc(e.message)}`;
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
    cfPageNotice(`Organized ${allChats.length} chats into ${folders.length} folders.`);
  });
}
