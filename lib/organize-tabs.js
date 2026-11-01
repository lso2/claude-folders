// lib/organize-tabs.js
// Opens /new for Ask Claude to Organize with the request stored under the tab's id until it is pasted there.
// Globals: cfStartOrganizeTab, cfOrganizePromptFor, cfForgetOrganizePrompt
// Depends on: lib/tab-handoff.js (cfOpenTabWithHandoff, cfHandoffFor, cfForgetHandoff)
// Notes: docs/notes/lib/organize-tabs.js.md

// auto: the tab also sends the request and opens Claude's answer for applying (content/cf-organize-auto.js)
async function cfStartOrganizeTab(prompt, auto) {
  if (!prompt) return { success: false, error: 'The organize request had no prompt' };
  const tabId = await cfOpenTabWithHandoff('organize', { prompt: String(prompt), auto: !!auto }, 'https://claude.ai/new');
  return { success: true, tabId };
}

// Read on every load of the tab until the paste is reported, so a reload before the paste finds it again
async function cfOrganizePromptFor(tabId) {
  const payload = await cfHandoffFor('organize', tabId);
  return { success: true, prompt: payload ? payload.prompt : null, auto: !!(payload && payload.auto) };
}

async function cfForgetOrganizePrompt(tabId) {
  await cfForgetHandoff(tabId);
}
