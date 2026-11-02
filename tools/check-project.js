// tools/check-project.js
// Project checker: proves every source file is loaded, parses, fits the size limit and carries its header.
// Run with: node tools/check-project.js  (exit code 1 when a check fails)
// Globals: none (Node script)
// Notes: docs/notes/tools/check-project.js.md

const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

const ROOT = path.resolve(__dirname, '..');
// The notes are kept outside the repository, in the docs folder beside it.
// Each header's "docs/notes/..." pointer is read from that folder.
const DOCS_ROOT = path.resolve(ROOT, '..', 'docs');
const SIZE_LIMIT = 30 * 1024;
const IGNORED_DIRS = new Set(['.git', 'node_modules', 'docs', '.bak', '.complete', '.run', '_scripts', '.not__current']);
const PAGES = ['popup/popup.html', 'organizer/index.html', 'organizer/export-view.html', 'offscreen.html', 'access/index.html', 'standalone/index.html', 'standalone/view.html', 'update/index.html', 'settings/index.html'];
// Node tools are run by hand, so this list is their load list
const NODE_TOOLS = ['tools/check-project.js'];
// standalone/data.js is written into the user's data folder at runtime, never shipped
const RUNTIME_GENERATED = ['standalone/data.js'];
// lib/data-file.js copies these shipped files beside the standalone viewer at runtime
const RUNTIME_COPIES = {
  'standalone/chat-markdown.js': 'lib/chat-markdown.js',
  'standalone/page-dialog.js': 'lib/page-dialog.js',
  'standalone/html-escape.js': 'lib/html-escape.js',
  'standalone/export-render.js': 'lib/export-render.js',
  'standalone/export-page.js': 'lib/export-page.js',
  'standalone/color-variants.js': 'lib/color-variants.js',
  'standalone/select-size.js': 'lib/select-size.js',
  'standalone/storage-keys.js': 'lib/storage-keys.js',
  'standalone/sidebar-layout.js': 'lib/sidebar-layout.js',
  'standalone/search-words.js': 'lib/search-words.js',
  'standalone/search-store.js': 'lib/search-store.js',
  'standalone/search-index.js': 'lib/search-index.js',
  'standalone/account-view.js': 'lib/account-view.js',
  'standalone/account-entries.js': 'lib/account-entries.js',
  'standalone/account-file-list.js': 'lib/account-file-list.js',
  'standalone/accounts.js': 'organizer/accounts.js',
  'standalone/folders.js': 'organizer/folders.js',
  'standalone/chats.js': 'organizer/chats.js',
  'standalone/chat-rows.js': 'organizer/chat-rows.js',
  'standalone/chat-sort.js': 'organizer/chat-sort.js',
  'standalone/home-views.js': 'organizer/home-views.js',
  'standalone/analytics.js': 'organizer/analytics.js',
  'standalone/content-index.js': 'organizer/content-index.js',
  'standalone/content-sort.js': 'organizer/content-sort.js',
  'standalone/content-search.js': 'organizer/content-search.js',
  'standalone/view-controls.js': 'organizer/view-controls.js'
};

const problems = [];
const report = (msg) => problems.push(msg);
const rel = (p) => path.relative(ROOT, p).split(path.sep).join('/');

function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name) && !/backup/i.test(entry.name)) walk(path.join(dir, entry.name), out);
    } else {
      out.push(rel(path.join(dir, entry.name)));
    }
  }
  return out;
}

function pageScripts(page) {
  const html = fs.readFileSync(path.join(ROOT, page), 'utf8');
  const dir = path.posix.dirname(page);
  const list = [];
  const re = /<script\s+src="([^"]+)"/g;
  let m;
  while ((m = re.exec(html))) list.push(path.posix.normalize(path.posix.join(dir, m[1])));
  return list.map(file => RUNTIME_COPIES[file] || file);
}

function topLevelNames(file) {
  const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  const names = [];
  for (const node of ast.body) {
    if (node.type === 'FunctionDeclaration') names.push({ name: node.id.name, kind: 'function' });
    if (node.type === 'ClassDeclaration') names.push({ name: node.id.name, kind: 'class' });
    if (node.type === 'VariableDeclaration') {
      node.declarations.forEach(d => { if (d.id.type === 'Identifier') names.push({ name: d.id.name, kind: node.kind }); });
    }
  }
  return names;
}

// The value of a top-level const in a file, when it is a literal or an array of literals
function topLevelConst(file, name) {
  const ast = acorn.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'), { ecmaVersion: 'latest', sourceType: 'script' });
  for (const node of ast.body) {
    if (node.type !== 'VariableDeclaration') continue;
    for (const d of node.declarations) {
      if (d.id.type !== 'Identifier' || d.id.name !== name || !d.init) continue;
      if (d.init.type === 'Literal') return d.init.value;
      if (d.init.type === 'ArrayExpression') return d.init.elements.map(e => (e && e.type === 'Literal' ? e.value : null));
    }
  }
  return undefined;
}

// Two files in one page or content world must not declare the same top-level name
function checkWorld(label, files) {
  const seen = new Map();
  for (const file of files) {
    if (!fs.existsSync(path.join(ROOT, file))) continue;
    let names = [];
    try { names = topLevelNames(file); } catch (e) { continue; }
    for (const { name, kind } of names) {
      if (seen.has(name)) report(`${label}: "${name}" is declared in ${seen.get(name)} and again in ${file} (${kind})`);
      else seen.set(name, file);
    }
  }
}

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const contentList = manifest.content_scripts.flatMap(cs => cs.js || []);
// background.js runs the files in its CF_BACKGROUND_FILES array with importScripts, in that order
const workerFile = manifest.background.service_worker;
const workerSrc = fs.readFileSync(path.join(ROOT, workerFile), 'utf8');
let workerFiles = [];
try { workerFiles = topLevelConst(workerFile, 'CF_BACKGROUND_FILES') || []; } catch (e) { report(`${workerFile} does not parse: ${e.message}`); }
if (!workerFiles.length) report(`${workerFile} declares no CF_BACKGROUND_FILES array`);
if (!workerSrc.includes('importScripts(...CF_BACKGROUND_FILES);')) report(`${workerFile} does not run importScripts(...CF_BACKGROUND_FILES);`);
const workerList = [workerFile, ...workerFiles.filter(f => typeof f === 'string')];
const loadLists = {
  'manifest content_scripts': contentList,
  'manifest service_worker': workerList,
  'node tools': NODE_TOOLS
};
PAGES.forEach(page => { loadLists[page] = pageScripts(page); });

const loaded = new Set(Object.values(loadLists).flat());
const files = walk(ROOT, []);

for (const [label, list] of Object.entries(loadLists)) {
  list.forEach(file => {
    if (!fs.existsSync(path.join(ROOT, file)) && !RUNTIME_GENERATED.includes(file)) report(`${label} lists ${file}, which does not exist`);
  });
}

for (const file of files) {
  const full = path.join(ROOT, file);
  const size = fs.statSync(full).size;
  const isSource = /\.(js|css|html)$/.test(file);
  if (isSource && size > SIZE_LIMIT) report(`${file} is ${size} bytes, over the ${SIZE_LIMIT} byte limit`);
  if (!file.endsWith('.js')) continue;
  if (!loaded.has(file)) report(`${file} is not in any manifest or load list`);
  const src = fs.readFileSync(full, 'utf8');
  try {
    acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'script' });
  } catch (e) {
    report(`${file} does not parse: ${e.message}`);
  }
  const head = src.split('\n').slice(0, 12);
  if (head[0].trim() !== `// ${file}`) report(`${file} does not open with its header line "// ${file}"`);
  const notes = head.find(line => /^\/\/ Notes: docs\/notes\//.test(line));
  if (!notes) report(`${file} has no "// Notes: docs/notes/..." pointer in its first 12 lines`);
  else if (!fs.existsSync(path.join(DOCS_ROOT, notes.replace(/^\/\/ Notes: /, '').trim()))) report(`${file} points to ${notes.replace(/^\/\/ Notes: /, '').trim()}, which does not exist in ${DOCS_ROOT}`);
}

if (fs.existsSync(path.join(ROOT, 'docs'))) report(`docs/ is inside the repository; the notes belong in ${DOCS_ROOT}`);

// The background reloads the extension when its build number differs from the manifest version
const BUILD_FILE = 'lib/background-build.js';
let build;
try { build = topLevelConst(BUILD_FILE, 'CF_BACKGROUND_BUILD'); } catch (e) { build = undefined; }
if (build !== manifest.version) report(`${BUILD_FILE} has CF_BACKGROUND_BUILD ${build} and manifest.json has version ${manifest.version}`);

checkWorld('content scripts', contentList);
checkWorld('service worker', workerList);
PAGES.forEach(page => checkWorld(page, loadLists[page].filter(f => !RUNTIME_GENERATED.includes(f))));

if (problems.length) {
  problems.forEach(p => console.log('FAIL', p));
  console.log(`${problems.length} problem(s) found`);
  process.exitCode = 1;
} else {
  console.log(`OK: ${files.filter(f => f.endsWith('.js')).length} scripts load, parse, fit ${SIZE_LIMIT} bytes and carry headers`);
}
