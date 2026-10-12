import { chromium } from 'playwright';
import { mkdir, writeFile, stat, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const evidence = '.omo/evidence';
const gameplayOnly = process.argv.includes('--gameplay');
const environmentOnly = process.argv.includes('--environment');
const finalOnly = process.argv.includes('--final') || environmentOnly;
await mkdir(evidence, { recursive: true });
const source = finalOnly ? '九龍裝甲行動.html' : 'dist/index.html';
const report = { started: new Date().toISOString(), source, build: (await stat(source)).mtime.toISOString(),
  buildSha256: createHash('sha256').update(await readFile(source)).digest('hex'), checks: [], captures: [], errors: [], requests: [] };
console.log('QA: launching separate headless Edge');
const browser = await chromium.launch({ channel: 'msedge', headless: true, timeout: 20000,
  args: ['--disable-gpu-sandbox', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(15000);
page.on('pageerror', error => report.errors.push(error.message));
page.on('request', request => report.requests.push(request.url()));
const check = (name, detail) => { report.checks.push({ name, detail }); console.log('QA:', name, JSON.stringify(detail)); };
async function flush() { await writeFile(`${evidence}/${environmentOnly ? 'qa-standalone-environment' : finalOnly ? 'qa-final' : gameplayOnly ? 'qa-runtime-gameplay' : 'qa-runtime'}.json`, JSON.stringify(report, null, 2)); }
async function capture(name) {
  for (const width of [1280, 768, 375]) {
    await page.setViewportSize({ width, height: width === 768 ? 900 : width === 375 ? 812 : 800 });
    await page.waitForTimeout(250);
    const layout = await page.evaluate(() => {
      const modal = document.querySelector('#modal');
      if (modal?.open) modal.scrollTop = 0;
      for (const element of document.querySelectorAll('#app,.garage')) element.scrollTop = 0;
      document.scrollingElement.scrollTop = 0;
      const selector = modal?.open ? '#modal' : document.scrollingElement.tagName.toLowerCase();
      const owner = document.querySelector(selector);
      return { viewport: [innerWidth, innerHeight], horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        selector, scrollMaximum: Math.max(0, owner.scrollHeight - owner.clientHeight), clientHeight: owner.clientHeight };
    });
    const path = `${evidence}/qa-${name}-${width}.png`;
    await page.screenshot({ path });
    report.captures.push({ name, path, ...layout });
    if (layout.scrollMaximum > 1) {
      for (let scroll = Math.min(layout.clientHeight * .8, layout.scrollMaximum), index = 1; ; index++) {
        await page.evaluate(({ selector, scroll }) => { document.querySelector(selector).scrollTop = scroll; }, { selector: layout.selector, scroll });
        const suffix = scroll === layout.scrollMaximum ? 'bottom' : `scroll-${index}`;
        const path = `${evidence}/qa-${name}-${width}-${suffix}.png`;
        await page.screenshot({ path });
        report.captures.push({ name: `${name}-${suffix}`, path, scroll, ...layout });
        if (scroll === layout.scrollMaximum) break;
        scroll = Math.min(scroll + layout.clientHeight * .8, layout.scrollMaximum);
      }
      await page.evaluate(selector => { document.querySelector(selector).scrollTop = 0; }, layout.selector);
    }
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await flush();
  console.log('QA: captured', name);
}
async function closeModal() { await page.locator('#modal[open] [data-action="close"]').click(); }
async function hold(key, milliseconds) { await page.keyboard.down(key); await page.waitForTimeout(milliseconds); await page.keyboard.up(key); }
async function hud() {
  return page.evaluate(() => Object.fromEntries(['speed', 'gear', 'heading', 'hp-value', 'objective-count', 'mission-time', 'camera-label', 'reload-label'].map(id => [id, document.getElementById(id)?.textContent])));
}
try {
  if (finalOnly) {
    await page.context().setOffline(true);
    await page.goto(pathToFileURL(resolve(source)).href, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await page.waitForSelector('.garage');
    check('standalone offline boot', { title: await page.title(), url: page.url() });
    check('standalone controller environment', await page.evaluate(() => ({ secureContext: isSecureContext,
      gamepadApiType: typeof navigator.getGamepads, nativeGamepadCount: navigator.getGamepads().filter(Boolean).length })));
    if (!environmentOnly) {
    await page.locator('#app [data-action="settings"]').click();
    await page.locator('#quality').selectOption('low'); await closeModal();
    check('capture quality', 'low (shadows disabled)');
    await capture('garage');
    for (const [action, surface] of [['roster','roster'], ['missions','mission'], ['guide','guide'], ['about','about'], ['settings','system-settings']]) {
      await page.locator(`#app [data-action="${action}"]`).first().click();
      await capture(surface); await closeModal();
    }
    await page.locator('#app .top-actions [data-action="controller"]').click();
    await capture('settings');
    await page.getByRole('button', { name: '關閉控制設定', exact: true }).click();
    await page.locator('[data-mode="drive"]').click(); await page.locator('#app [data-action="start"]').click();
    await page.waitForSelector('.battle-hud'); await capture('battle');
    await hold('v', 900); await page.waitForTimeout(200);
    check('held camera key one edge', await page.locator('#camera-label').textContent());
    await capture('driver');
    await page.keyboard.press('v'); await page.waitForTimeout(200); await capture('gunner');
    await page.keyboard.press('v'); await page.keyboard.down('Shift'); await page.waitForTimeout(200); await capture('scope'); await page.keyboard.up('Shift');
    await page.keyboard.press('Escape'); await capture('pause');
    await page.locator('#modal [data-action="return"]').click();
    await page.locator('#modal [data-action="confirm-return"]').click();
    await page.locator('[data-mode="campaign"]').click(); await page.locator('#app [data-action="start"]').click();
    await hold('w', 1800); await hold('b', 1000); await page.keyboard.down('Space');
    for (let i = 0; i < 40; i++) {
      await page.waitForTimeout(1500);
      if (await page.locator('#modal[open] .result-medal').count()) break;
      if (i % 7 === 0) console.log('QA: final campaign', await hud());
    }
    await page.keyboard.up('Space');
    check('standalone actual UI campaign result', { text: await page.locator('#modal').textContent(), hud: await hud() });
    if (!(await page.locator('#modal[open] .result-medal').count())) throw new Error('Actual campaign result was not reached');
    await capture('result');
    check('standalone progress saved', await page.evaluate(() => Object.fromEntries(Object.entries(localStorage))));
    await page.locator('#modal [data-action="return"]').click(); await page.reload(); await page.waitForSelector('.garage');
    await page.locator('#app [data-action="missions"]').first().click();
    check('standalone reload mission2 enabled', await page.locator('[data-mission="1"]').isEnabled());
    await capture('mission-unlocked');
    check('native gamepads', await page.evaluate(() => navigator.getGamepads().filter(Boolean).length));
    } else await capture('garage');
  } else {
  await page.goto('http://127.0.0.1:4187', { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForSelector('.garage');
  if (!gameplayOnly) {
  await capture('garage');
  await page.locator('[data-action="roster"]').click();
  check('roster has 30', await page.locator('#roster-grid [data-tank]').count());
  await capture('roster');
  await page.locator('#tank-search').fill('Leclerc');
  check('roster search Leclerc', await page.locator('#roster-grid [data-tank]').allTextContents());
  await page.locator('#roster-grid [data-tank="leclercxlr"]').click();
  check('selected vehicle', await page.locator('.vehicle-panel h2').textContent());
  await page.locator('.fleet-track [data-tank]').first().click();
  await page.locator('[data-action="missions"]').first().click();
  check('initial campaign gate', { all: await page.locator('[data-mission]').count(), locked: await page.locator('[data-mission][disabled]').count() });
  await capture('mission'); await closeModal();
  await page.locator('[data-action="guide"]').click();
  await capture('guide'); await closeModal();
  await page.locator('[data-action="settings"]').click();
  await capture('system-settings');
  } else await page.locator('[data-action="settings"]').click();
  await page.locator('#quality').selectOption('low');
  await closeModal();
  await page.locator('.top-actions [data-action="controller"]').click();
  check('controller no hardware', await page.locator('.device-readouts').textContent());
  await capture('settings');
  await page.getByRole('button', { name: 'Xbox 手掣預設', exact: true }).click();
  check('Xbox fire preset', await page.getByLabel('開火按鈕（-1 停用）', { exact: true }).inputValue());
  await page.getByRole('button', { name: 'HOTAS 預設', exact: true }).click();
  check('HOTAS fire preset', await page.getByLabel('開火按鈕（-1 停用）', { exact: true }).inputValue());
  await page.getByLabel('車身轉向軸（-1 停用）', { exact: true }).fill('5');
  await page.getByLabel('車身轉向軸（-1 停用）', { exact: true }).press('Tab');
  check('axis binding saved', await page.evaluate(() => JSON.parse(localStorage.getItem('kowloon-armour.controllers.v1')).axisSteer));
  await page.getByRole('button', { name: 'HOTAS 預設', exact: true }).click();
  await page.getByRole('button', { name: '校準中立位置', exact: true }).click();
  check('calibration without device', await page.locator('.settings-panel [role="status"]').allTextContents());
  await page.getByRole('button', { name: '關閉控制設定', exact: true }).click();
  await page.locator('[data-mode="drive"]').click();
  await page.locator('[data-action="start"]').click();
  await page.waitForSelector('.battle-hud');
  await hold('w', 2000); check('drive W acceleration', await hud());
  await page.waitForFunction(() => document.getElementById('speed').textContent === '0', { timeout: 10000 });
  check('release W coasts to stop', await hud());
  await page.keyboard.press('Space');
  await page.waitForTimeout(300); check('space fires and reloads', await hud());
  await capture('battle');
  await page.keyboard.press('v'); await page.waitForTimeout(300); check('camera driver', await hud()); await capture('driver');
  await page.keyboard.press('v'); await page.waitForTimeout(300); check('camera gunner', await hud()); await capture('gunner');
  await page.keyboard.press('v'); await page.waitForTimeout(300); check('camera chase', await hud());
  await page.keyboard.press('Escape'); await capture('pause');
  const pausedTime = await page.locator('#mission-time').textContent();
  await page.waitForTimeout(1200); check('pause timer frozen', { before: pausedTime, after: await page.locator('#mission-time').textContent() });
  await page.getByRole('button', { name: '繼續演習', exact: true }).click();
  check('focus after resume', await page.evaluate(() => document.activeElement.id));
  await hold('w', 1200); check('W after pause resume', await hud());
  await hold('b', 800);
  await page.keyboard.press('h');
  check('H opens HOTAS', await page.locator('#modal').textContent());
  await page.getByRole('button', { name: '關閉控制設定', exact: true }).click();
  await hold('d', 2200); await hold('w', 7000); check('drive into side building', await hud());
  await page.screenshot({ path: `${evidence}/qa-collision-1280.png` });
  await page.keyboard.press('Escape'); await page.locator('[data-action="return"]').click();
  await page.locator('[data-action="confirm-return"]').click();
  await page.locator('[data-mode="battle"]').click(); await page.locator('[data-action="start"]').click();
  const initialHp = await page.locator('#hp-value').textContent();
  await page.waitForFunction(hp => Number(document.getElementById('hp-value').textContent) < Number(hp), initialHp, { timeout: 35000 });
  check('AI battle damages player', { initialHp, hud: await hud() });
  await page.screenshot({ path: `${evidence}/qa-ai-damage-1280.png` });
  await page.keyboard.press('Escape'); await page.locator('[data-action="return"]').click();
  await page.locator('[data-action="confirm-return"]').click();
  await page.locator('[data-mode="campaign"]').click(); await page.locator('[data-action="start"]').click();
  await hold('w', 1800); await hold('b', 1000);
  console.log('QA: playing first campaign through real Space key');
  await page.keyboard.down('Space');
  for (let i = 0; i < 30; i++) {
    await page.waitForTimeout(2000);
    if (await page.locator('#modal[open] .result-medal').count()) break;
    if (i % 3 === 0) console.log('QA: campaign progress', await hud());
  }
  await page.keyboard.up('Space');
  check('campaign UI result', { modal: await page.locator('#modal').textContent(), hud: await hud() });
  if (await page.locator('#modal[open] .result-medal').count()) {
    await capture('result');
    await page.locator('[data-action="return"]').click();
    await page.locator('[data-action="missions"]').first().click();
    check('unlocked mission after victory', { locked: await page.locator('[data-mission][disabled]').count(), mission2: await page.locator('[data-mission="1"]').textContent() });
    await closeModal();
    await page.reload(); await page.waitForSelector('.garage');
    await page.locator('[data-action="missions"]').first().click();
    check('reload preserves progress', { locked: await page.locator('[data-mission][disabled]').count(), mission2Enabled: await page.locator('[data-mission="1"]').isEnabled() });
    await page.screenshot({ path: `${evidence}/qa-unlocked-reload-1280.png` });
  }
  check('browser gamepads', await page.evaluate(() => navigator.getGamepads().filter(Boolean).length));
  }
} catch (error) {
  report.failure = String(error);
  console.error('QA FAILURE', error);
  await page.screenshot({ path: `${evidence}/qa-failure.png` }).catch(() => {});
} finally {
  report.finished = new Date().toISOString();
  await flush();
  if (environmentOnly && !report.failure) {
    const complete = JSON.parse(await readFile(`${evidence}/qa-final.json`, 'utf8'));
    if (complete.buildSha256 !== report.buildSha256) throw new Error('Supplemental evidence build hash differs');
    complete.captures = [...complete.captures.filter(capture => !capture.name.startsWith('garage')), ...report.captures];
    complete.supplementalEnvironment = report;
    await writeFile(`${evidence}/qa-final.json`, JSON.stringify(complete, null, 2));
  }
  console.log('QA evidence saved', report.captures.length, report.errors);
  await browser.close();
}
