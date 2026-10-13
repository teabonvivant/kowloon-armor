import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const evidence = '.omo/evidence/operations';
const sourceOnly = process.argv.includes('--source-only');
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 577 }, reducedMotion: 'reduce' });
await context.setOffline(true);
const page = await context.newPage(); page.setDefaultTimeout(120000);
const errors = [], requests = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
const check = (name, result = true) => { checks.push({ name, result }); console.log(name, JSON.stringify(result)); };
const range = async (id, value) => {
  const field = page.locator(`#${id}`);
  const limits = await field.evaluate(element => ({ min: Number(element.min), step: Number(element.step) }));
  await field.press('Home');
  for (let index = 0; index < Math.round((Number(value) - limits.min) / limits.step); index++) await field.press('ArrowRight');
};
await page.addInitScript(() => { if (!localStorage.getItem('kowloon-armor-settings')) localStorage.setItem('kowloon-armor-settings', JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true })); });
try {
  if (!sourceOnly) {
  await page.goto(pathToFileURL(resolve('九龍裝甲行動.html')).href);
  await page.locator('.garage').waitFor();
  for (const [width, height] of [[1440, 900], [1280, 577], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${evidence}/garage-${width}.png`, fullPage: true });
  }
  await page.setViewportSize({ width: 1280, height: 577 });
  await page.locator('[data-action="preparation"]').click();
  await page.locator('[data-action="favorite"]').click();
  await page.locator('#compare-tank').selectOption('type10');
  assert.match(await page.locator('#comparison').innerText(), /Type 10/);
  await page.locator('#sortie-seed').fill('4294967296'); await page.locator('#apply-sortie').click();
  assert.match(await page.locator('#sortie-status').innerText(), /須為/);
  await page.locator('#sortie-seed').fill('12345'); await page.locator('#sortie-challenge').selectOption('precision');
  await page.locator('#apply-sortie').click(); assert.match(await page.locator('#sortie-status').innerText(), /12345/);
  await page.screenshot({ path: `${evidence}/preparation.png` });
  await page.locator('#modal [data-action="close"]').first().click();
  await page.reload(); await page.locator('.garage').waitFor();
  await page.locator('[data-action="roster"]').click(); await page.locator('#favorites-only').check();
  assert.equal(await page.locator('#roster-grid [data-tank]').count(), 1);
  await page.locator('#tank-search').fill('not-a-tank'); assert.equal(await page.locator('#random-tank').isDisabled(), true);
  await page.locator('#tank-search').fill(''); await page.locator('#random-tank').click();
  assert.match(await page.locator('.vehicle-panel h2').innerText(), /Leopard/);
  check('production favorites persist, comparison, invalid seed and filtered random selection');
  await page.locator('[data-action="settings"]').click();
  for (const [id, value] of Object.entries({ chaseDistance: '22', chaseFov: '75', shakeStrength: '0.3', reticleWidth: '3' })) {
    await range(id, value);
  }
  await page.locator('#reticleColor').selectOption('cyan'); await page.locator('#lowFlash').check(); await page.locator('#diagnostics').check();
  await page.locator('#tab-controls').click(); await range('scopeSensitivity', .5);
  await page.locator('#tab-audio').click();
  for (const id of ['effectsVolume', 'engineVolume', 'alertsVolume']) await range(id, .4);
  await page.reload(); await page.locator('.garage').waitFor();
  const settings = await page.evaluate(() => JSON.parse(localStorage.getItem('kowloon-armor-settings')));
  assert.equal(settings.chaseDistance, 22); assert.equal(settings.chaseFov, 75); assert.equal(settings.scopeSensitivity, .5);
  assert.equal(settings.effectsVolume, .4); assert.equal(settings.engineVolume, .4); assert.equal(settings.alertsVolume, .4);
  assert.equal(settings.reticleWidth, 3); assert.equal(settings.lowFlash, true);
  check('production comfort settings persist and apply after reload', settings);
  await page.locator('[data-action="preparation"]').click();
  await page.locator('#sortie-seed').fill('12345'); await page.locator('#sortie-challenge').selectOption('precision');
  await page.locator('#apply-sortie').click(); await page.locator('#modal [data-action="close"]').first().click();
  await page.locator('[data-mode="battle"]').click(); await page.locator('[data-action="start"]').click();
  await page.locator('[data-action="tactical"]').click();
  assert.match(await page.locator('.tactical-summary').innerText(), /種子 12345/);
  assert.match(await page.locator('.tactical-summary').innerText(), /精準射手/);
  await page.locator('[data-waypoint="0"]').click();
  assert.match(await page.locator('#waypoint-status').innerText(), /已設定/);
  assert.equal(await page.locator('#map-waypoint circle').count(), 1);
  await page.locator('#waypoint-x').fill('42'); await page.locator('#waypoint-z').fill('42');
  await page.locator('#waypoint-form [type="submit"]').click();
  assert.match(await page.locator('#waypoint-status').innerText(), /建築物/);
  assert.equal(await page.locator('#map-waypoint circle').count(), 1);
  for (const [width, height] of [[1440, 900], [1280, 577], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.locator('#modal').evaluate(element => { element.scrollTop = 0; });
    await page.screenshot({ path: `${evidence}/map-${width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 577 });
  await page.locator('#modal [data-action="close"]').first().click();
  await page.waitForFunction(() => !document.querySelector('#waypoint-hint').hidden);
  assert.match(await page.locator('#waypoint-hint').innerText(), /航點/);
  await page.locator('#world').focus(); await page.keyboard.down('Space');
  await page.waitForFunction(() => document.querySelector('#reload-label').textContent.includes('裝填'));
  await page.keyboard.up('Space');
  await page.locator('[data-action="tactical"]').click(); assert.match(await page.locator('.event-log').innerText(), /主炮發射/);
  await page.locator('#clear-waypoint').click(); assert.equal(await page.locator('#map-waypoint circle').count(), 0);
  await page.locator('#modal [data-action="close"]').first().click();
  await page.waitForFunction(() => document.querySelector('#waypoint-hint').hidden);
  await page.screenshot({ path: `${evidence}/battle.png` });
  check('production seeded challenge, map, invalid waypoint preservation, HUD, fire journal and clear');
  }

  const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
    import { View } from './src/view'; import { Game } from './src/game'; import { Input } from './src/input';
    import { Interface } from './src/interface'; import { GameAudio } from './src/audio'; import { updateHud } from './src/hud';
    const view = new View(document.querySelector('canvas')), audio = new GameAudio(), input = new Input(view.canvas);
    const game = new Game(view.scene, view.world, {shot(){}, hit(){}, finish: victory => ui.finish(victory), notify(){}});
    const ui = new Interface(game, input, view, audio); window.qa = {view, game, ui, input, GameAudio, updateHud};
  ` }, bundle: true, format: 'iife', write: false });
  const css = (await Promise.all(['src/style.css', 'src/hud.css'].map(file => readFile(file, 'utf8')))).join('\n');
  const harness = resolve(evidence, 'harness.html');
  await writeFile(harness, `<style>${css}</style><canvas id="world"></canvas><div id="app"></div><dialog id="modal"></dialog><div id="notice"></div><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
  await page.goto(pathToFileURL(harness).href);
  await page.locator('[data-mode="battle"]').click(); await page.locator('[data-action="start"]').click();
  await page.evaluate(() => {
    const {game, updateHud} = window.qa;
    game.enemies[0].visual.root.position.set(0,0,60); updateHud(game);
  });
  for (const [width, height] of [[1280,577], [390,844], [320,568]]) {
    await page.setViewportSize({width,height});
    await page.evaluate(() => window.qa.view.render(window.qa.game, .1));
    const layout = await page.evaluate(() => {
      const info = document.getElementById('target-analysis').getBoundingClientRect(), aim = document.getElementById('reticle').getBoundingClientRect();
      const map = document.querySelector('.operations-toggle').getBoundingClientRect(), compass = document.querySelector('.compass').getBoundingClientRect();
      return {height: info.height, bottom: info.bottom, aimTop: aim.top, mapOverlapsCompass: map.left < compass.right && map.right > compass.left && map.top < compass.bottom && map.bottom > compass.top};
    });
    assert.ok(layout.height === 0 || layout.bottom < layout.aimTop, 'Target analysis must stay above the crosshair');
    assert.equal(layout.mapOverlapsCompass, false, 'Map button must not obscure heading');
    await page.screenshot({path:`${evidence}/target-${width}.png`});
  }
  await page.setViewportSize({width:1280,height:577});
  check('source target analysis stays clear of reticle at three viewports');
  const camera = await page.evaluate(() => {
    const {game, view} = window.qa;
    view.chaseDistance = 22; view.chaseFov = 75; view.render(game, 1);
    const fov = view.camera.fov, distance = Math.hypot(view.camera.position.x - game.player.visual.root.position.x, view.camera.position.z - game.player.visual.root.position.z);
    game.scope = true; view.render(game, 1); const scoped = view.camera.fov;
    game.scope = false; view.render(game, 1); return {fov, distance, scoped};
  });
  assert.equal(camera.fov, 75); assert.ok(camera.distance > 21.9 && camera.distance <= 22.01); assert.equal(camera.scoped, 25);
  await page.locator('[data-action="tactical"]').click();
  const bounds = await page.locator('#tactical-map').boundingBox();
  await page.locator('#tactical-map').click({position:{x:bounds.width / 2, y:bounds.height * 304 / 440}});
  assert.match(await page.locator('#waypoint-status').innerText(), /已設定/);
  await page.locator('#modal [data-action="close"]').first().click();
  check('source camera distance, FOV, unchanged scope zoom and real map click', camera);
  const before = await page.evaluate(() => {
    const {game, ui, updateHud, view} = window.qa;
    const enemy = game.enemies[0]; enemy.visual.root.position.set(0,0,60); enemy.speed = 10; enemy.yaw = -Math.PI / 2;
    updateHud(game); view.render(game, .1);
    const analysis = document.getElementById('target-analysis').textContent;
    const seed = game.seed; game.challenge = 'precision'; game.shots = 10; game.hits = 8;
    game.phase = 'victory'; ui.finish(true);
    return {seed, analysis};
  });
  assert.match(before.analysis, /耐久/); assert.match(before.analysis, /提前 右/);
  assert.match(await page.locator('.challenge-result').innerText(), /挑戰達成/);
  const downloadPromise = page.waitForEvent('download'); await page.locator('[data-action="export-report"]').click();
  const download = await downloadPromise; await download.saveAs(`${evidence}/battle-report.json`);
  const report = JSON.parse(await readFile(`${evidence}/battle-report.json`, 'utf8'));
  assert.equal(report.seed, before.seed); assert.equal(report.shots, 10); assert.equal(report.challenge.complete, true);
  await page.locator('[data-action="replay"]').click();
  const replay = await page.evaluate(() => ({seed: window.qa.game.seed, shots: window.qa.game.shots, challenge: window.qa.game.challenge, phase: window.qa.game.phase}));
  assert.equal(replay.seed, before.seed); assert.equal(replay.shots, 0); assert.equal(replay.challenge, 'precision'); assert.equal(replay.phase, 'playing');
  check('source integration target analysis, challenge result, real report download and same-seed replay', replay);
  const audio = await page.evaluate(async () => {
    const render = async (effects, engine, alerts) => {
      const offline = new OfflineAudioContext(2, 22050 * 3, 22050); let time = 0;
      const proxy = new Proxy(offline, { get(target, key) { if (key === 'state') return 'running'; if (key === 'currentTime') return time; const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
      const original = window.AudioContext; window.AudioContext = function () { return proxy; };
      const sound = new window.qa.GameAudio(); sound.setMix(effects, engine, alerts); sound.unlock(); sound.setVolume(1); sound.setMusicVolume(0);
      sound.engine(10); sound.fire({x: 10, z: -10}); sound.ready(); time = 1.5; sound.stop(); window.AudioContext = original;
      const buffer = await offline.startRendering(); let peak = 0, tail = 0;
      for (let channel = 0; channel < 2; channel++) for (const [index, value] of buffer.getChannelData(channel).entries()) { peak = Math.max(peak, Math.abs(value)); if (index > 2.5 * 22050) tail = Math.max(tail, Math.abs(value)); }
      return {peak, tail};
    };
    return {muted: await render(0,0,0), effects: await render(1,0,0), engine: await render(0,1,0), alerts: await render(0,0,1)};
  });
  assert.ok(audio.muted.peak < 1e-7);
  for (const key of ['effects', 'engine', 'alerts']) { assert.ok(audio[key].peak > .001 && audio[key].peak < .99); assert.ok(audio[key].tail < .0001); }
  check('offline audio render isolates three buses and pause silence', audio);
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  await writeFile(`${evidence}/${sourceOnly ? 'source-report' : 'report'}.json`, JSON.stringify({artifactSha256: createHash('sha256').update(await readFile('九龍裝甲行動.html')).digest('hex'), sourceOnly, checks, errors, requests}, null, 2));
} catch (error) {
  await page.screenshot({ path: `${evidence}/failure.png` }).catch(() => {});
  throw error;
} finally { await browser.close(); }
