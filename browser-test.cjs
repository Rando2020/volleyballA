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
    page.on('pageerror',e=>console.log('Browser error',e.message));
    page.on('requestfailed',req=>console.log('Request failed',req.url(),req.failure()?.errorText));
    await page.goto('http://127.0.0.1:'+server.address().port,{waitUntil:'domcontentloaded'});
    await page.locator('#upload').setInputFiles(process.argv[2]);
    await page.locator('#quickScan:enabled').click();
    await page.waitForFunction(()=>document.querySelector('#scanStatus').textContent.includes('No qualifying volleyball play'),{},{timeout:90000});
    assert.equal(await page.locator('#queue button').count(),0,'moving test pattern without ball creates no plays');
    await page.locator('#upload').setInputFiles(process.argv[3]);
    await page.locator('#quickScan:enabled').click();
    const candidate=page.locator('#queue button').first();
    try{await candidate.waitFor({timeout:90000});}catch(error){throw Error(await page.locator('#scanStatus').innerText()+' '+error.message);}
    await page.locator('[data-tab=clips]').click();
    const automatic=page.locator('#library .clip-card').first();
    await automatic.waitFor();
    await page.locator('#lead').selectOption('5');
    await page.locator('#tail').selectOption('2');
    await automatic.locator('[data-open]').first().click();
    await page.locator('#matchBook summary').click();
    await page.locator('#gameName').fill('Pool A');
    await page.locator('#gameForm button').click();
    await page.locator('#rosterName').fill('Test setter');
    await page.locator('#rosterForm button').click();
    await page.locator('#matchBook summary').click();
    await candidate.click();
    await page.locator('#position').selectOption('Setter');
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
    await page.locator('#library [data-person]').selectOption({label:'Test setter'});
    await page.locator('#library [data-serve]').selectOption('Ace');
    await page.locator('#eventFilter').selectOption('Ace');
    await page.locator('#library .clip-card').first().waitFor();
    await page.locator('#matchBook summary').click();
    await page.locator('#activeGame').selectOption({index:1});
    await page.locator('#video').evaluate(v=>{v.pause();v.currentTime=0;});
    await page.locator('#markGame').click();
    await page.locator('#libraryGame').selectOption({index:1});
    await page.locator('#library .clip-card').first().waitFor();
    await page.locator('[data-tab=dashboard]').click();
    await page.locator('#statsGame').selectOption({index:1});
    const totals=page.locator('#keeperStats tbody tr').first();
    assert.equal(await totals.locator('th').innerText(),'Test setter');
    assert.equal(await totals.locator('td').nth(1).innerText(),'1');
    // Exercise grouping with controlled clip identities, independent of visual detection.
    const identityPage=await browser.newPage();
    await identityPage.goto(page.url(),{waitUntil:'domcontentloaded'});
    await identityPage.evaluate(()=>{
      plays=[0,1,2].map(i=>({id:'fixture'+i,mediaId:'fixture-film',player:'Unassigned',position:'Unassigned',events:['Set'],action:'Set',outcome:'Unknown',quality:'Unknown',start:i*5,end:i*5+2,points:[]}));
      persist();render();
    });
    await identityPage.locator('[data-tab=clips]').click();
    const library=identityPage.locator('#library');
    await library.locator('[data-group="fixture0"]').selectOption('create');
    await library.locator('[data-group="fixture1"]').selectOption({label:'Unknown 1'});
    await library.getByText(/Possible setter from repeated/).first().waitFor();
    await library.locator('[data-group-role]').first().selectOption('Setter');
    identityPage.once('dialog',dialog=>dialog.accept('Jordan'));
    await library.locator('[data-person="fixture0"]').selectOption('new');
    await identityPage.reload({waitUntil:'domcontentloaded'});
    const restored=await identityPage.evaluate(()=>plays.map(p=>[p.player,p.position]));
    assert.deepEqual(restored,[['Jordan','Setter'],['Jordan','Setter'],['Unassigned','Unassigned']]);
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    if(process.argv[3]){
      await page.locator('#upload').setInputFiles(process.argv[3]);
      await page.waitForFunction(()=>document.querySelector('#ballReport').textContent.includes('sampled frames'),{},{timeout:90000});
      await page.locator('#quickScan:enabled').click();
      assert.equal(await page.evaluate(()=>plays.some(p=>p.detected==='Activity')),false);
      console.log('Volleyball events:',await page.evaluate(()=>plays.filter(p=>p.detected).map(p=>[p.detected,p.eventTime])));
      const saved=await page.evaluate(async()=>{
        const db=await openDB;
        return await new Promise(resolve=>{const req=db.transaction('tracks').objectStore('tracks').get(media.id);req.onsuccess=()=>resolve(req.result);});
      });
      console.log('Indoor detailed scan:',saved.coverage);
      assert.ok(saved.points.length>=6,'detect a sustained ball flight in indoor rally');
      assert.ok(saved.players.some(f=>f.bodies.length),'player track overlay has observations');
      const reference=(await fs.readFile(process.argv[4],'utf8')).trim().split(/\r?\n/).slice(1).map(row=>row.split(',').map(Number));
      const [fps,w,h]=process.argv.slice(5).map(Number);
      const compared=saved.points.flatMap(p=>{
        const row=reference[Math.round(p.time*fps)];
        if(!row || !row[1])return [];
        return [Math.hypot(p.x-row[2]/w,p.y-row[3]/h)];
      });
      const close=compared.filter(d=>d<0.035).length;
      console.log('Indoor rally: detections',saved.points.length,'overlap with reference predictions',compared.length,'within 0.035 normalized distance',close);
      assert.ok(compared.length>=5 && close/compared.length>=0.75,'compare browser ball locations against published reference predictions');
    }
    console.log('PASS: mobile layout, import, motion scan, event filters, retained video, trim playback, edit and clip export');
  } finally { await browser?.close(); server.closeAllConnections(); server.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1});
