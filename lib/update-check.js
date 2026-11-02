// lib/update-check.js
// Reads the version published on GitHub and compares it with the running one.
// Loaded by the background (CF_BACKGROUND_FILES in background.js).
// Globals: CF_UPDATE_SOURCE_URL, CF_UPDATE_CHECK_MS, cfCompareVersions, cfCheckForUpdate
// Depends on: lib/storage-keys.js (UPDATE_CHECK_KEY, UPDATE_DISMISSED_KEY)
// Notes: docs/notes/lib/update-check.js.md

// The manifest of the repository's main branch, whose root is the extension. GitHub serves it to any origin.
const CF_UPDATE_SOURCE_URL = 'https://raw.githubusercontent.com/lso2/claude-folders/main/manifest.json';
// A stored answer younger than this is reused; Check for updates asks again
const CF_UPDATE_CHECK_MS = 6 * 60 * 60 * 1000;

// 1 when a is the newer version, -1 when b is, 0 when equal; missing parts count as 0
function cfCompareVersions(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

// A failed request keeps the version read before and records its error
async function cfCheckForUpdate(force) {
  const current = chrome.runtime.getManifest().version;
  const stored = await chrome.storage.local.get([UPDATE_CHECK_KEY, UPDATE_DISMISSED_KEY]);
  let record = stored[UPDATE_CHECK_KEY] || null;
  if (force || !record || Date.now() - record.checkedAt > CF_UPDATE_CHECK_MS) {
    try {
      const res = await fetch(CF_UPDATE_SOURCE_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`GitHub answered ${res.status} for manifest.json`);
      const latest = String((await res.json()).version || '');
      if (!latest) throw new Error('The manifest.json on GitHub has no version');
      record = { checkedAt: Date.now(), latest, error: null };
    } catch (e) {
      console.log('[UPDATE CHECK]', e.message);
      record = { checkedAt: Date.now(), latest: record ? record.latest : null, error: e.message };
    }
    await chrome.storage.local.set({ [UPDATE_CHECK_KEY]: record });
  }
  const available = !!record.latest && cfCompareVersions(record.latest, current) > 0;
  return {
    success: true, current, latest: record.latest, available, checkedAt: record.checkedAt, error: record.error,
    dismissed: available && stored[UPDATE_DISMISSED_KEY] === record.latest
  };
}
