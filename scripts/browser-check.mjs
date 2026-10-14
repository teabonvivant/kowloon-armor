import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const evidence = '.omo/evidence';
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
await context.setOffline(true);
const captureRendering = process.env.EFFECTS_FUNCTIONAL_RENDER === '1';
if (captureRendering) await context.addInitScript(() => {
  window.functionalPaint = false;
  for (const key of ['clear', 'drawElements', 'drawElementsInstanced', 'drawArrays', 'drawArraysInstanced']) {
    const original = WebGL2RenderingContext.prototype[key];
    WebGL2RenderingContext.prototype[key] = function (...args) { if (window.functionalPaint) return original.apply(this, args); };
  }
});
const page = await context.newPage();
page.setDefaultTimeout(60000);
const errors = [], requests = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => requests.push(request.url()));
const click = selector => page.locator(selector).first().click({ force: true });
const text = selector => page.locator(selector).textContent();
const check = (name, details = true) => { checks.push({ name, details }); console.log(name, JSON.stringify(details)); };
async function capture(name) {
  if (captureRendering) await page.evaluate(async () => {
    window.functionalPaint = true; await new Promise(requestAnimationFrame); window.functionalPaint = false;
    const gl = document.querySelector('#world').getContext('webgl2');
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
  });
  await page.screenshot({ path: `${evidence}/release-${name}.png`, timeout: 120000 });
}
async function waitValue(id, predicate, timeout = 90000) {
  await page.waitForFunction(({ id, predicate }) => new Function('value', `return ${predicate}`)(document.getElementById(id)?.textContent), { id, predicate }, { timeout, polling: 200 });
}
async function returnGarage() {
  const runningTime = await text('#mission-time');
  await waitValue('mission-time', `value !== ${JSON.stringify(runningTime)}`);
  await page.keyboard.press('Escape'); await page.locator('#modal[open]').waitFor(); await click('#modal [data-action="return"]');
  await click('#modal [data-action="confirm-return"]');
  await page.locator('.garage').waitFor();
}
try {
  await page.goto(pathToFileURL(resolve('九龍裝甲行動.html')).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.garage', { state: 'attached' });
  assert.equal(await page.locator('[data-mode]').count(), 4);
  check('offline standalone boots with all four modes');
  await click('[data-action="settings"]');
  await page.locator('#quality').selectOption('low');
  await page.locator('#reduce-motion').check({ force: true });
  await page.locator('#hud-scale').selectOption('1.15');
  await click('#tab-controls');
  await page.locator('#sensitivity').evaluate(input => { input.value = '1.6'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  await page.locator('#invert-y').check({ force: true });
  await page.locator('#scope-zoom').selectOption('3');
  await page.locator('#scope-mode').selectOption('toggle');
  await capture('settings');
  await click('#modal [data-action="close"]');
  await page.reload({ waitUntil: 'domcontentloaded' });
  await click('[data-action="settings"]');
  assert.equal(await page.locator('#quality').inputValue(), 'low');
  assert.equal(await page.locator('#hud-scale').inputValue(), '1.15');
  await page.locator('#hud-scale').selectOption('1');
  await click('#tab-controls');
  assert.equal(await page.locator('#sensitivity').inputValue(), '1.6');
  assert.equal(await page.locator('#invert-y').isChecked(), true);
  assert.equal(await page.locator('#scope-zoom').inputValue(), '3');
  assert.equal(await page.locator('#scope-mode').inputValue(), 'toggle');
  await page.locator('#scope-mode').selectOption('hold');
  await page.locator('#invert-y').uncheck({ force: true });
  check('quality, mouse and motion preferences survive reload');
  await click('#modal [data-action="close"]');
  await click('[data-action="settings"]'); await click('#tab-controls'); await click('[data-action="keyboard"]');
  await click('[data-bind="fire"]'); await page.keyboard.press('r');
  assert.equal(await text('[data-bind="fire"]'), 'R');
  await click('#modal [data-action="close"]'); await page.reload({ waitUntil: 'domcontentloaded' });
  await click('[data-action="settings"]'); await click('#tab-controls'); await click('[data-action="keyboard"]');
  assert.equal(await text('[data-bind="fire"]'), 'R');
  await click('[data-bind="fire"]'); await page.keyboard.press('Escape');
  assert.equal(await page.locator('#modal').evaluate(modal => modal.open), true);
  await click('#reset-keys'); assert.equal(await text('[data-bind="fire"]'), 'Space');
  await click('#modal [data-action="close"]');
  check('key remapping persists, Escape cancels capture, and defaults restore');
  for (const [width, height] of [[1440, 900], [1280, 800], [960, 640], [768, 900], [390, 844]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const deploy = document.querySelector('[data-action="start"]').getBoundingClientRect();
      const fleet = document.querySelector('.fleet').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth, deployBottom: deploy.bottom, fleetTop: fleet.top };
    });
    assert.equal(layout.overflow, false, `Horizontal overflow at ${width}`);
    assert.ok(layout.deployBottom <= layout.fleetTop, `Deployment and fleet overlap at ${width}`);
    await capture(`garage-${width}`);
    check(`garage layout ${width}x${height}`, layout);
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await click('[data-action="roster"]');
  assert.equal(await page.locator('#roster-grid [data-tank]').count(), 30);
  await page.locator('#tank-search').fill('EMBT');
  await click('#roster-grid [data-tank="embt"]');
  assert.match(await text('.vehicle-panel h2'), /EMBT/);
  assert.equal(await page.locator('.fleet-track [aria-pressed="true"]').count(), 1);
  await capture('prototype');
  check('30 vehicles, search and selected vehicle remain accessible in carousel');
  await click('[data-action="roster"]');
  await page.locator('#tank-search').fill('Leopard 2 A8');
  await click('#roster-grid [data-tank="leopard2a8"]');
  await click('[data-action="missions"]');
  assert.equal(await page.locator('[data-mission][disabled]').count(), 5);
  await click('#modal [data-action="close"]');
  await click('[data-mode="drive"]'); await click('[data-action="start"]');
  await page.keyboard.down('w'); await waitValue('speed', 'Number(value) >= 12'); await page.keyboard.up('w');
  check('keyboard acceleration', await text('#speed'));
  await page.keyboard.down('b'); await waitValue('speed', 'value === "0"'); await page.keyboard.up('b');
  await page.keyboard.down('s'); await waitValue('gear', 'value === "R"'); await page.keyboard.up('s');
  await page.keyboard.down('b'); await waitValue('speed', 'value === "0"'); await page.keyboard.up('b');
  check('braking and reverse');
  await page.keyboard.down('e'); await waitValue('heading', 'value !== "000°"'); await page.keyboard.up('e');
  await page.keyboard.press('f'); await waitValue('heading', 'value === "000°"');
  check('independent turret and recenter');
  await page.keyboard.down('c'); await page.keyboard.down('e');
  await waitValue('camera-label', 'value.includes("獨立觀察")');
  assert.equal(await text('#heading'), '000°');
  await page.keyboard.up('e'); await page.keyboard.up('c');
  check('free observation leaves turret bearing unchanged');
  for (const name of ['駕駛員視角', '炮手視角', '第三身視角']) {
    await page.keyboard.press('v'); await waitValue('camera-label', `value === ${JSON.stringify(name)}`);
  }
  await page.keyboard.down('Shift'); await waitValue('camera-label', 'value === "瞄準鏡"'); await capture('scope');
  await page.keyboard.up('Shift');
  await page.keyboard.down('Space'); await waitValue('reload-label', 'value.startsWith("裝填")'); await page.keyboard.up('Space');
  await capture('driving');
  check('three cameras, scope and shell reload');
  await page.keyboard.press('m');
  await page.waitForFunction(() => document.pointerLockElement?.id === 'world');
  await page.mouse.move(660, 405);
  await page.keyboard.press('Escape');
  await page.waitForSelector('#modal[open]');
  assert.equal(await page.evaluate(() => document.pointerLockElement), null);
  check('pointer lock releases into pause');
  const pausedTime = await text('#mission-time');
  await page.waitForTimeout(1200);
  assert.equal(await text('#mission-time'), pausedTime);
  await click('#modal [data-action="close"]');
  await page.keyboard.press('h');
  await page.waitForSelector('.settings-panel');
  assert.match(await text('.device-readouts'), /未|沒有|按/);
  await page.getByRole('button', { name: 'Xbox 手掣預設', exact: true }).click({ force: true });
  await page.getByRole('button', { name: 'HOTAS 預設', exact: true }).click({ force: true });
  const controllerPausedTime = await text('#mission-time');
  await page.getByRole('button', { name: '關閉控制設定', exact: true }).click({ force: true });
  await waitValue('mission-time', `value !== ${JSON.stringify(controllerPausedTime)}`);
  await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  await page.waitForSelector('#modal[open]');
  await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  await capture('pause');
  await click('#modal [data-action="return"]');
  await click('#modal [data-action="confirm-return"]');
  check('pause freezes time, HOTAS settings and focus loss remain safe');
  await click('[data-mode="battle"]'); await page.locator('#difficulty').selectOption('veteran');
  await click('[data-action="start"]'); await waitValue('objective-count', 'value.includes("/ 4")');
  await capture('skirmish'); await returnGarage();
  await click('[data-mode="survival"]'); await page.locator('#difficulty').selectOption('training');
  await click('[data-action="start"]'); await waitValue('objective-title', 'value.includes("第 1 波")');
  await capture('survival'); await returnGarage();
  check('skirmish and survival deploy with selected difficulty');
  await click('[data-mode="campaign"]'); await page.locator('#difficulty').selectOption('training');
  await click('[data-action="start"]');
  await page.keyboard.down('Space');
  await page.waitForSelector('#modal[open] .result-medal', { state: 'attached', timeout: 600000 });
  await page.keyboard.up('Space');
  assert.equal(await text('#modal-title'), '任務完成');
  assert.match(await page.locator('.debrief-line').first().textContent(), /命中率/);
  await capture('victory');
  const progress = await page.evaluate(() => JSON.parse(localStorage.getItem('kowloon-armor-progress')));
  assert.equal(progress.completed, 1);
  assert.ok(progress.bestScores['campaign:1:training'] > 0);
  check('real held-fire campaign victory and difficulty-specific score', progress);
  await click('#modal [data-action="next"]');
  await waitValue('objective-count', 'value.includes("/ 3")');
  await returnGarage();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await click('[data-action="missions"]');
  assert.equal(await page.locator('[data-mission="1"]').isEnabled(), true);
  check('next mission starts and unlock survives reload');
  assert.deepEqual(errors, []);
  assert.equal(requests.filter(url => /^https?:/.test(url)).length, 0);
  check('zero browser errors and zero network asset requests');
} catch (error) {
  await capture('failure').catch(() => {});
  throw error;
} finally {
  await writeFile(`${evidence}/browser-check.json`, JSON.stringify({ browser: browser.version(), checks, errors, requests,
    rendering: captureRendering ? 'Functional input/UI suite: normal simulation clock, GPU draws only for captured frames with synchronous readback. Not continuous-render performance.' : 'Normal continuous rendering.',
    limitations: ['Linux headless Chromium / SwiftShader; no physical HOTAS.', 'Wave transitions also have deterministic simulation coverage.'] }, null, 2));
  await browser.close();
}
