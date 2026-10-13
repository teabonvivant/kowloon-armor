import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';

const url = process.argv[2] ?? pathToFileURL(resolve('九龍裝甲行動.html')).href;
const live = url.startsWith('https:');
const folder = '.omo/evidence/touch';
await mkdir(folder, { recursive: true });
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const expected = hash(await readFile('九龍裝甲行動.html'));
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const errors = [], requests = [];
try {
  const context = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, reducedMotion: 'reduce' });
  if (!live) await context.setOffline(true);
  await context.addInitScript(() => localStorage.setItem('kowloon-armor-settings', JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true })));
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));
  page.on('request', request => { if (request.resourceType() !== 'document' && /^https?:/.test(request.url())) requests.push(request.url()); });
  const response = await page.goto(url);
  if (live) { assert.equal(response.status(), 200); assert.equal(hash(await response.body()), expected); }
  await page.locator('.garage').waitFor();
  assert.equal(await page.locator('body').evaluate(body => body.classList.contains('touch-enabled')), true);
  await page.locator('[data-mode="drive"]').tap(); await page.locator('[data-action="start"]').tap();
  await page.locator('#touch-fire').tap();
  await page.waitForFunction(() => document.querySelector('#reload-label')?.textContent.includes('裝填'));
  await page.locator('.compact-map').tap();
  await page.waitForFunction(() => document.querySelector('.event-log')?.textContent.includes('主炮發射'));
  assert.equal(await page.locator('#touch-controls').isVisible(), false);
  await page.locator('#modal [data-action="close"]').first().tap();
  await page.locator('#touch-controls').waitFor();
  await page.screenshot({ path: `${folder}/${live ? 'live' : 'offline'}-smoke.png` });
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  const result = { url, sha256: expected, touchAuto: true, quickTapCannon: true, mapPauseResume: true, errors, requests };
  await writeFile(`${folder}/${live ? 'live' : 'offline'}-smoke.json`, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
} finally { await browser.close(); }
