// Deterministic adversarial inputs against the real backup functions; no live account or disk writes.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.resolve(__dirname, '..');
function load(files, extra = {}) {
  const c = vm.createContext({ console: {log(){}}, setTimeout: f => {f();return 0;}, clearTimeout(){}, ...extra });
  for (const f of files) vm.runInContext(fs.readFileSync(path.join(ROOT,f),'utf8'),c,{filename:f});
  return c;
}
function random(seed) {
  let state=seed;
  return max=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state%max;};
}
const uuid=n=>`deadbeef-aaaa-4000-8000-${n.toString(16).padStart(12,'0')}`;
const markdown=(id,body='body')=>`# Synthetic\n\n**Chat ID:** ${id}\n\n---\n\n${body}`;
test('stress: 10,000 colliding prefixes and hostile body IDs retain distinct filenames and header identity',()=>{
  const c=load(['lib/chat-markdown.js']);
  const names=new Set();
  for(let i=0;i<10000;i++){
    const id=uuid(i), other=uuid(i+10000);
    const name=c.generateExportFilename(id,'Same title');
    assert.equal(c.exportIdOfFilename(name),id);
    assert.equal(c.exportPrefixOfFilename(name),'deadbeef');
    assert.equal(c.exportSourceId(markdown(id,`**Chat ID:** ${other}`)),id);
    assert.equal(c.exportSourceId(`# No identity\n\n---\n\n**Chat ID:** ${other}`),null);
    names.add(name);
  }
  assert.equal(names.size,10000);
});
test('stress: 10,000 revision/order/clock cases never use local save time for freshness',()=>{
  const c=load(['lib/chat-markdown.js','content/cf-export-run.js']);
  const next=random(0xc1a0de), epoch=Date.parse('2026-01-01T00:00:00Z');
  for(let i=0;i<10000;i++){
    const payload=epoch+next(1000000), current=payload+next(2001)-1000;
    const sourceUpdatedAt=new Date(payload).toISOString();
    const exportedAt=new Date(epoch+next(2000000000)).toISOString();
    assert.equal(c.cfExportIsOutdated({updatedAt:new Date(current).toISOString()},
      {format:2,sourceUpdatedAt,exportedAt}),current>payload);
  }
});
test('stress: 250 randomized overlapping, stalled, short and failing pagination plans never overstate coverage',async()=>{
  const next=random(0xbac0ff);
  for(let run=0;run<250;run++){
    const total=101+next(199), stride=1+next(100), mode=run%5;
    let calls=0;
    const c=load(['lib/chat-markdown.js','lib/chat-exporter.js'],{window:{},fetch:async url=>{
      if(url.endsWith('/count'))return {ok:true,text:async()=>String(total)};
      const page=calls++;
      if(mode===2&&page===1)return {ok:false,status:503};
      const start=mode===1&&page===1?0:page*stride;
      const count=Math.min(mode===3?20:100,total-start);
      return {ok:true,json:async()=>Array.from({length:Math.max(0,count)},(_,i)=>({uuid:uuid(start+i),name:'Test',updated_at:'2026-01-01T00:00:00Z'}))};
    }});
    const r=await c.listConversations(null,{org:{id:'org'}});
    assert.equal(new Set(r.records.map(x=>x.id)).size,r.records.length);
    assert.ok(r.records.length<=total);
    if(r.reachedEnd){assert.equal(r.records.length,total);assert.equal(r.error,null);}
    else assert.ok(r.error||r.stoppedEarly);
    if(mode===1||mode===2||mode===3)assert.equal(r.reachedEnd,false);
  }
});
test('stress: 1,000 permission, identity, write and commit failures preserve the previous export',async()=>{
  const id=uuid(1), old=markdown(id,'previous'), updated=markdown(id,'new');
  for(let run=0;run<1000;run++){
    let stored=old, writes=0;
    const mode=run%5;
    const file={size:old.length,slice:()=>({text:async()=>old})};
    const c=load(['lib/chat-markdown.js','lib/export-files.js'],{
      checkFolderAccess:async()=>({hasHandle:true,permission:mode===0?'denied':'granted'}),
      loadFolderHandle:async()=>({getDirectoryHandle:async()=>({getFileHandle:async()=>({
        getFile:async()=>file,createWritable:async()=>{
          if(mode===2)throw new Error('open failure');
          let pending;
          return {write:async value=>{writes++;pending=value;if(mode===3)throw new Error('write failure');},
            close:async()=>{if(mode===4)throw new Error('commit failure');stored=pending;}};
        }
      })})})
    });
    const r=await c.writeExportFileChecked('deadbeef_Test.md',mode===1?markdown(uuid(2)):updated);
    assert.equal(r.success,false);
    assert.equal(stored,old);
    if(mode===0||mode===1||mode===2)assert.equal(writes,0);
  }
});
