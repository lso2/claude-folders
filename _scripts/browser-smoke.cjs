// Isolated Chrome runtime/DOM checks of source modules; not an installed-extension or real-account test.
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '..');
(async () => {
  const server=http.createServer(async(req,res)=>{
    try {
      const pathname=new URL(req.url,'http://localhost').pathname;
      const filename=path.resolve(ROOT,'.'+decodeURIComponent(pathname));
      if(!filename.startsWith(ROOT+path.sep)){res.writeHead(403).end();return;}
      const type=filename.endsWith('.html')?'text/html':filename.endsWith('.js')?'application/javascript':'text/plain';
      const body=await fs.readFile(filename);
      res.writeHead(200,{'Content-Type':type+'; charset=utf-8'});
      res.end(body);
    }catch{res.writeHead(404).end();}
  });
  let browser;
  try {
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    browser=await chromium.launch({channel:'chrome',headless:true});
    const page=await browser.newPage();
    const errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/_scripts/browser-smoke.html`);
    const result=await page.evaluate(()=>window.runSmokeChecks());
    assert.equal(await page.locator('.sync-success-modal h2').textContent(),'Sync incomplete');
    await page.getByRole('button',{name:'Done',exact:true}).click();
    await page.locator('.sync-success-modal').waitFor({state:'detached'});
    assert.deepEqual(errors,[]);
    console.log(JSON.stringify({browser:'Chrome',version:browser.version(),source:process.env.GITHUB_SHA||'local',
      checks:result.passed.concat('Done button removes the real summary modal'),errors},null,2));
  }finally{
    if(browser)await browser.close();
    await new Promise(resolve=>server.close(resolve));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
