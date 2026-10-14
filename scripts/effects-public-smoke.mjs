import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const url='https://teabonvivant.github.io/kowloon-armor/九龍裝甲行動.html';
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const evidence='docs/evidence/effects';await mkdir(evidence,{recursive:true});
try {
  const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,reducedMotion:'no-preference'});
  await context.addInitScript(()=>localStorage.setItem('kowloon-armor-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,reducedMotion:false,lowFlash:false})));
  const page=await context.newPage();page.setDefaultTimeout(120000);
  const errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
  const response=await page.goto(url,{waitUntil:'domcontentloaded'});assert.equal(response.status(),200);
  const localHash=createHash('sha256').update(await readFile('九龍裝甲行動.html')).digest('hex');
  const publicHash=createHash('sha256').update(await response.body()).digest('hex');assert.equal(publicHash,localHash);
  await page.locator('.garage').waitFor();assert.match(await page.locator('.garage-footer').innerText(),/v1\.8/);
  await page.locator('[data-mode="drive"]').click({force:true});await page.locator('[data-action="start"]').click({force:true});
  await page.locator('#world').focus();await page.keyboard.down('Space');
  await page.waitForFunction(()=>document.querySelector('#reload-label')?.textContent.includes('裝填'),null,{polling:100});
  await page.keyboard.up('Space');const reload=await page.locator('#reload-label').innerText();
  await page.screenshot({path:`${evidence}/public-normal-play.png`,timeout:120000});
  assert.deepEqual(errors,[]);assert.ok(requests.length>0&&requests.every(r=>decodeURI(r)===url));
  const report={verifiedAt:new Date().toISOString(),url,localHash,publicHash,browser:browser.version(),viewport:[1440,900],
    checks:['normal public URL returns final HTML SHA256','v1.8 garage boots','native keyboard input fires and starts reload','normal continuous browser renderer','no JavaScript/console errors or external asset requests'],
    reload,errors,requests,method:'Fresh normal browser context, native rAF and unmodified WebGL submission. Low quality, motion enabled, audio muted. Screenshot shows post-shot gameplay; precise flash captures are in public-muzzle-1440x900.png. Software WebGL, not physical hardware.'};
  await writeFile(`${evidence}/public-normal.json`,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}finally{await browser.close();}
