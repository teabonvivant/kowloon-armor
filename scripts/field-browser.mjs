import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';

const evidence = '.omo/evidence/field';
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox', '--autoplay-policy=no-user-gesture-required'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 577 }, reducedMotion: 'reduce' });
await context.setOffline(true);
const page = await context.newPage(); page.setDefaultTimeout(120000);
const errors = [], requests = [], checks = [];
page.on('pageerror', error => errors.push(error.message));
page.on('request', request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
const check = (name, result = true) => { checks.push({ name, result }); console.log(name, JSON.stringify(result)); };
await page.addInitScript(() => { if (!localStorage.getItem('kowloon-armor-settings')) localStorage.setItem('kowloon-armor-settings', JSON.stringify({ quality: 'low', volume: 0, reducedMotion: true })); });
try {
  await page.goto(pathToFileURL(resolve('九龍裝甲行動.html')).href);
  await page.locator('.garage').waitFor();
  await page.locator('[data-action="settings"]').first().click();
  await page.locator('#lighting').selectOption('dusk');
  await page.locator('#adaptive-resolution').check(); await page.locator('#high-contrast').check();
  await page.locator('#tab-audio').click(); await page.locator('#night-audio').check();
  await page.reload(); await page.locator('.garage').waitFor();
  const preferences = await page.evaluate(() => JSON.parse(localStorage.getItem('kowloon-armor-settings')));
  assert.equal(preferences.lighting, 'dusk'); assert.equal(preferences.adaptiveResolution, true);
  assert.equal(preferences.nightAudio, true); assert.equal(preferences.highContrast, true);
  check('production settings survive reload', preferences);
  await page.locator('[data-mode="drive"]').click(); await page.locator('[data-action="start"]').click();
  await page.locator('#tour-toggle').click();
  await page.waitForFunction(() => document.querySelector('#tour-toggle')?.getAttribute('aria-pressed') === 'true');
  assert.match(await page.locator('#tour-destination').innerText(), /尖沙咀鐘樓/);
  await page.locator('#tour-toggle').click();
  await page.waitForFunction(() => document.querySelector('#tour-toggle')?.getAttribute('aria-pressed') === 'false');
  await page.locator('#tour-toggle').click();
  check('production tour starts, pauses and resumes');
  for (const [width, height] of [[1440, 900], [1280, 577], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    const layout = await page.evaluate(() => {
      const tour = document.querySelector('.tour-panel').getBoundingClientRect(), tank = document.querySelector('.tank-status').getBoundingClientRect();
      const solution = document.querySelector('#fire-solution').getBoundingClientRect(), reload = document.querySelector('#reload-label').getBoundingClientRect();
      return { overflow: document.documentElement.scrollWidth > innerWidth, tourBottom: tour.bottom, tankTop: tank.top, tourRight: tour.right, width: innerWidth, solutionTop: solution.top, solutionHeight: solution.height, reloadBottom: reload.bottom };
    });
    assert.equal(layout.overflow, false); assert.ok(layout.tourBottom < layout.tankTop); assert.ok(layout.tourRight <= width);
    assert.ok(layout.solutionHeight === 0 || layout.solutionTop > layout.reloadBottom, 'Fire solution must not cover the reload timer');
    await page.screenshot({ path: `${evidence}/tour-${width}.png` }); check(`production tour layout ${width}x${height}`, layout);
  }
  await page.setViewportSize({ width: 1280, height: 577 });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => document.getElementById('reload-label')?.textContent.startsWith('裝填'));
  await page.keyboard.press('Escape'); await page.locator('#modal[open]').waitFor();
  const before = await page.locator('#mission-time').innerText();
  await page.waitForTimeout(350); assert.equal(await page.locator('#mission-time').innerText(), before);
  check('production fire and pause');
  await page.locator('#modal [data-action="settings"]').click();
  await page.locator('#lighting').selectOption('day'); await page.locator('#adaptive-resolution').uncheck();
  await page.locator('#high-contrast').uncheck();
  await page.screenshot({ path: `${evidence}/settings.png` });
  await page.locator('#modal [data-action="close"]').click();
  assert.equal(await page.evaluate(() => document.body.classList.contains('high-contrast')), false);
  check('presentation options can be reversed while paused');
  const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
    import { View } from './src/view'; import { Game } from './src/game';
    import { GameAudio } from './src/audio'; import { hudMarkup, updateHud, updateEnemyMarkers } from './src/hud';
    import { createActor } from './src/actors'; import { TANKS } from './src/data/tanks';
    import { resultDialog } from './src/dialogs';
    const view = new View(document.querySelector('canvas')); view.quality('low'); view.reduceMotion(true);
    const game = new Game(view.scene, view.world, {shot(){}, hit(){}, finish(){}, notify(){}});
    window.qa = {view, game, GameAudio, hudMarkup, updateHud, updateEnemyMarkers, createActor, TANKS, resultDialog};
  ` }, bundle: true, format: 'iife', write: false });
  const css = (await Promise.all(['src/style.css', 'src/hud.css', 'src/mobile.css'].map(file => readFile(file, 'utf8')))).join('\n');
  const harness = resolve(evidence, 'harness.html');
  await writeFile(harness, `<style>${css}</style><canvas id="world"></canvas><div id="app"></div><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
  await page.goto(pathToFileURL(harness).href);
  const source = await page.evaluate(() => {
    const { game, view, hudMarkup, updateHud, createActor, TANKS } = window.qa;
    const idle = {throttle:0, steer:0, brake:true, aimX:0, aimY:0, fire:false, scope:false, toggleCamera:false, pause:false};
    game.start('drive', 0); game.toggleTour(); document.body.classList.add('in-battle'); document.querySelector('#app').innerHTML = hudMarkup(game);
    const stop = game.tour.destination; game.player.visual.root.position.set(stop.x, 0, stop.z);
    for (let step=0; step<125; step++) game.update(1/60, idle);
    updateHud(game); view.lighting('dusk'); view.render(game, .1);
    const tour = { count: game.tour.visited.size, title: document.querySelector('#tour-destination').textContent };
    game.player.visual.root.position.set(0,0,100); game.player.leftTrack = 6;
    game.update(1/60, {...idle, brake:false, throttle:1}); updateHud(game);
    const moving = document.querySelector('#damage-text').textContent;
    for (let step=0; step<60; step++) game.update(1/60,idle); updateHud(game);
    const repairing = document.querySelector('#damage-text').textContent;
    const enemy = createActor(TANKS[0],0,60,true); enemy.cooldown = .5; game.enemies.push(enemy); view.scene.add(enemy.visual.root);
    updateHud(game);
    const threat = document.querySelector('#threat-alert').textContent;
    const solution = document.querySelector('#fire-solution').textContent;
    view.adaptive(true); for(let step=0;step<180;step++) view.sampleFrame(1/30,true);
    const ratio = view.renderer.getPixelRatio(); for(let step=0;step<1000;step++) view.sampleFrame(1/60,false);
    const pausedRatio = view.renderer.getPixelRatio(); view.adaptive(false);
    return {tour, moving, repairing, threat, solution, ratio, pausedRatio, resetRatio:view.renderer.getPixelRatio()};
  });
  assert.equal(source.tour.count, 1); assert.match(source.tour.title, /油麻地/);
  assert.match(source.moving, /須停車收油/); assert.match(source.repairing, /修復中/);
  assert.match(source.threat, /1 輛/); assert.match(source.solution, /直線估算/);
  assert.ok(source.ratio < 1); assert.equal(source.pausedRatio, source.ratio); assert.equal(source.resetRatio,1);
  check('source integration: arrival, repair, threat, fire solution and GPU resolution', source);
  for (const preset of ['day','dusk']) {
    await page.evaluate(preset => { const {view,game,updateHud,updateEnemyMarkers}=window.qa; view.lighting(preset); updateHud(game); view.render(game,1); updateEnemyMarkers(game,view.camera); }, preset);
    await page.screenshot({ path:`${evidence}/battle-${preset}.png` });
  }
  const audio = await page.evaluate(async () => {
    async function render(night) {
      let time = 0, seed = 42;
      const random = Math.random; Math.random = () => {seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const offline = new OfflineAudioContext(2,22050*5,22050);
      const proxy = new Proxy(offline,{get(target,key){if(key==='state')return 'running';if(key==='currentTime')return time; const value=Reflect.get(target,key,target);return typeof value==='function'?value.bind(target):value;}});
      const original = window.AudioContext; window.AudioContext=function(){return proxy;};
      const sound=new window.qa.GameAudio(); sound.setNightMode(night); sound.unlock(); sound.setVolume(1); sound.setMusicVolume(0);
      time=.5; sound.engine(12); sound.listen({x:0,z:0},0); sound.fire({x:15,z:-20});
      time=1.5; sound.impact({x:-15,z:-20},true); sound.ready(); time=3; sound.stop();
      window.AudioContext=original; Math.random=random;
      const buffer=await offline.startRendering(), left=buffer.getChannelData(0), right=buffer.getChannelData(1);
      let peak=0,tail=0,stereo=0;
      for(let index=0;index<left.length;index++){peak=Math.max(peak,Math.abs(left[index]),Math.abs(right[index]));stereo+=Math.abs(left[index]-right[index]);if(index>4*22050)tail=Math.max(tail,Math.abs(left[index]),Math.abs(right[index]));}
      return {peak,tail,stereo};
    }
    return {normal:await render(false),night:await render(true)};
  });
  assert.ok(audio.normal.peak> .01 && audio.normal.peak<.99); assert.ok(audio.night.peak> .001 && audio.night.peak<audio.normal.peak);
  assert.ok(audio.night.tail<.0001); assert.ok(audio.night.stereo>0);
  check('rendered night audio: lower peak, stereo preserved, pause silence',audio);
  assert.deepEqual(errors,[]); assert.deepEqual(requests,[]);
  const report = { artifactSha256:createHash('sha256').update(await readFile('九龍裝甲行動.html')).digest('hex'), checks,errors,requests };
  await writeFile(`${evidence}/report.json`,JSON.stringify(report,null,2));
} finally { await browser.close(); }
