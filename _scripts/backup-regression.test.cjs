// Read-only VM tests against the pinned upstream checkout; no browser/profile/network access.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
function load(files, extra = {}) {
  const ctx = vm.createContext({ console: { log() {} }, setTimeout: fn => { fn(); return 0; }, clearTimeout() {}, ...extra });
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), ctx, { filename: file });
  return ctx;
}
const files = ['lib/chat-markdown.js', 'content/cf-export-run.js'];
test('control: source changed after completed save is stale', () => {
  const c = load(files);
  assert.equal(vm.runInContext("cfExportIsOutdated({updatedAt:'2026-11-22T01:03:00Z'}, {format:EXPORT_FORMAT,sourceUpdatedAt:'2026-11-22T01:02:00Z',exportedAt:'2026-11-22T01:02:00Z'})", c), true);
});
test('BUG: source changed during fetch/write must still be stale on next sync', () => {
  const c = load(files);
  // Payload snapshot at 01:00; source changes 01:01; disk commit stamps 01:02.
  assert.equal(vm.runInContext("cfExportIsOutdated({updatedAt:'2026-11-22T01:01:00Z'}, {format:EXPORT_FORMAT,mark:'old-leaf',sourceUpdatedAt:'2026-11-22T01:00:00Z',exportedAt:'2026-11-22T01:02:00Z'})", c), true);
});
test('BUG: newly discovered UUID sharing eight-character prefix must not overwrite old chat', async () => {
  const writes = [];
  const id = '12345678-bbbb-4000-8000-000000000002';
  const c = load(files, {
    window: { chatExporter: { exportChatById: async () => ({ success:true,markdown:'new chat',filename:'12345678_New.md' }) } },
    chrome: { runtime: { sendMessage: async message => message.action === 'listExports'
      ? {files:['12345678_Old.md']} : {success:true,filename:null} } },
    cfCheckWriteAccess: async () => ({ok:true}), loadExportRecords:async () => ({}),
    cfLoadUnavailableChats:async () => ({}), cfMarkChatsExported:async () => {},
    cfWriteExport:async (filename, content) => { writes.push({filename,content}); return {success:true}; },
    markChatAsExported:async () => {}, performance:{now:() => 0}, allChats:[]
  });
  await c.cfExportChatList([{id,title:'New',orgId:'org'}], { readableOrgIds:new Set(['org']) });
  assert.equal(writes[0].filename, '12345678_New.md');
});
test('BUG: rediscovered chat with a historical unavailable marker must be retried', async () => {
  let fetched = 0;
  const id = 'abcdef01-aaaa-4000-8000-000000000001';
  const c = load(files, {
    window:{chatExporter:{exportChatById:async () => { fetched++; return {success:true,markdown:'restored',filename:'abcdef01_Restored.md'}; }}},
    chrome:{runtime:{sendMessage:async () => ({files:[]})}},
    cfCheckWriteAccess:async () => ({ok:true}), loadExportRecords:async () => ({}),
    cfLoadUnavailableChats:async () => unavailable,
    cfClearUnavailableChats:async ids => ids.forEach(id => delete unavailable[id]),
    cfMarkChatsExported:async () => {}, cfWriteExport:async () => ({success:true}),
    markChatAsExported:async () => {}, performance:{now:() => 0}, allChats:[]
  });
  const unavailable = {[id]:{reason:'not found',since:'2026-10-01'}};
  await c.cfExportChatList([{id,title:'Restored',orgId:'org'}],{readableOrgIds:new Set(['org']),listedIds:new Set([id])});
  assert.equal(fetched,1);
});
test('BUG: an endpoint repeating a full page must not certify complete account coverage',async () => {
  const batch=Array.from({length:100},(_,i)=>({uuid:'chat-'+i,name:'test',updated_at:'2026-11-01T00:00:00Z'}));
  const c=load(['lib/chat-markdown.js','lib/chat-exporter.js'],{
    window:{},fetch:async url=>url.endsWith('/count')?{ok:true,text:async()=>'250'}:{ok:true,json:async()=>batch}
  });
  const result=await c.listConversations(null,{org:{id:'org'}});
  assert.equal(result.records.length,100);
  assert.equal(result.reachedEnd,false);
});
