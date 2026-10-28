// content/cf-pending.js
// Finishes work that a previous page started before navigating here: a sync or an organize prompt.
// Globals: checkPendingSync, checkPendingOrganizeData, pasteOrganizePrompt
// Notes: docs/notes/content/cf-pending.js.md

async function checkPendingSync() {
  // Check if we navigated here to run a sync
  if (sessionStorage.getItem('cf-pending-sync') === 'true') {
    sessionStorage.removeItem('cf-pending-sync');
    console.log('[CONTENT] Running pending sync after navigation to recents');
    
    // Only run if we're actually on recents page
    if (window.location.pathname.includes('/recents')) {
      // Wait for page to fully load
      setTimeout(() => scrapeRecentsPage(), 2000);
    } else {
      console.log('[CONTENT] Not on recents page, skipping sync');
    }
  }
}

async function checkPendingOrganizeData() {
  // Only on /new page
  if (!window.location.pathname.includes('/new')) return;
  
  try {
    const result = await chrome.storage.local.get(['pendingOrganizePrompt', 'pendingOrganizeAnalysis']);
    if (!result.pendingOrganizePrompt) return;
    
    console.log('[CONTENT] Found pending organize prompt, will paste...');
    
    // Clear it immediately so it doesn't paste again on refresh
    await chrome.storage.local.remove(['pendingOrganizePrompt', 'pendingOrganizeAnalysis']);
    
    // Wait for the input to be ready
    setTimeout(async () => {
      await pasteOrganizePrompt(result.pendingOrganizePrompt);
    }, 2000);
  } catch (e) {
    console.log('[CONTENT] Error checking pending data:', e.message);
  }
}

async function pasteOrganizePrompt(prompt) {
  await new Promise(r => setTimeout(r, 1500));
  
  const textInput = document.querySelector('[contenteditable="true"]') || 
                    document.querySelector('textarea') ||
                    document.querySelector('.ProseMirror');
  
  if (textInput) {
    if (textInput.tagName === 'TEXTAREA') {
      textInput.value = prompt;
      textInput.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
      textInput.focus();
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, prompt);
    }
    showNotification('Prompt pasted! Send to Claude, then use "Apply Response" button.');
  } else {
    navigator.clipboard.writeText(prompt);
    showNotification('Prompt copied to clipboard - paste it manually');
  }
}
