import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 577 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(120000);
const errors = [], requests = [], layouts = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
await page.context().setOffline(true);
await page.addInitScript(() => localStorage.setItem('kowloon-armor-settings', JSON.stringify({ quality:'low', volume:0, lighting:'dusk', highContrast:true, reducedMotion:true })));
try {
  await page.goto(pathToFileURL(resolve('九龍裝甲行動.html')).href);
  assert.match(await page.locator('.garage-footer').innerText(), /v1.5/);
  await page.locator('[data-mode="drive"]').click(); await page.locator('[data-action="start"]').click();
  await page.locator('#tour-toggle').click();
  await page.waitForFunction(() => document.querySelector('#tour-toggle')?.getAttribute('aria-pressed') === 'true');
  for (const [width,height] of [[1440,900],[1280,577],[390,844],[320,568]]) {
    await page.setViewportSize({width,height});
    const layout = await page.evaluate(() => {
      const rect = selector => document.querySelector(selector).getBoundingClientRect();
      return { width:innerWidth, overflow:document.documentElement.scrollWidth>innerWidth,
        tourBottom:rect('.tour-panel').bottom, tankTop:rect('.tank-status').top,
        solutionTop:rect('#fire-solution').top, solutionHeight:rect('#fire-solution').height, reloadBottom:rect('#reload-label').bottom };
    });
    assert.equal(layout.overflow,false); assert.ok(layout.tourBottom<layout.tankTop);
    assert.ok(layout.solutionHeight === 0 || layout.solutionTop>layout.reloadBottom);
    if (width===320) assert.equal(layout.solutionHeight,0);
    layouts.push(layout); await page.screenshot({path:`.omo/evidence/field/final-${width}.png`});
  }
  assert.deepEqual(errors,[]); assert.deepEqual(requests,[]);
  const report = {artifactSha256:createHash('sha256').update(await readFile('九龍裝甲行動.html')).digest('hex'),layouts,errors,requests};
  await writeFile('.omo/evidence/field/artifact.json',JSON.stringify(report,null,2)); console.log(JSON.stringify(report,null,2));
} finally {await browser.close();}
