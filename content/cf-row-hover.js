// content/cf-row-hover.js
// Gives the Folders row in Claude's sidebar its own hover look while the Folders panel is open.
// Globals: CF_HOVER_PROPS, cfRowHoverStyle, cfCollectHoverRules, cfHoverDeclarations, cfSetFoldersRowOpen
// Depends on: content/cf-sidebar.js (the a[data-folders-link] row, cloned from one of Claude's rows)
// Notes: docs/notes/content/cf-row-hover.js.md

// The properties copied from the row's :hover rules. Custom properties (--name) are copied too,
// since Claude's hover colors read them.
const CF_HOVER_PROPS = ['background-color', 'color'];
// { found: { property: value }, checked, unreadable } from the last read that found declarations
let cfRowHoverStyle = null;

// Every style rule with :hover, inside media, layer, supports and nested rules. A nested
// selector's & is the enclosing rule's selector.
function cfCollectHoverRules(rules, parentSelector, out) {
  for (const rule of Array.from(rules || [])) {
    let selector = parentSelector;
    if (typeof rule.selectorText === 'string') {
      selector = parentSelector && rule.selectorText.includes('&')
        ? rule.selectorText.replace(/&/g, `:is(${parentSelector})`)
        : rule.selectorText;
      if (selector.includes(':hover') && rule.style) out.push({ selector, style: rule.style });
    }
    if (rule.cssRules && rule.cssRules.length) cfCollectHoverRules(rule.cssRules, selector, out);
  }
}

// The declarations of the page's :hover rules that match the row once :hover is taken out of their
// selector. A style sheet from another origin cannot be read and is counted as unreadable.
function cfHoverDeclarations(link) {
  const rules = [];
  let unreadable = 0;
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      cfCollectHoverRules(sheet.cssRules, null, rules);
    } catch (e) {
      unreadable++;
    }
  }
  const found = {};
  for (const { selector, style } of rules) {
    let matched = false;
    try {
      matched = link.matches(selector.replace(/:hover/g, ''));
    } catch (e) {
      continue; // a selector such as :not(:hover) is not valid without :hover
    }
    if (!matched) continue;
    for (let i = 0; i < style.length; i++) {
      const name = style[i];
      if (CF_HOVER_PROPS.includes(name) || name.startsWith('--')) found[name] = style.getPropertyValue(name);
    }
  }
  return { found, checked: rules.length, unreadable };
}

// open true: the row shows its hover look and aria-expanded true. open false: both are taken off.
function cfSetFoldersRowOpen(open) {
  const link = document.querySelector('a[data-folders-link="true"]');
  if (!link) return;
  link.setAttribute('aria-expanded', String(open));
  if (open && !(cfRowHoverStyle && Object.keys(cfRowHoverStyle.found).length)) {
    cfRowHoverStyle = cfHoverDeclarations(link);
    const names = Object.keys(cfRowHoverStyle.found);
    if (names.length) console.log('[PANEL] Folders row hover look read:', names.join(', '));
    else console.log('[PANEL] No :hover rule matched the Folders row among', cfRowHoverStyle.checked, 'hover rules;', cfRowHoverStyle.unreadable, 'style sheets could not be read');
  }
  Object.entries((cfRowHoverStyle && cfRowHoverStyle.found) || {}).forEach(([name, value]) => {
    if (open) link.style.setProperty(name, value);
    else link.style.removeProperty(name);
  });
}
