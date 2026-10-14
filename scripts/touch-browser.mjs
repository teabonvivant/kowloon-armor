import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const evidence = '.omo/evidence/touch';
const framing = process.argv.includes('--framing');
const captureRendering = process.env.EFFECTS_FUNCTIONAL_RENDER === '1';
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1, reducedMotion: 'reduce' });
await context.setOffline(true);
await context.addInitScript(() => {
  if (!localStorage.getItem('kowloon-armor-settings')) localStorage.setItem('kowloon-armor-settings', JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true }));
});
if (captureRendering) await context.addInitScript(() => {
  window.functionalPaint = false;
  for (const key of ['clear', 'drawElements', 'drawElementsInstanced', 'drawArrays', 'drawArraysInstanced']) {
    const original = WebGL2RenderingContext.prototype[key];
    WebGL2RenderingContext.prototype[key] = function (...args) { if (window.functionalPaint) return original.apply(this, args); };
  }
});
const page = await context.newPage(); page.setDefaultTimeout(120000);
const errors = [], requests = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
const check = (name, data = true) => { checks.push({ name, data }); console.log(name, JSON.stringify(data)); };
async function capture(name) {
  if (captureRendering) await page.evaluate(async () => {
    window.functionalPaint = true; await new Promise(requestAnimationFrame); window.functionalPaint = false;
    const gl = document.querySelector('#world').getContext('webgl2');
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  });
  await page.screenshot({ path: `${evidence}/${name}.png` });
}
const cdp = await context.newCDPSession(page);
const fingers = new Map();
async function touch(type, id, x, y) {
  const ending = fingers.get(id);
  if (type === 'touchEnd') fingers.delete(id); else fingers.set(id, { id, x, y, radiusX: 3, radiusY: 3 });
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [ending] : [...fingers.values()] });
}
async function center(selector) {
  const box = await page.locator(selector).boundingBox(); assert.ok(box, selector);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2, box };
}
async function resume() {
  if (await page.locator('#modal').evaluate(modal => modal.open)) await page.locator('#modal [data-action="close"]').first().tap();
  await page.locator('#touch-controls').waitFor();
}
try {
  await page.goto(pathToFileURL(resolve('九龍裝甲行動.html')).href);
  await page.locator('.garage').waitFor();
  assert.equal(await page.locator('body').evaluate(body => body.classList.contains('touch-enabled')), true);
  await page.locator('[data-mode="drive"]').tap(); await page.locator('[data-action="start"]').tap();
  await page.locator('#touch-controls').waitFor();
  assert.equal(await page.locator('.minimap-wrap').isVisible(), false);
  assert.equal(await page.locator('.battle-keybar').isVisible(), false);
  assert.equal(await page.locator('.ammo-panel').isVisible(), false);
  check('offline phone automatically selects touch and removes redundant HUD');
  await capture('initial-landscape');
  if (!framing) {
  await page.locator('.compact-map').tap();
  assert.equal(await page.locator('#touch-controls').isVisible(), false);
  assert.match(await page.locator('.event-log').innerText(), /尚未開炮或受擊/);
  await resume();
  const stick = await center('#touch-stick'), fire = await center('#touch-fire');
  await touch('touchStart', 1, 520, 170); await touch('touchMove', 1, 550, 155);
  await touch('touchStart', 2, stick.x, stick.y); await touch('touchMove', 2, stick.x + 10, stick.y - 45);
  await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) > 0);
  await touch('touchStart', 3, fire.x, fire.y);
  await page.waitForFunction(() => document.querySelector('#reload-label').textContent.includes('裝填'));
  await touch('touchEnd', 3); await touch('touchEnd', 2); await touch('touchEnd', 1);
  await page.waitForFunction(() => Number(document.querySelector('#speed').textContent) === 0);
  await page.locator('.compact-map').tap();
  assert.match(await page.locator('.event-log').innerText(), /主炮發射/);
  check('real CDP multitouch drives, aims, fires, then release brakes; journal records cannon');
  await resume(); await page.locator('#touch-scope').tap();
  assert.equal(await page.locator('#touch-scope').getAttribute('aria-pressed'), 'true');
  await page.waitForFunction(() => document.querySelector('#reticle').classList.contains('scoped'));
  await page.locator('#touch-scope').tap(); await page.locator('#touch-observe').tap();
  await page.waitForFunction(() => !document.querySelector('#observation-status').hidden);
  await page.locator('#touch-observe').tap(); await page.locator('#touch-recentre').tap();
  await page.waitForFunction(() => document.querySelector('#turret-bearing').textContent === '炮塔 0°');
  check('scope toggle, independent observation and recenter run through touch controls');
  }
  const layouts = [];
  for (const [width, height] of [[844,390], [390,844], [320,568], [568,320], [768,1024], [1024,768], [1366,1024]]) {
    await page.setViewportSize({ width, height }); await resume();
    await page.locator('#touch-controls').waitFor();
    const layout = await page.evaluate(() => {
      const selectors = ['#touch-stick', '#touch-fire', '#touch-scope', '#touch-observe', '#touch-recentre', '[data-touch-hold="brake"]', '.compact-map', '.hud-tools [data-action="pause"]'];
      const rectangles = selectors.map(selector => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { selector, x:rect.x,y:rect.y,width:rect.width,height:rect.height };
      });
      return { overflow: document.documentElement.scrollWidth > innerWidth, width:innerWidth,height:innerHeight, rectangles,
        center: document.elementFromPoint(innerWidth / 2, innerHeight / 2)?.id };
    });
    assert.equal(layout.overflow, false); assert.equal(layout.center, 'world');
    for (const rect of layout.rectangles) {
      assert.ok(rect.width >= 44 && rect.height >= 44, JSON.stringify(rect));
      assert.ok(rect.x >= 0 && rect.y >= 0 && rect.x + rect.width <= width + 1 && rect.y + rect.height <= height + 1, JSON.stringify(rect));
    }
    for (const [index, first] of layout.rectangles.entries()) for (const second of layout.rectangles.slice(index + 1)) {
      assert.ok(first.x + first.width <= second.x || second.x + second.width <= first.x || first.y + first.height <= second.y || second.y + second.height <= first.y, `${first.selector} overlaps ${second.selector}`);
    }
    await capture(`touch-${width}x${height}`); layouts.push(layout);
  }
  check('seven phone/tablet viewports: clear center, controls >=44px, no overlapping controls or overflow', layouts);
  if (!framing) {
  await page.setViewportSize({ width:844, height:390 }); await resume();
  await page.locator('.hud-tools [data-action="pause"]').tap(); await page.locator('#modal [data-action="settings"]').tap();
  await page.locator('#tab-controls').tap(); await page.locator('#touchHand').selectOption('left');
  check('touch settings panel accepts handedness change');
  await page.locator('#touchInvert').check(); await page.locator('#touchAutoBrake').uncheck();
  await page.locator('#touchSensitivity').press('End');
  const savedBeforeReload = await page.evaluate(() => ({ settings: JSON.parse(localStorage.getItem('kowloon-armor-settings')), status: document.querySelector('#settings-save-status')?.textContent }));
  console.log('saved touch settings before reload', JSON.stringify({ ...savedBeforeReload, errors }));
  assert.equal(savedBeforeReload.settings.touchHand, 'left');
  await page.reload(); await page.locator('.garage').waitFor();
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('kowloon-armor-settings')));
  assert.equal(settings.touchHand,'left'); assert.equal(settings.touchInvert,true); assert.equal(settings.touchAutoBrake,false); assert.equal(settings.touchSensitivity,2);
  await page.locator('[data-mode="drive"]').tap(); await page.locator('[data-action="start"]').tap();
  assert.ok((await center('#touch-fire')).x < (await center('#touch-stick')).x);
  await capture('left-handed');
  check('left-handed controls and independent touch settings survive reload', settings);
  await page.setViewportSize({ width:390,height:844 });
  await page.locator('#modal[open]').waitFor(); assert.equal(await page.locator('#touch-controls').isVisible(), false);
  await resume(); assert.equal(await page.locator('#touch-scope').getAttribute('aria-pressed'),'false');
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.locator('#modal[open]').waitFor();
  check('orientation and focus loss pause and clear held touch state');
  } else {
    await context.close();
    const desktop = await browser.newContext({ viewport: {width:1440,height:900}, reducedMotion:'reduce' });
    await desktop.setOffline(true);
    await desktop.addInitScript(()=>localStorage.setItem('kowloon-armor-settings',JSON.stringify({quality:'low',volume:0,reducedMotion:true})));
    const screen = await desktop.newPage(); screen.setDefaultTimeout(120000);
    await screen.bringToFront();
    screen.on('pageerror',error=>errors.push(error.message));
    await screen.goto(pathToFileURL(resolve('九龍裝甲行動.html')).href);
    await screen.locator('.garage').waitFor();
    assert.equal(await screen.locator('body').evaluate(body=>body.classList.contains('touch-enabled')),false);
    await screen.locator('[data-mode="drive"]').click();await screen.locator('[data-action="start"]').click();
    assert.equal(await screen.locator('#touch-controls').isVisible(),false);
    await screen.bringToFront(); await screen.locator('#world').focus();
    await screen.keyboard.down('w');await screen.waitForFunction(()=>Number(document.querySelector('#speed').textContent)>0);await screen.keyboard.up('w');
    await screen.keyboard.down('b');await screen.waitForFunction(()=>Number(document.querySelector('#speed').textContent)===0);await screen.keyboard.up('b');
    await screen.screenshot({path:`${evidence}/desktop-1440.png`});
    await screen.keyboard.press('Escape');await screen.locator('#modal[open]').waitFor();
    check('final offline desktop keeps keyboard drive, brake and pause without touch overlay');
    await desktop.close();
  }
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  check('no JavaScript errors or external asset requests');
  const sha256 = createHash('sha256').update(await readFile('九龍裝甲行動.html')).digest('hex');
  await writeFile(`${evidence}/${framing ? 'framing' : 'browser'}.json`, JSON.stringify({ sha256, checks, errors, requests,
    rendering: captureRendering ? 'Normal simulation clock; WebGL submits only for screenshots with synchronous readback. Functional regression, not continuous-render performance.' : 'Normal continuous WebGL rendering.' },null,2));
} finally { await browser.close(); }
