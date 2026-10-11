import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const artifact = await readFile('九龍裝甲行動.html');
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(120000);
const errors = [], network = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) network.push(request.url()); });
await page.context().setOffline(true);
await page.addInitScript(() => localStorage.setItem('kowloon-armor-settings', JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true })));
try {
  await page.goto(pathToFileURL(resolve('九龍裝甲行動.html')).href, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="settings"]').first().click({ force: true });
  await page.evaluate(() => {
    document.querySelector('#modal [data-action="close"]').click();
    document.querySelector('#app [data-action="controller"]').click();
  });
  await page.waitForTimeout(200);
  assert.ok(await page.locator('#modal label').count() > 0);
  await page.getByRole('button', { name: '關閉控制設定', exact: true }).click({ force: true });
  await page.locator('[data-mode="drive"]').click({ force: true });
  await page.locator('[data-action="start"]').click({ force: true });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('reload-label')?.textContent.startsWith('裝填'));
  const layout = await page.evaluate(() => {
    const map = document.querySelector('.minimap-wrap').getBoundingClientRect(), ammo = document.querySelector('.ammo-panel').getBoundingClientRect();
    return { mapBottom: map.bottom, ammoTop: ammo.top, overflow: document.documentElement.scrollWidth > innerWidth };
  });
  assert.ok(layout.mapBottom <= layout.ammoTop); assert.equal(layout.overflow, false);
  await page.screenshot({ path: '.omo/evidence/artifact-drive-390.png' });
  await page.keyboard.press('Escape');
  await page.locator('#modal [data-action="settings"]').click({ force: true });
  await page.locator('#modal').evaluate(modal => { modal.scrollTop = modal.scrollHeight; });
  const close = await page.locator('#modal [data-action="close"]').boundingBox();
  assert.ok(close && close.y >= 0 && close.y + close.height <= 844);
  await page.screenshot({ path: '.omo/evidence/artifact-settings-390.png' });
  await page.locator('#modal [data-action="close"]').click({ force: true });
  assert.deepEqual(errors, []); assert.deepEqual(network, []);
  assert.equal(await page.evaluate(() => 'qa' in window || 'failureHarness' in window), false);
  const report = { timestamp: new Date().toISOString(), artifactSha256: createHash('sha256').update(artifact).digest('hex'),
    browser: browser.version(), checks: ['Rapid HOTAS reopen retains fields in production bundle', 'Actual fire and non-overlapping 390 HUD', 'Scrolled settings retain visible close control'],
    layout, close, errors, networkRequests: network, productionTestHooks: false };
  await writeFile('.omo/evidence/artifact-check.json', JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
