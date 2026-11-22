const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const ROOT = path.resolve(__dirname, '..');
const A = '12345678-aaaa-4000-8000-000000000001';
const B = '12345678-bbbb-4000-8000-000000000002';
const OLD = '2026-11-22T01:00:00Z';
const NEW = '2026-11-22T01:01:00Z';
const markdown = (id, body = 'body') => `# Test\n\n**Chat ID:** ${id}\n\n---\n\n${body}`;

function storage(initial = {}) {
  const data = structuredClone(initial);
  return { data, local: {
    get: async keys => Object.fromEntries((Array.isArray(keys) ? keys : [keys]).map(k => [k, structuredClone(data[k])])),
    set: async values => Object.assign(data, structuredClone(values))
  } };
}
function load(files, extra = {}) {
  const c = vm.createContext({ console: {log(){}}, setTimeout: fn => { fn(); return 0; }, clearTimeout(){}, ...extra });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT, f), 'utf8'), c, { filename:f });
  return c;
}
function disk(initial = {}) {
  const contents = new Map(Object.entries(initial));
  const blob = text => ({size:Buffer.byteLength(text),lastModified:1,
    slice:(a,b)=>({text:async()=>text.slice(a,b)}),text:async()=>text});
  const handle = name => ({kind:'file',name,getFile:async()=>blob(contents.get(name)),
    createWritable:async()=>{let next; return {write:async s=>{next=s;},close:async()=>contents.set(name,next)};}});
  const folder = {getFileHandle:async(name,opts={})=>{
    if (!contents.has(name)) {
      if (!opts.create) {const e=new Error('missing');e.name='NotFoundError';throw e;}
      contents.set(name,'');
    }
    return handle(name);
  },async *values(){for(const name of contents.keys())yield handle(name);}};
  return {contents, root:{getDirectoryHandle:async()=>folder}};
}
function backup(initial, state = {}) {
  const files = disk(initial);
  const saved = storage(state);
  let c;
  c=load(['lib/storage-keys.js','lib/chat-markdown.js','lib/export-state.js','lib/export-files.js',
    'lib/folder-ops.js','content/cf-export-records.js','content/cf-export-run.js'],{
    chrome:{storage:saved,runtime:{sendMessage:async m=>{
      if(m.action==='listExports')return {files:Array.from(files.contents.keys())};
      if(m.action==='findExport')return c.findExportFile(m.chatId,m.filename);
      return {success:false};
    }}},
    loadFolderHandle:async()=>files.root,
    checkFolderAccess:async()=>({hasHandle:true,permission:'granted'}),
    cfCheckWriteAccess:async()=>({ok:true}),cfOnExportRecorded(){},allChats:[],
    performance:{now:()=>0},
    window:{chatExporter:{exportChatById:async(id,title)=>({success:true,
      filename:c.generateExportFilename(id,title),markdown:markdown(id,'updated'),sourceUpdatedAt:NEW,mark:'leaf'})}}
  });
  c.cfWriteExport=(filename,content)=>c.writeExportFileChecked(filename,content);
  return {c,files,saved};
}
test('full UUID filenames remain in legacy prefix indexes',()=>{
  const c=load(['lib/chat-markdown.js']);
  assert.equal(c.generateExportFilename(A,'Test'),`${A}_Test.md`);
  assert.equal(c.exportPrefixOfFilename(`${A}_Test.md`),'12345678');
  assert.equal(c.exportPrefixOfFilename('12345678_Test.md'),'12345678');
  assert.equal(c.exportIdOfFilename(`${A}_Test.md`),A);
});
test('bulk export preserves another chat and writes a collision to its own full UUID file',async()=>{
  const {c,files}=backup({'12345678_Test.md':markdown(A)});
  const out=await c.cfExportChatList([{id:B,title:'Test',orgId:'org',updatedAt:NEW}],{readableOrgIds:new Set(['org'])});
  assert.equal(out.exported,1);
  assert.equal(files.contents.get('12345678_Test.md'),markdown(A));
  assert.equal(files.contents.get(`${B}_Test.md`),markdown(B,'updated'));
});
test('verified legacy filename is reused across a title change',async()=>{
  const {c,files,saved}=backup({'12345678_Old-title.md':markdown(A)});
  const out=await c.cfExportChatList([{id:A,title:'New title',orgId:'org',updatedAt:NEW}],{readableOrgIds:new Set(['org'])});
  assert.equal(out.updated,1);
  assert.equal(files.contents.size,1);
  assert.equal(files.contents.get('12345678_Old-title.md'),markdown(A,'updated'));
  assert.equal(saved.data.cfExportState[A].sourceUpdatedAt,NEW);
});
test('writer refuses direct overwrite with a different source, or an unknown existing source',async()=>{
  const {c,files}=backup({'12345678_Test.md':markdown(A),'authored.md':'human note'});
  assert.equal((await c.writeExportFileChecked('12345678_Test.md',markdown(B))).code,'identity');
  assert.equal((await c.writeExportFileChecked('authored.md',markdown(A))).code,'identity');
  assert.equal(files.contents.get('12345678_Test.md'),markdown(A));
  assert.equal(files.contents.get('authored.md'),'human note');
});
test('failed identity lookup stops bulk export without writing',async()=>{
  const {c,files}=backup({'12345678_Test.md':markdown(A)});
  c.chrome.runtime.sendMessage=async m=>m.action==='listExports'?{files:['12345678_Test.md']}:{success:false,error:'permission revoked'};
  const out=await c.cfExportChatList([{id:A,title:'Test',orgId:'org'}],{readableOrgIds:new Set(['org'])});
  assert.match(out.aborted,/permission revoked/);
  assert.equal(files.contents.get('12345678_Test.md'),markdown(A));
});
test('authoritative rediscovery clears a missing marker and writes the restored chat',async()=>{
  const {c,saved}=backup({}, {unavailableChats:{[A]:{reason:'not found'}}});
  const out=await c.cfExportChatList([{id:A,title:'Test',orgId:'org'}],{
    readableOrgIds:new Set(['org']),listedIds:new Set([A])});
  assert.equal(out.exported,1);
  assert.equal(saved.data.unavailableChats[A],undefined);
});
test('unlisted missing chats stay skipped, but explicit force can retry them',async()=>{
  const {c,saved}=backup({}, {unavailableChats:{[A]:{reason:'not found'}}});
  const chat={id:A,title:'Test',orgId:'org'};
  assert.equal((await c.cfExportChatList([chat],{readableOrgIds:new Set(['org'])})).knownMissing,1);
  assert.equal((await c.cfExportChatList([chat],{readableOrgIds:new Set(['org']),rewriteAll:true})).exported,1);
  assert.equal(saved.data.unavailableChats[A],undefined);
});
test('same source revision is skipped regardless of the later local write time',()=>{
  const {c}=backup({});
  const record={format:2,sourceUpdatedAt:OLD,exportedAt:'2099-01-01T00:00:00Z'};
  assert.equal(c.cfExportIsOutdated({updatedAt:OLD},record),false);
  assert.equal(c.cfExportIsOutdated({updatedAt:NEW},record),true);
  assert.equal(c.cfExportIsOutdated({updatedAt:OLD},{format:2,exportedAt:NEW}),true);
});
test('queued export retains payload revision when folder access returns later',async()=>{
  const saved=storage();
  const c=load(['lib/storage-keys.js','lib/chat-markdown.js','lib/export-state.js','content/cf-disk.js','lib/folder-access.js'],{
    chrome:{storage:saved},writeExportFileChecked:async()=>({success:true})});
  await c.cfQueueExport(`${A}_Test.md`,markdown(A),A,'old-leaf',OLD);
  assert.equal((await c.flushQueuedExports()).written,1);
  assert.equal(saved.data.cfExportState[A].sourceUpdatedAt,OLD);
});
test('offline viewer resolves matching full identity among colliding legacy files',async()=>{
  const files=disk({'12345678_A.md':markdown(A),'12345678_B.md':markdown(B)});
  const c=load(['lib/chat-markdown.js','standalone/library-files.js']);
  c.fixtureHandle=files.root;
  vm.runInContext('libraryHandle = fixtureHandle',c);
  await c.libraryListExports();
  assert.equal(await c.libraryReadExport(B),markdown(B));
  assert.equal(await c.libraryReadExport('12345678-cccc-4000-8000-000000000003'),null);
});
test('cross-account migration plans full UUID filenames and rejects mismatched legacy content',async()=>{
  const c=load(['lib/chat-markdown.js','content/cf-migrate.js','content/cf-migrate-source.js'],{
    folders:[],cfHash:()=> 'folder',isCoworkSessionId:()=>false,cfReadExportFile:async()=>markdown(A)});
  const account={key:'source',folders:[{name:'Test',category:'Test',chats:[{id:B,title:'Test'}]}]};
  const plan=c.cfPlanMigration([account],{byPrefix:new Map([[B,`${B}_Test.md`]]),
    imported:{},importedHere:new Set(),own:new Set(),orgId:'org'});
  assert.equal(plan.chats,1);
  assert.equal(plan.items[0].filename,`${B}_Test.md`);
  await assert.rejects(c.cfMigrateImportSource(plan.items[0]),/source ID/);
  c.cfReadExportFile=async()=>markdown(B);
  assert.equal((await c.cfMigrateImportSource(plan.items[0])).attachMarkdown,markdown(B));
});
test('opening an offline search hit uses its full source ID',async()=>{
  const opened=[];
  const c=load(['lib/chat-markdown.js','standalone/library-host.js'],{
    window:{open:url=>opened.push(url)},cfPageAlert:()=>assert.fail('unexpected alert')});
  c.cfHostReadExport=async()=>({success:true,content:markdown(B)});
  await c.cfHostOpenExport('12345678_Test.md','Test');
  assert.match(decodeURIComponent(opened[0]),new RegExp(B));
});
