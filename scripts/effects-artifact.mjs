import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const evidence='docs/evidence/effects';await mkdir(evidence,{recursive:true});
const publicURL=process.env.EFFECTS_PUBLIC_URL;
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
const checks=[],errors=[],requests=[];
try {
  for(const [width,height,touch] of publicURL?[[1440,900,false]]:[[1440,900,false],[1280,577,false],[844,390,true],[390,844,true],[1024,768,true]]) {
    const context=await browser.newContext({viewport:{width,height},hasTouch:touch,isMobile:touch,deviceScaleFactor:1});
    if(!publicURL)await context.setOffline(true);
    await context.addInitScript(()=>{
      localStorage.setItem('kowloon-armor-settings',JSON.stringify({quality:'low',volume:0,musicVolume:0,reducedMotion:false}));
      let time=performance.now(),id=0;const callbacks=new Map();
      window.requestAnimationFrame=callback=>{callbacks.set(++id,callback);return id;};window.cancelAnimationFrame=id=>callbacks.delete(id);
      window.evidenceStep=(count,dt=1000/60)=>{for(let i=0;i<count;i++){window.evidencePaint=i===count-1;time+=dt;const list=[...callbacks.values()];callbacks.clear();for(const fn of list)fn(time);}window.evidencePaint=true;return time;};
      window.evidenceDraws=0;
      for(const key of ['drawElements','drawElementsInstanced','drawArrays','drawArraysInstanced']){const fn=WebGL2RenderingContext.prototype[key];WebGL2RenderingContext.prototype[key]=function(...args){if(window.evidencePaint===false)return;window.evidenceDraws++;return fn.apply(this,args);};}
    });
    const page=await context.newPage();page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});
    const response=await page.goto(publicURL??pathToFileURL(resolve('九龍裝甲行動.html')).href,{waitUntil:'domcontentloaded'});
    if(publicURL){assert.equal(response.status(),200);const remoteHash=createHash('sha256').update(await response.body()).digest('hex');assert.equal(remoteHash,createHash('sha256').update(await readFile('九龍裝甲行動.html')).digest('hex'));}
    await page.locator('.garage').waitFor();assert.match(await page.locator('.garage-footer').innerText(),/v1\.8/);
    console.log('startup',width,height);
    await page.evaluate(()=>window.evidenceStep(3,100));
    await page.locator('[data-mode="drive"]').click({force:true});await page.locator('[data-action="start"]').click({force:true});
    await page.evaluate(()=>window.evidenceStep(15,100));
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
    const drawnBefore=await page.evaluate(()=>window.evidenceDraws);
    if(touch){const box=await page.locator('#touch-fire').boundingBox();await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);}
    else await page.keyboard.down('Space');
    await page.evaluate(()=>window.evidenceStep(2));
    const drawnAfter=await page.evaluate(()=>window.evidenceDraws);assert.ok(drawnAfter>drawnBefore);
    await page.screenshot({path:`${evidence}/${publicURL?'public':'artifact'}-muzzle-${width}x${height}.png`});
    console.log('muzzle captured',width,height);
    if(!touch)await page.keyboard.up('Space');
    await page.evaluate(()=>window.evidenceStep(8));assert.match(await page.locator('#reload-label').innerText(),/裝填/);
    if(touch){
      const cdp=await context.newCDPSession(page),fingers=new Map();
      const centre=async selector=>{const r=await page.locator(selector).boundingBox();return {x:r.x+r.width/2,y:r.y+r.height/2};};
      const stick=await centre('#touch-stick'),fire=await centre('#touch-fire');
      const send=async(type,id,x,y)=>{if(type==='touchEnd')fingers.delete(id);else fingers.set(id,{id,x,y,radiusX:3,radiusY:3});await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...fingers.values()]});};
      await send('touchStart',1,width*.55,height*.4);await send('touchMove',1,width*.55+25,height*.4-8);
      await send('touchStart',2,stick.x,stick.y);await send('touchMove',2,stick.x+8,stick.y-35);await send('touchStart',3,fire.x,fire.y);
      await page.evaluate(()=>window.evidenceStep(10,100));
      assert.ok(Number(await page.locator('#speed').innerText())>0);
      await page.evaluate(()=>window.evidenceStep(60,100));
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});fingers.clear();
      await page.evaluate(()=>window.evidenceStep(15,100));assert.equal(Number(await page.locator('#speed').innerText()),0);
      assert.equal(await page.evaluate(()=>document.elementFromPoint(innerWidth/2,innerHeight/2).id),'world');
    }
    await page.locator('.compact-map').click({force:true});await page.evaluate(()=>window.evidenceStep(4,100));
    const journal=await page.locator('.event-log').innerText();assert.match(journal,/主炮發射/);if(touch)assert.ok((journal.match(/主炮發射/g)??[]).length>=2);
    await page.locator('#modal [data-action="close"]').first().click({force:true});await page.evaluate(()=>window.evidenceStep(3,100));
    await page.waitForFunction(()=>document.activeElement?.id==='world',null,{polling:20});
    await page.keyboard.down('Escape');await page.evaluate(()=>window.evidenceStep(2));await page.keyboard.up('Escape');await page.locator('#modal[open]').waitFor();
    await page.locator('#modal [data-action="return"]').click({force:true});await page.locator('#modal [data-action="confirm-return"]').click({force:true});
    await page.evaluate(()=>window.evidenceStep(3,100));await page.locator('.garage').waitFor();
    await page.locator('[data-action="settings"]').first().click({force:true});
    for(const quality of ['medium','high','low'])await page.locator('#quality').selectOption(quality);
    await page.locator('#reduce-motion').check();
    await page.locator('#lowFlash').check();
    await page.locator('#modal [data-action="close"]').click({force:true});
    await page.locator('[data-action="start"]').click({force:true});await page.evaluate(()=>window.evidenceStep(15,100));
    await page.waitForFunction(()=>document.activeElement?.id==='world',null,{polling:20});
    await page.keyboard.down('Space');await page.evaluate(()=>window.evidenceStep(2));
    await page.screenshot({path:`${evidence}/${publicURL?'public':'artifact'}-comfort-${width}x${height}.png`});
    await page.keyboard.up('Space');await page.evaluate(()=>window.evidenceStep(8));assert.match(await page.locator('#reload-label').innerText(),/裝填/);
    assert.equal(await page.locator('body').evaluate(el=>el.classList.contains('reduce-motion')&&el.classList.contains('low-flash')),true);
    const check={viewport:[width,height],touch,drawnBefore,drawnAfter,journal,checks:['v1.8 startup','actual input fire and captured live muzzle','reload','pause and map','return/reset','all quality options','reduced motion and low flash',...(touch?['three CDP touches drive/aim/fire','release brakes','clear touch aim centre']:[])]};
    checks.push(check);console.log(JSON.stringify(check));await context.close();
  }
  assert.deepEqual(errors,[]);if(!publicURL)assert.deepEqual(requests,[]);
  await writeFile(`${evidence}/${publicURL?'public':'artifact'}.json`,JSON.stringify({artifactSha256:createHash('sha256').update(await readFile('九龍裝甲行動.html')).digest('hex'),browser:browser.version(),publicURL,checks,errors,requests,method:'Final standalone HTML, offline unless publicURL. Test-only rAF clock freezes exact firing moments, drawing only the last frame of each accelerated input batch; no production game debug interface. CDP touch input; not physical devices, continuous rendering or a benchmark.'},null,2));
}finally{await browser.close();}
