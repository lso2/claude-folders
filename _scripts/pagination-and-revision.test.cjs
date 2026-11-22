const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const ROOT=path.resolve(__dirname,'..');
function load(files,extra={}) {
  const c=vm.createContext({console:{log(){}},setTimeout:f=>{f();return 0;},clearTimeout(){},...extra});
  for(const f of files)vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c,{filename:f});
  return c;
}
const batch=(from,count)=>Array.from({length:count},(_,i)=>({uuid:'chat-'+(from+i),name:'Test',updated_at:'2026-11-01T00:00:00Z'}));
function reader(total,page) {
  return load(['lib/chat-markdown.js','lib/chat-exporter.js'],{window:{},fetch:async url=>{
    if(url==='/api/organizations')return {ok:true,json:async()=>[{uuid:'org',name:'Test'}]};
    if(url.endsWith('/count'))return {ok:true,text:async()=>String(total)};
    return page(Number(new URL(url,'https://claude.ai').searchParams.get('offset')));
  }});
}
test('normal full and short last pages establish complete coverage',async()=>{
  const c=reader(101,offset=>({ok:true,json:async()=>offset===0?batch(0,100):batch(100,1)}));
  const r=await c.listConversations(null,{org:{id:'org'}});
  assert.equal(r.records.length,101); assert.equal(r.reachedEnd,true); assert.equal(r.error,null);
});
test('overlapping pages deduplicate without prematurely ending the listing',async()=>{
  const c=reader(200,offset=>({ok:true,json:async()=>offset===0?batch(0,100):offset===100?batch(50,100):batch(150,50)}));
  const r=await c.listConversations(null,{org:{id:'org'}});
  assert.equal(r.records.length,200); assert.equal(r.reachedEnd,true);
});
test('a failed later page preserves partial records and an explicit incomplete result',async()=>{
  const c=reader(250,offset=>offset===0?{ok:true,json:async()=>batch(0,100)}:{ok:false,status:503});
  const r=await c.listConversations(null,{org:{id:'org'}});
  assert.equal(r.records.length,100); assert.equal(r.reachedEnd,false); assert.match(r.error,/503/);
});
test('an unexpectedly short page does not certify a larger counted account',async()=>{
  const c=reader(250,()=>({ok:true,json:async()=>batch(0,50)}));
  const r=await c.listConversations(null,{org:{id:'org'}});
  assert.equal(r.reachedEnd,false); assert.match(r.error,/50 of 250/);
});
test('an empty account can still complete',async()=>{
  const c=reader(0,()=>({ok:true,json:async()=>[]}));
  const r=await c.listConversations(null,{org:{id:'org'}});
  assert.equal(r.reachedEnd,true); assert.equal(r.error,null);
});
test('repeated-page error reaches the organization summary',async()=>{
  const c=reader(250,()=>({ok:true,json:async()=>batch(0,100)}));
  const r=await c.listConversationsAllOrgs();
  assert.equal(r.records.length,100); assert.equal(r.orgs[0].reachedEnd,false);
  assert.match(r.orgs[0].error,/repeated/);
});
test('conversation exporter returns the revision of the actual fetched payload',async()=>{
  const stamp='2026-11-01T00:00:00Z';
  const c=load(['lib/chat-markdown.js','lib/chat-exporter.js'],{window:{},isCoworkSessionId:()=>false,
    fetch:async()=>({ok:true,json:async()=>({updated_at:stamp,chat_messages:[{uuid:'message',sender:'human',text:'test'}]})})});
  const r=await c.exportChatById('12345678-aaaa-4000-8000-000000000001','Test','org');
  assert.equal(r.success,true); assert.equal(r.sourceUpdatedAt,stamp);
});
test('Cowork metadata is read before events to avoid a newer stamp on older event content',async()=>{
  const calls=[]; const stamp='2026-11-01T00:00:00Z';
  const c=load(['lib/cowork-export.js'],{
    fetchCoworkSession:async()=>{calls.push('metadata');return {updated_at:stamp};},
    fetchCoworkEvents:async()=>{calls.push('events');return [{}];},coworkEventsToMessages:()=>[{}],
    coworkToMarkdown:()=> '# Test',generateExportFilename:()=> 'cse_test_Test.md',coworkTurnMark:()=> '1'});
  const r=await c.exportCoworkSession('cse_test','Test','org');
  assert.equal(r.success,true); assert.deepEqual(calls,['metadata','events']); assert.equal(r.sourceUpdatedAt,stamp);
});
test('incomplete organization listings remain visible in the sync result',()=>{
  const c=load(['content/cf-sync-summary.js']);
  const r=c.cfSyncSummaryLines(1,250,null,[{name:'Test',error:'repeated page'}],0,true,0);
  assert.equal(r.incomplete,true);
  assert.match(r.lines.join(' '),/listing incomplete/);
  assert.match(r.details.join(' '),/repeated page/);
});
test('normal summary remains complete',()=>{
  const c=load(['content/cf-sync-summary.js']);
  const r=c.cfSyncSummaryLines(1,1,null,[{name:'Test',accountTotal:1}],0,true,0);
  assert.equal(r.incomplete,false);
});
