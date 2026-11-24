const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');

async function run() {
  const server=http.createServer(async (req,res)=>{
    const file=path.basename(req.url.split('?')[0]) || 'index.html';
    try {
      const bytes=await fs.readFile(path.join('dist',file));
      res.setHeader('Content-Type',({'.js':'application/javascript','.css':'text/css','.html':'text/html'})[path.extname(file)]||'application/octet-stream');
      res.end(bytes);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  let browser;
  try {
    browser=await chromium.launch();
    const page=await browser.newPage({viewport:{width:390,height:844}});
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
    await page.locator('#upload').setInputFiles(process.argv[2]);
    await page.locator('#scan:enabled').click();
    const candidate=page.locator('#queue button').first();
    await candidate.waitFor({timeout:45000});
    await candidate.click();
    await page.locator('#player').fill('Test setter');
    await page.locator('#outcome').selectOption('Attack error');
    await page.locator('#eventKinds input[value=Error]').check();
    await page.locator('#eventKinds input[value=Point]').check();
    await page.locator('#setterZone').selectOption('6');
    await page.locator('#save').click();
    await page.reload({waitUntil:'domcontentloaded'});
    await page.locator('[data-tab=clips]').click();
    await page.locator('#zoneFilter').selectOption('6');
    await page.locator('#eventFilter').selectOption('Error');
    assert.equal(await page.locator('#library .clip-card').count(),1);
    await page.locator('#eventFilter').selectOption('Pass');
    assert.equal(await page.locator('#library .clip-card').count(),0);
    await page.locator('#eventFilter').selectOption('Point');
    await page.locator('#library [data-edit]').click();
    await page.locator('#cancel:visible').waitFor();
    assert.equal(await page.locator('#setterZone').inputValue(),'6');
    await page.locator('#preview').click();
    await page.waitForFunction(()=>document.querySelector('video').currentTime>0.15);
    await page.locator('#notes').evaluate(el=>el.closest('details').open=true);
    await page.locator('#notes').fill('Reviewed on film');
    await page.locator('#save').click();
    await page.locator('[data-tab=clips]').click();
    assert.equal(await page.locator('#library .clip-card').count(),1);
    assert.ok(await page.locator('#library').getByText('Reviewed on film').isVisible());
    const download=page.waitForEvent('download',{timeout:30000});
    await page.locator('#library [data-export]').click();
    const output=await download;
    assert.ok((await fs.stat(await output.path())).size>0);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    console.log('PASS: mobile layout, import, motion scan, event filters, retained video, trim playback, edit and clip export');
  } finally { await browser?.close(); server.closeAllConnections(); server.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1});
