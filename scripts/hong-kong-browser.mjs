import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const evidence = '.omo/evidence/hong-kong';
await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  import { View } from './src/view';
  import { Game } from './src/game';
  import { GameAudio } from './src/audio';
  import { LANDMARKS } from './src/render/hong-kong';
  import { pilotInput } from './scripts/pilot-input';
  import { createActor } from './src/actors';
  import { TANKS } from './src/data/tanks';
  import { enemyRole } from './src/render/enemy-details';
  import { disposeTank, showTankDamage } from './src/render/tank';
  const view = new View(document.querySelector('canvas')); view.quality('medium');
  const game = new Game(view.scene, view.world, {shot(){}, hit(){}, finish(){}, notify(){}});
  window.qa = { view, game, LANDMARKS, GameAudio, pilotInput, createActor, TANKS, enemyRole, disposeTank, showTankDamage };
` }, bundle: true, format: 'iife', write: false });
const harness = resolve(evidence, 'scene.html');
await writeFile(harness, `<body style="margin:0"><canvas></canvas><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.setDefaultTimeout(120000);
const errors = [], requests = [], scenes = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
try {
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(harness).href);
  for (let index = 0; index < 6; index++) {
    const result = await page.evaluate(index => {
      const { view, game, LANDMARKS } = window.qa, landmark = LANDMARKS[index];
      const height = landmark.kind === 'icc' ? 70 : landmark.kind === 'clock' ? 23 : 22;
      view.camera.clearViewOffset(); view.camera.fov = 55; view.camera.updateProjectionMatrix();
      view.camera.position.set(landmark.x + (landmark.kind === 'icc' ? 110 : landmark.kind === 'clock' ? 42 : 0), height, landmark.z + (landmark.kind === 'icc' ? 120 : 42));
      view.camera.lookAt(landmark.x, landmark.kind === 'icc' ? 68 : landmark.kind === 'clock' ? 20 : 8, landmark.z);
      game.player.visual.root.visible = false;
      view.renderer.render(view.scene, view.camera);
      return { name: landmark.name, calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles };
    }, index);
    scenes.push(result); await page.screenshot({ path: `${evidence}/landmark-${index}.png` });
  }
  await page.evaluate(() => {
    const { view } = window.qa;
    view.camera.position.set(0, 14, 220); view.camera.lookAt(50, 3, 420); view.renderer.render(view.scene, view.camera);
  });
  await page.screenshot({ path: `${evidence}/harbour.png` });
  const roles = await page.evaluate(() => {
    const { view, createActor, TANKS, enemyRole, showTankDamage } = window.qa;
    window.qa.parade = ['突擊', '側襲', '支援'].map((role, index) => {
      const actor = createActor(TANKS.find(spec => enemyRole(spec) === role), (index - 1) * 5.5, 84, true);
      actor.visual.root.rotation.y = Math.PI;
      if (index === 2) showTankDamage(actor.visual, .2);
      view.scene.add(actor.visual.root); return actor;
    });
    view.camera.position.set(13, 7, 101); view.camera.lookAt(0, 1.7, 84); view.renderer.render(view.scene, view.camera);
    return window.qa.parade.map(actor => actor.role);
  });
  assert.deepEqual(roles, ['突擊', '側襲', '支援']);
  await page.screenshot({ path: `${evidence}/enemy-roles.png` });
  await page.evaluate(() => { for (const actor of window.qa.parade) { window.qa.view.scene.remove(actor.visual.root); window.qa.disposeTank(actor.visual); } });
  const combat = await page.evaluate(() => {
    const { view, game, pilotInput } = window.qa;
    game.start('battle', 0, 'training', 71439);
    for (let frame = 0; frame < 600; frame++) game.update(1 / 60, pilotInput(game));
    const timings = [];
    for (let frame = 0; frame < 12; frame++) {
      const start = performance.now(); game.update(1 / 60, pilotInput(game)); view.render(game, 1 / 60);
      view.renderer.getContext().finish(); timings.push(performance.now() - start);
    }
    timings.sort((left, right) => left - right);
    return { phase: game.phase, shots: game.shots, calls: view.renderer.info.render.calls, triangles: view.renderer.info.render.triangles,
      frameMs: { median: timings[6], p95: timings[11], samples: timings.length },
      roles: game.enemies.map(enemy => enemy.role), damagePool: view.scene.getObjectByName('damage-smoke-pool').geometry.attributes.position.count };
  });
  assert.ok(combat.shots > 0); assert.equal(combat.damagePool, 128);
  await page.screenshot({ path: `${evidence}/battle.png` });
  const audio = await page.evaluate(async () => {
    const offline = new OfflineAudioContext(2, 22050 * 8, 22050);
    let time = 0;
    const proxy = new Proxy(offline, { get(target, key) {
      if (key === 'state') return 'running';
      if (key === 'currentTime') return time;
      const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value;
    } });
    const original = window.AudioContext;
    window.AudioContext = function () { return proxy; };
    const sound = new window.qa.GameAudio(); sound.unlock(); sound.setVolume(1); sound.setMusicVolume(.5);
    for (let step = 0; step < 60; step++) {
      time = step / 10; sound.engine(step % 20); sound.atmosphere(step / 60, .1);
      if (step === 5 || step === 25) { sound.listen({ x: 0, z: 0 }, 0); sound.fire({ x: 18, z: -25 }); }
      if (step === 35) { sound.impact({ x: -10, z: -18 }, true); sound.ready(); }
    }
    time = 6; sound.stop(); window.AudioContext = original;
    const rendered = await offline.startRendering(), left = rendered.getChannelData(0), right = rendered.getChannelData(1);
    let peak = 0, energy = 0, tail = 0, stereo = 0;
    for (let index = 0; index < left.length; index++) {
      peak = Math.max(peak, Math.abs(left[index]), Math.abs(right[index])); energy += left[index] ** 2 + right[index] ** 2;
      stereo += Math.abs(left[index] - right[index]);
      if (index > 7 * 22050) tail = Math.max(tail, Math.abs(left[index]), Math.abs(right[index]));
    }
    const pcm = new Int16Array(left.length * 2);
    for (let index = 0; index < left.length; index++) { pcm[index * 2] = left[index] * 32767; pcm[index * 2 + 1] = right[index] * 32767; }
    const bytes = new Uint8Array(pcm.buffer); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return { peak, rms: Math.sqrt(energy / (left.length * 2)), silentTailPeak: tail, stereoDifference: stereo / left.length, pcm: btoa(binary) };
  });
  assert.ok(audio.peak > .01 && audio.peak < .99); assert.ok(audio.rms > .001);
  assert.ok(audio.silentTailPeak < .0001, 'Paused soundscape must become silent'); assert.ok(audio.stereoDifference > .00001);
  const pcm = Buffer.from(audio.pcm, 'base64'); delete audio.pcm;
  const header = Buffer.alloc(44); header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(22050, 24);
  header.writeUInt32LE(88200, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  await writeFile(`${evidence}/soundscape.wav`, Buffer.concat([header, pcm]));
  await page.goto(pathToFileURL(resolve('九龍裝甲行動.html')).href, { waitUntil: 'domcontentloaded' });
  await page.locator('.garage').waitFor();
  await page.locator('[data-action="settings"]').first().click({ force: true });
  await page.locator('#tab-audio').click();
  await page.locator('#music-volume').fill('0');
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('kowloon-armor-settings')).musicVolume), 0);
  await page.locator('#test-audio').click();
  await page.screenshot({ path: `${evidence}/audio-settings.png` });
  await page.locator('#modal [data-action="close"]').click();
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 577 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `${evidence}/garage-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.locator('[data-mode="drive"]').click({ force: true });
  await page.locator('[data-action="start"]').click({ force: true });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('reload-label')?.textContent.startsWith('裝填'));
  await page.keyboard.press('Escape');
  assert.ok(await page.locator('#modal').isVisible());
  assert.deepEqual(errors, []); assert.deepEqual(requests, []);
  const report = { artifactSha256: createHash('sha256').update(await readFile('九龍裝甲行動.html')).digest('hex'), scenes, combat, audio, errors, requests,
    checks: ['six source-rendered landmarks', 'combat shots and bounded smoke', 'offline rendered stereo audio / peak / pause silence', 'production music preference', 'three production viewports', 'production fire and pause'] };
  await writeFile(`${evidence}/report.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
