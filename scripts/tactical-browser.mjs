import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const evidence = '.omo/evidence';
await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  import { Game } from './src/game.ts';
  import { GameAudio } from './src/audio.ts';
  import { Input } from './src/input.ts';
  import { Interface } from './src/interface.ts';
  import { updateHud, updateEnemyMarkers } from './src/hud.ts';
  import { View } from './src/view.ts';
  import { pilotInput } from './scripts/pilot-input.ts';
  let randomState = 71439;
  Math.random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  if (!localStorage.getItem('kowloon-armor-progress')) localStorage.setItem('kowloon-armor-progress', JSON.stringify({ completed: 5, victories: 5, bestScores: { '1': 1234 } }));
  if (!localStorage.getItem('kowloon-armor-settings')) localStorage.setItem('kowloon-armor-settings', JSON.stringify({ quality: 'low', volume: 0, difficulty: 'training', reducedMotion: true }));
  const canvas = document.querySelector('#world');
  const view = new View(canvas), audio = new GameAudio(), input = new Input(canvas);
  let stressing = false;
  const game = new Game(view.scene, view.world, { shot: () => view.recoil(), cannon: position => { if (!stressing) audio.fire(position); },
    ready: () => { if (!stressing) audio.ready(); }, hit: (damage, killed, enemy, impact) => { if (!stressing) ui.hit(damage, killed, enemy, impact); },
    finish: victory => { if (!stressing) ui.finish(victory); }, notify: message => { if (!stressing) ui.notify(message); } });
  const ui = new Interface(game, input, view, audio);
  const neutral = { throttle: 0, steer: 0, aimX: 0, aimY: 0, fire: false, brake: true, scope: false, toggleCamera: false, pause: false };
  function render() { audio.listen(game.player.visual.root.position, game.player.aim); view.render(game, 1); updateHud(game); updateEnemyMarkers(game, view.camera); }
  function state() { return { phase: game.phase, mode: game.mode, mission: game.mission?.id, hp: game.player.hp, maxHp: game.player.maxHp,
    elapsed: game.elapsed, kills: game.kills, shots: game.shots, hits: game.hits, alive: game.enemies.filter(enemy => enemy.alive).length,
    wave: game.wave, intermission: game.intermission, supply: game.supply, rapidShots: game.player.rapidShots, cooldown: game.player.cooldown,
    speed: game.player.speed, aim: game.player.aim, yaw: game.player.yaw, camera: game.cameraMode, scope: game.scope, fov: view.camera.fov,
    objective: { ...game.objective }, position: game.player.visual.root.position.toArray(), seed: game.seed }; }
  function memory() { return { ...view.renderer.info.memory, calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles,
    points: view.renderer.info.render.points, smoke: game.effectStats().smoke,
    dust: view.scene.getObjectByName('track-dust')?.geometry.attributes.position.count, heap: performance.memory?.usedJSHeapSize ?? null }; }
  window.qa = {
    state, memory, render,
    sample: () => input.sample(1 / 60),
    advance(seconds, source = 'pilot', stopAtSupply = false) {
      for (let frame = 0; frame < Math.round(seconds * 60) && game.phase === 'playing'; frame++) {
        const control = source === 'keyboard' ? input.sample(1 / 60) : source === 'neutral' ? neutral : pilotInput(game);
        if (control.pause) ui.pause(); game.update(1 / 60, control);
        if (stopAtSupply && game.intermission > 0) break;
      }
      render(); return state();
    },
    stress(seconds) {
      stressing = true; const samples = [], start = performance.now(); let rounds = 0, hits = 0, shots = 0;
      game.start('battle', 0, 'training', 71439);
      for (let frame = 0; frame < seconds * 60; frame++) {
        if (game.phase !== 'playing') { hits += game.hits; shots += game.shots; rounds++; game.start('battle', 0, 'training', 71439 + rounds * 997); }
        game.update(1 / 60, pilotInput(game));
        if ((frame + 1) % (300 * 60) === 0) { render(); samples.push({ simulationSeconds: (frame + 1) / 60, ...state(), ...memory() }); }
      }
      hits += game.hits; shots += game.shots; game.garage(); render(); stressing = false;
      return { simulationSeconds: seconds, fixedSteps: seconds * 60, rounds, shots, hits, wallMs: performance.now() - start, samples, afterGarage: memory() };
    },
    recycle(rounds) {
      stressing = true;
      for (let index = 0; index < rounds; index++) { game.start('battle', 0, 'training', 71439 + index); game.update(1 / 60, neutral); render(); game.garage(); render(); }
      stressing = false; return memory();
    }
  };
  document.getElementById('boot').remove(); render();
` }, bundle: true, format: 'iife', write: false });
const css = (await Promise.all(['src/style.css', 'src/hud.css', 'src/mobile.css'].map(file => readFile(file, 'utf8')))).join('\n');
const template = await readFile('index.html', 'utf8');
const html = template.replace('<link rel="stylesheet" href="/src/style.css">', '')
  .replace('<link rel="stylesheet" href="/src/hud.css">', '').replace('</head>', `<style>${css}</style></head>`)
  .replace('<script type="module" src="/src/main.ts"></script>', () => `<script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
await writeFile(`${evidence}/tactical-harness.html`, html);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--enable-precise-memory-info'] });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' });
await context.setOffline(true);
const errors = [], requests = [], checks = [];
context.on('page', page => { page.setDefaultTimeout(120000); page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url())); });
const page = await context.newPage();
const url = pathToFileURL(resolve(`${evidence}/tactical-harness.html`)).href;
const click = selector => page.locator(selector).first().click({ force: true });
const state = () => page.evaluate(() => window.qa.state());
const advance = (seconds, source = 'pilot', stopAtSupply = false) => page.evaluate(args => window.qa.advance(...args), [seconds, source, stopAtSupply]);
const check = (name, details) => { checks.push({ name, details }); console.log(name, JSON.stringify(details)); };
async function shot(name) { await page.evaluate(() => window.qa.render()); await page.screenshot({ path: `${evidence}/tactical-${name}.png` }); }
async function garage() {
  if ((await state()).phase === 'playing') { await page.keyboard.press('Escape'); await advance(1 / 60, 'keyboard'); }
  if (await page.locator('#modal [data-action="return"]').count()) await click('#modal [data-action="return"]');
  else await click('#modal [data-action="close"]');
  if (await page.locator('#modal [data-action="confirm-return"]').count()) await click('#modal [data-action="confirm-return"]');
}
async function mission(index) {
  await click('[data-action="missions"]'); await click(`[data-mission="${index}"]`); await click('[data-action="start"]');
  await page.evaluate(() => window.qa.render());
}
try {
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await click('[data-action="settings"]');
  await page.evaluate(() => {
    document.querySelector('#modal [data-action="close"]').click();
    document.querySelector('#app [data-action="controller"]').click();
  });
  await page.waitForTimeout(100);
  assert.ok(await page.locator('#modal label').count() > 0, 'Queued close events must not tear down reopened HOTAS settings');
  await page.getByRole('button', { name: '關閉控制設定', exact: true }).click({ force: true });
  await page.waitForTimeout(100);
  check('rapid dialog reopen retains HOTAS settings', true);
  await mission(1);
  const initialCapture = await state(); assert.equal(initialCapture.objective.progress, 0);
  await shot('capture-1440');
  await page.setViewportSize({ width: 390, height: 844 }); await shot('capture-390');
  await page.keyboard.press('Escape'); await advance(1 / 60, 'keyboard'); await click('#modal [data-action="settings"]');
  assert.equal(await page.locator('#modal').evaluate(modal => modal.scrollWidth <= modal.clientWidth), true);
  await shot('settings-390');
  await click('#tab-controls');
  await page.locator('#scope-mode').selectOption('toggle'); await page.locator('#scope-zoom').selectOption('4');
  await click('#modal [data-action="close"]');
  await page.waitForFunction(() => window.qa.state().phase === 'playing');
  await page.keyboard.press('Shift'); await advance(.1, 'keyboard');
  const scoped = await state(); assert.equal(scoped.scope, true); assert.equal(scoped.fov, 12.5);
  await page.keyboard.press('Shift'); await advance(.1, 'keyboard'); assert.equal((await state()).scope, false);
  await page.setViewportSize({ width: 1440, height: 900 });
  const captured = await advance(225); assert.equal(captured.phase, 'victory'); assert.equal(captured.objective.progress, 20);
  assert.equal(await page.locator('#modal-title').textContent(), '任務完成');
  check('capture through movement/fire inputs; scope toggle and 4x optics', { initialCapture, captured, scoped });
  await garage(); await mission(3);
  const defended = await advance(60); assert.equal(defended.phase, 'victory'); assert.equal(defended.objective.progress, 45);
  assert.ok(defended.alive > 0, 'Defence must complete without requiring every enemy to die');
  await shot('defence-victory'); check('defence wins while opponents survive', defended);
  await garage(); await mission(3);
  const lost = await advance(300, 'neutral'); assert.equal(lost.phase, 'defeat');
  assert.ok(lost.hp === 0 || lost.objective.integrity === 0 || lost.elapsed >= 270);
  await click('#modal [data-action="retry"]');
  const retry = await state(); assert.equal(retry.objective.progress, 0); assert.equal(retry.objective.integrity, 100); assert.equal(retry.rapidShots, 0);
  check('defence retry resets objective; actual incoming opposition can defeat it', { retry, lost });
  await garage();
  await click('[data-mode="survival"]'); await click('[data-action="start"]');
  const between = await advance(300, 'pilot', true); assert.equal(between.phase, 'playing'); assert.ok(between.intermission > 0);
  await shot('supply-1440'); await page.setViewportSize({ width: 390, height: 844 }); await shot('supply-390');
  await click('[data-supply="reload"]'); await advance(.05, 'neutral');
  assert.equal(await page.locator('[data-supply="reload"]').getAttribute('aria-pressed'), 'true');
  const nextWave = await advance(8, 'neutral'); assert.equal(nextWave.wave, 2); assert.equal(nextWave.rapidShots, 4); assert.equal(nextWave.hp, between.hp);
  await page.keyboard.down('Space'); const quick = await advance(1 / 60, 'keyboard'); await page.keyboard.up('Space');
  assert.equal(quick.rapidShots, 3); assert.ok(Math.abs(quick.cooldown - 5.5 * .68) < .02);
  check('real survival victory unlocks choice; selected four-round supply affects next reload', { between, nextWave, quick });
  await page.setViewportSize({ width: 1440, height: 900 }); await garage();
  await page.evaluate(() => {
    window.fakePads = [0, 1].map(index => ({ id: index ? 'QA separate throttle' : 'QA flight stick', index, connected: true, axes: [0, index ? 1 : 0, 0, 0],
      buttons: Array.from({ length: 8 }, () => ({ pressed: false, touched: false, value: 0 })), mapping: '', timestamp: performance.now() }));
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => window.fakePads });
  });
  await click('[data-action="controller"]');
  await page.getByLabel(/^主要搖桿/).selectOption('0'); await page.getByLabel(/^油門裝置/).selectOption('1');
  await page.getByLabel(/^油門形式/).selectOption('slider');
  await page.getByRole('button', { name: '校準中立位置', exact: true }).click({ force: true });
  await shot('hotas-simulated'); await page.getByRole('button', { name: '關閉控制設定', exact: true }).click({ force: true });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await click('[data-mode="drive"]'); await click('[data-action="start"]');
  const idle = await advance(1, 'keyboard'); assert.equal(idle.speed, 0);
  await page.evaluate(() => { window.fakePads[1].axes[1] = -1; }); const forward = await advance(2, 'keyboard'); assert.ok(forward.speed > 8);
  await page.evaluate(() => { window.fakePads[0].buttons[4] = { pressed: true, value: 1 }; });
  const reverse = await advance(4, 'keyboard'); assert.ok(reverse.speed < -4);
  await page.evaluate(() => { window.fakePads[0].axes[2] = .8; window.fakePads[0].buttons[2] = { pressed: true, value: 1 }; });
  const turned = await advance(1, 'keyboard'); assert.ok(Math.abs(turned.aim) > .5); assert.equal(turned.camera, 'driver');
  const held = await advance(.5, 'keyboard'); assert.equal(held.camera, 'driver');
  await page.evaluate(() => { window.fakePads[0].buttons[7] = { pressed: true, value: 1 }; }); await advance(.1, 'keyboard');
  assert.equal((await state()).phase, 'paused');
  const hotasSaved = await page.evaluate(() => JSON.parse(localStorage.getItem('kowloon-armour.controllers.v1')));
  assert.equal(hotasSaved.throttleControllerIndex, 1); assert.equal(hotasSaved.throttleMode, 'slider');
  await page.evaluate(() => { for (const pad of window.fakePads) for (const button of pad.buttons) { button.pressed = false; button.value = 0; } window.fakePads[1].axes[1] = 1; });
  await click('#modal [data-action="close"]');
  await page.waitForFunction(() => window.qa.state().phase === 'playing');
  await page.evaluate(() => { window.fakePads = []; window.dispatchEvent(new Event('gamepaddisconnected')); });
  assert.equal((await state()).phase, 'paused');
  check('simulated separate HOTAS: calibration, forward/reverse, aim, edge camera, pause/disconnect, persistence', { idle, forward, reverse, turned, held, hotasSaved });
  await garage();
  const second = await context.newPage(); await second.goto(url, { waitUntil: 'domcontentloaded' });
  await page.bringToFront(); await click('[data-mode="drive"]'); await click('[data-action="start"]');
  assert.equal((await second.evaluate(() => window.qa.state())).phase, 'garage');
  await second.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event('blur')));
  assert.equal((await state()).phase, 'paused');
  assert.equal((await second.evaluate(() => window.qa.state())).phase, 'garage');
  await second.close(); await page.bringToFront(); await page.evaluate(() => window.dispatchEvent(new Event('focus')));
  check('two windows keep independent sessions and background play pauses', true);
  await garage(); await mission(5); await advance(4.1);
  console.log('measuring reproducible combat scene');
  const combat = await state(), combatMemory = await page.evaluate(() => window.qa.memory());
  assert.ok(combat.alive >= 6); assert.ok(combatMemory.smoke > 0, 'Measured combat scene must contain cannon smoke/explosions');
  const gpu = await page.evaluate(() => { const gl = document.querySelector('#world').getContext('webgl2'); const ext = gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); });
  const renderTimes = [];
  for (let frame = 0; frame < 6; frame++) renderTimes.push(await page.evaluate(async () => { const start = performance.now(); window.qa.render(); await new Promise(requestAnimationFrame); return performance.now() - start; }));
  await shot('combat-measured');
  await garage();
  const cdp = await context.newCDPSession(page); await cdp.send('HeapProfiler.collectGarbage');
  const memoryBefore = await page.evaluate(() => window.qa.memory());
  console.log('running 72000 fixed combat steps with sparse rendering');
  const stress = await page.evaluate(() => window.qa.stress(1200));
  await cdp.send('HeapProfiler.collectGarbage'); const memoryAfterStress = await page.evaluate(() => window.qa.memory());
  await page.evaluate(() => window.qa.recycle(10)); await cdp.send('HeapProfiler.collectGarbage');
  const memoryAfterRecycle = await page.evaluate(() => window.qa.memory());
  assert.equal(memoryAfterStress.geometries, memoryAfterRecycle.geometries); assert.equal(memoryAfterStress.textures, memoryAfterRecycle.textures);
  assert.ok(stress.shots > 50 && stress.hits > 20 && stress.rounds > 1);
  assert.equal(memoryAfterRecycle.dust, 96); assert.equal(memoryAfterRecycle.smoke, 0);
  assert.deepEqual(errors, []); assert.equal(requests.some(request => /^https?:/.test(request)), false);
  check('20 minutes fixed-step combat and repeated restarts retain bounded GPU resources', { memoryBefore, memoryAfterStress, memoryAfterRecycle, rounds: stress.rounds, shots: stress.shots, hits: stress.hits });
  const report = { timestamp: new Date().toISOString(), browser: browser.version(), gpu, viewport: [1440, 900], checks,
    combat: { state: combat, render: combatMemory, renderTimesMs: renderTimes,
      timingMethod: 'CPU submission plus one requestAnimationFrame wait for repeated renders of one combat state; no GPU completion wait and not continuous combat FPS.' }, stress, memoryBefore, memoryAfterStress, memoryAfterRecycle, errors,
    networkRequests: requests.filter(request => /^https?:/.test(request)),
    method: 'Isolated fixture built from real Game, Input, Interface and View. Offline browser UI clicks plus fixed 60 Hz input-only pilot. Old completed=5 save supplied only to access all mission selectors. No HP, cooldown, position or outcome overrides. 20 simulated minutes are accelerated with sparse rendering, not 20 real-time minutes or a hardware FPS claim. HOTAS devices are synthetic, not physical.' };
  await writeFile(`${evidence}/tactical-browser.json`, JSON.stringify(report, null, 2));
  console.log('tactical browser checks complete');
} catch (error) {
  await writeFile(`${evidence}/tactical-browser-failure.json`, JSON.stringify({ message: String(error), checks, errors,
    state: await state().catch(() => null), modal: await page.locator('#modal').innerHTML().catch(() => null) }, null, 2));
  throw error;
} finally { await browser.close(); }
