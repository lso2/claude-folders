// content/cf-account-info.js
// Reads the signed-in name, initial and team from Claude's account row for the panel header.
// Globals: scrapeUserInfo
// Depends on: content/cf-text.js (cfStripGlyphs)
// Notes: docs/notes/content/cf-account-info.js.md

// The row's class names change often, so the values come from its leaf text spans:
// the one-character avatar, then the name, then the team
function scrapeUserInfo() {
  const tryCount = [1000, 3000, 6000];

  tryCount.forEach(delay => {
    setTimeout(() => {
      try {
        const userBtn = document.querySelector('[data-testid="user-menu-button"]');
        if (!userBtn) {
          console.log('[CONTENT] Account row not found yet');
          return;
        }

        const parts = Array.from(userBtn.querySelectorAll('span'))
          .filter(span => !span.querySelector('span'))
          .map(span => cfStripGlyphs(span.textContent))
          .filter(text => text.length > 0 && !/^[\u00b7\u2022|,\-\u2013\u2014/]+$/.test(text));

        let userInitial = '';
        if (parts.length && Array.from(parts[0]).length === 1) userInitial = parts.shift();
        const userName = parts[0] || '';
        const userTeam = parts[1] || '';
        if (!userInitial && userName) userInitial = Array.from(userName)[0].toUpperCase();

        console.log('[CONTENT] Account:', userName, '/', userTeam, '/', userInitial);

        if (userName) {
          chrome.runtime.sendMessage({
            action: 'updateMetadata',
            metadata: { userName, userInitial: userInitial || 'U', userTeam }
          }).catch(() => {});
        }
      } catch (e) {
        console.log('[CONTENT] Account read error:', e.message);
      }
    }, delay);
  });
}
