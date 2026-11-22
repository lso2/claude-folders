const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const checker=path.resolve(__dirname,'../tools/check-project.js');
const realRequire=createRequire(checker);
function run(args,breakCode=false) {
  const lines=[];
  const processState={argv:['node',checker,...args],exitCode:0};
  const fileSystem={...fs,
    existsSync:file=>String(file).includes(path.join('docs','notes')+path.sep)?false:fs.existsSync(file),
    readFileSync:(file,...rest)=>{
    const text=fs.readFileSync(file,...rest);
    return breakCode&&String(file).replace(/\\/g,'/').endsWith('/lib/chat-markdown.js')
      ? text+'\nconst = ;\n' : text;
  }};
  vm.runInNewContext(fs.readFileSync(checker,'utf8'),{__dirname:path.dirname(checker),
    require:name=>name==='fs'?fileSystem:realRequire(name),
    process:processState,console:{log:(...s)=>lines.push(s.join(' '))}});
  return {code:processState.exitCode,lines};
}
test('public code-only checks explicitly report omitted external notes',()=>{
  const r=run(['--code-only']);
  assert.equal(r.code,0);
  assert.match(r.lines.join('\n'),/strict documentation validation remains unchecked/);
  assert.match(r.lines.join('\n'),/OK: .*scripts load, parse/);
});
test('code-only mode still rejects a real source parse error',()=>{
  const r=run(['--code-only'],true);
  assert.equal(r.code,1);
  assert.match(r.lines.join('\n'),/FAIL lib\/chat-markdown.js does not parse/);
});
test('default checker continues requiring external documentation',()=>{
  const r=run([]);
  // The public checkout does not ship the author's sibling notes.
  assert.equal(r.code,1);
  assert.match(r.lines.join('\n'),/points to docs\/notes\//);
});
