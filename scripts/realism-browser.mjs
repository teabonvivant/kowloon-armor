import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const folder = process.env.REALISM_EVIDENCE || 'docs/evidence/realism'; await mkdir(folder,{ recursive: true });
const viewportOption = process.argv.find(argument => argument.startsWith('--viewport='));
const selectedWidth = viewportOption ? Number(viewportOption.split('=')[1]) : undefined;
const encounterOnly = process.argv.includes('--encounter');
assert.ok(selectedWidth === undefined || [1440,1280,390,844,820].includes(selectedWidth),'Unknown viewport');
assert.ok(!(encounterOnly && viewportOption),'Select a viewport or the encounter, not both');
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
const artifact = pathToFileURL(resolve('九龍裝甲行動-寫實樣板.html')).href;
const startingArtifact = await readFile('九龍裝甲行動-寫實樣板.html');
const errors = [], requests = [], checks = [], layouts = [];
const mainProgress = JSON.stringify({ completed: 4,victories: 19,bestScores: { 'campaign:4:standard': 4200 } });
async function advance(page,frames = 1) {
  await page.evaluate(frames => {
    if (!window.__clockStarted) { window.__time = performance.now(); window.__clockStarted = true; }
    for (let frame = 0; frame < frames; frame++) { window.__draw = frame === frames - 1; window.__time += 100; const callbacks = window.__callbacks.splice(0); callbacks.forEach(callback => callback(window.__time)); }
    window.__draw = true;
    document.querySelector('#world').getContext('webgl2').finish();
  },frames);
}
async function closeModal(page) {
  await page.evaluate(() => {
    const modal = document.querySelector('#modal');
    if (!(modal instanceof HTMLDialogElement) || !modal.open) throw new Error('Expected an open dialog before closing');
    window.__modalClosed = false;
    modal.addEventListener('close',() => { window.__modalClosed = true; },{ once: true });
  });
  await page.locator('#modal [data-action="close"]').first().click();
  await page.waitForFunction(() => window.__modalClosed === true,undefined,{ polling: 20 });
}
async function open(width,height,touch = false) {
  const context = await browser.newContext({ viewport: { width,height },deviceScaleFactor: 1,hasTouch: touch,isMobile: touch });
  await context.setOffline(true);
  await context.addInitScript(({ mainProgress,touch }) => {
    localStorage.setItem('kowloon-armor-progress',mainProgress); localStorage.setItem('kowloon-armor-progress-recovery',mainProgress);
    localStorage.setItem('kowloon-armor-realism-settings',JSON.stringify({ quality: 'medium',reducedMotion: true,musicVolume: 0,controlMode: touch ? 'touch' : 'desktop' }));
    window.__callbacks = []; window.__time = performance.now();
    window.__draw = true;
    for (const method of ['drawArrays','drawElements','drawArraysInstanced','drawElementsInstanced']) {
      const original = WebGL2RenderingContext.prototype[method];
      WebGL2RenderingContext.prototype[method] = function(...args) { if (window.__draw) return original.apply(this,args); };
    }
    window.requestAnimationFrame = callback => { window.__callbacks.push(callback); return window.__callbacks.length; };
  },{ mainProgress,touch });
  const page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror',error => errors.push(error.message));
  page.on('request',request => { if (/^https?:/.test(request.url())) requests.push(request.url()); });
  await page.goto(artifact); await advance(page,12);
  return { context,page };
}
const check = (name,detail) => { checks.push({ name,detail }); console.log(name,JSON.stringify(detail ?? {})); };
try {
  for (const [width,height,touch] of [[1440,900,false],[1280,577,false],[390,844,true],[844,390,true],[820,1180,true]]) {
    if (encounterOnly || selectedWidth !== undefined && width !== selectedWidth) continue;
    const { context,page } = await open(width,height,touch);
    assert.equal(await page.evaluate(() => typeof window.qa),'undefined','Distributed HTML must not expose a test interface');
    const layout = await page.evaluate(() => ({ width: innerWidth,documentWidth: document.documentElement.scrollWidth,start: (() => { const bounds = document.querySelector('[data-action="start"]').getBoundingClientRect(); return { width: bounds.width,height: bounds.height }; })() }));
    assert.ok(layout.documentWidth <= width + 1); assert.ok(layout.start.width >= 120 && layout.start.height >= 44);
    await page.screenshot({ path: `${folder}/artifact-garage-${width}x${height}.png`,animations: 'disabled' });
    await page.locator('[data-action="settings"]').first().click();
    assert.equal(await page.locator('#modal').isVisible(),true);
    await closeModal(page);
    await page.locator('[data-mode="drive"]').click(); await advance(page,1);
    await page.locator('[data-action="start"]').click(); await advance(page,2);
    assert.equal(await page.locator('.battle-hud').count(),1);
    if (width === 1440) {
      await page.locator('[data-action="tactical"]').first().click();
      assert.match(await page.locator('#modal').textContent(),/街口樣板/);
      assert.equal(await page.locator('#modal [data-waypoint]').count(),0);
      await page.screenshot({ path: `${folder}/artifact-map.png`,animations: 'disabled' });
      await closeModal(page); await advance(page,1);
    }
    if (!touch) {
      await page.locator('#world').focus(); await page.keyboard.down('KeyW'); await advance(page,13); await page.keyboard.up('KeyW');
      const drivingState = await page.evaluate(() => ({ speed: Number(document.querySelector('#speed').textContent),
        modalOpen: document.querySelector('#modal').open, active: document.activeElement?.id, focused: document.hasFocus(),
        visibility: document.visibilityState, callbacks: window.__callbacks.length, closeObserved: window.__modalClosed }));
      assert.ok(drivingState.speed > 0,JSON.stringify(drivingState));
      await page.keyboard.down('KeyB'); await advance(page,6); await page.keyboard.up('KeyB');
      assert.equal(await page.locator('#speed').textContent(),'0');
      await page.keyboard.down('KeyQ'); await advance(page,5); await page.keyboard.up('KeyQ');
      assert.notEqual(await page.locator('#turret-bearing').textContent(),'炮塔 0°');
      await page.keyboard.down('Space'); await advance(page,2); await page.keyboard.up('Space');
      assert.doesNotMatch(await page.locator('#reload-label').textContent(),/就緒/);
      await advance(page,57); assert.match(await page.locator('#reload-label').textContent(),/就緒/);
      await page.keyboard.press('Escape'); await advance(page,1); assert.equal(await page.locator('#modal').getAttribute('data-page'),'pause');
      await closeModal(page); await advance(page,1);
    } else {
      const cdp = await context.newCDPSession(page);
      const stick = await page.locator('#touch-stick').boundingBox(), fire = await page.locator('#touch-fire').boundingBox();
      assert.ok(stick && fire);
      const driving = { id: 1,x: stick.x + stick.width / 2,y: stick.y + stick.height / 2 };
      const aiming = { id: 2,x: width / 2,y: height * .4 };
      const firing = { id: 3,x: fire.x + fire.width / 2,y: fire.y + fire.height / 2 };
      await cdp.send('Input.dispatchTouchEvent',{ type: 'touchStart',touchPoints: [driving] });
      driving.y -= stick.height * .35;
      await cdp.send('Input.dispatchTouchEvent',{ type: 'touchMove',touchPoints: [driving] });
      await cdp.send('Input.dispatchTouchEvent',{ type: 'touchStart',touchPoints: [driving,aiming] });
      aiming.x += 35;
      await cdp.send('Input.dispatchTouchEvent',{ type: 'touchMove',touchPoints: [driving,aiming] });
      await cdp.send('Input.dispatchTouchEvent',{ type: 'touchStart',touchPoints: [driving,aiming,firing] });
      await advance(page,8);
      assert.ok(Number(await page.locator('#speed').textContent()) > 0);
      assert.doesNotMatch(await page.locator('#reload-label').textContent(),/就緒/);
      await cdp.send('Input.dispatchTouchEvent',{ type: 'touchCancel',touchPoints: [] });
      await page.waitForFunction(() => document.querySelectorAll('#touch-controls .pressed').length === 0,undefined,{ polling: 50 });
      await advance(page,8); assert.equal(await page.locator('#speed').textContent(),'0');
      await page.locator('[data-action="pause"]').first().click();
      assert.equal(await page.locator('#modal').isVisible(),true);
      await closeModal(page); await advance(page,1);
      await page.locator('#touch-fire').waitFor({ state: 'visible' });
      const centre = await page.evaluate(() => {
        const target = document.elementFromPoint(innerWidth / 2,innerHeight / 2);
        return { tag: target?.tagName,id: target?.id,scroll: scrollY,fire: document.querySelector('#touch-fire').getBoundingClientRect().toJSON() };
      });
      assert.ok(!['BUTTON','SELECT'].includes(centre.tag)); assert.ok(centre.fire.width >= 44 && centre.fire.height >= 44 && centre.fire.bottom <= height + 1); layout.centre = centre;
    }
    await page.screenshot({ path: `${folder}/artifact-play-${width}x${height}.png`,animations: 'disabled' });
    assert.equal(await page.evaluate(() => localStorage.getItem('kowloon-armor-progress')),mainProgress);
    assert.equal(await page.evaluate(() => localStorage.getItem('kowloon-armor-progress-recovery')),mainProgress);
    layouts.push({ width,height,touch,...layout }); check(`offline artifact ${width}x${height}`,layout); await context.close();
  }
  if (selectedWidth === undefined) {
  const context = await browser.newContext({ viewport: { width: 1280,height: 720 },deviceScaleFactor: 1 });
  await context.setOffline(true); const page = await context.newPage(); page.setDefaultTimeout(120000);
  page.on('pageerror',error => errors.push(error.message));
  await page.goto(pathToFileURL(resolve(folder,'sample-harness.html')).href);
  const encounter = await page.evaluate(() => {
    const { game,ui,intercept,view,updateHud,updateEnemyMarkers } = window.qa;
    ui.start(); let steps = 0;
    while (game.phase === 'playing' && steps++ < 100 * 60) {
      const target = game.enemies.find(enemy => enemy.alive), solution = intercept(game.player,target);
      const difference = Math.atan2(Math.sin(solution.aim - game.player.aim),Math.cos(solution.aim - game.player.aim));
      game.update(1 / 60,{ throttle: game.elapsed < 2 ? .5 : 0,steer: 0,brake: game.elapsed >= 2,aimX: 0,aimY: 0,pointerX: -difference,pointerY: solution.pitch - game.player.pitch,fire: game.elapsed > 3.5,scope: false,toggleCamera: false,pause: false });
    }
    updateHud(game); view.render(game,1 / 60); updateEnemyMarkers(game,view.camera); view.renderer.getContext().finish();
    return { phase: game.phase,kills: game.kills,shots: game.shots,hits: game.hits,hp: game.player.hp,seconds: game.elapsed,metres: game.report.distance,obstacles: game.world.obstacles.length };
  });
  assert.equal(encounter.phase,'victory'); assert.equal(encounter.kills,2); assert.ok(encounter.metres > 5); check('full street encounter through input frames',encounter);
  await page.screenshot({ path: `${folder}/sample-victory.png`,animations: 'disabled' });
  const resources = await page.evaluate(() => {
    const { game,view } = window.qa; const samples = [];
    for (let cycle = 0; cycle < 6; cycle++) { game.garage(); view.render(game,.1); view.renderer.getContext().finish(); samples.push({ ...view.renderer.info.memory,effects: game.effectStats() }); game.start('battle',0); }
    return samples;
  });
  assert.equal(resources[1].geometries,resources[5].geometries); assert.equal(resources[1].textures,resources[5].textures); assert.equal(resources[5].effects.projectiles,0); check('restart GPU resource counts remain bounded',resources);
  const hotas = await page.evaluate(() => {
    const { game,input } = window.qa;
    const pad = { id: 'QA simulated HOTAS',index: 0,connected: true,axes: [0,0,0,0],buttons: Array.from({ length: 10 },() => ({ value: 0,pressed: false,touched: false })),mapping: '',timestamp: 1 };
    Object.defineProperty(navigator,'getGamepads',{ configurable: true,value: () => [pad] });
    game.start('drive',0); input.reset(); input.sample(1 / 60); input.calibrate(); input.sample(1 / 60);
    pad.axes[1] = -1; pad.buttons[0].pressed = true; pad.buttons[0].value = 1;
    for (let tick = 0; tick < 90; tick++) game.update(1 / 60,input.sample(1 / 60));
    return { speed: game.player.speed,shots: game.shots,devices: input.devices.length };
  });
  assert.ok(hotas.speed > 0 && hotas.shots === 1 && hotas.devices === 1); check('simulated HOTAS calibration, throttle and trigger',hotas);
  await context.close();
  }
  assert.deepEqual(errors,[]); assert.deepEqual(requests,[]);
  const artifactBuffer = await readFile('九龍裝甲行動-寫實樣板.html');
  assert.ok(startingArtifact.equals(artifactBuffer),'Artifact changed during browser verification; rerun against a frozen build');
  const suffix = selectedWidth !== undefined ? `-${selectedWidth}` : encounterOnly ? '-encounter' : '';
  await writeFile(`${folder}/browser${suffix}.json`,JSON.stringify({ browser: browser.version(),artifactBytes: artifactBuffer.length,artifactSha256: createHash('sha256').update(artifactBuffer).digest('hex'),checks,layouts,errors,requests,method: 'Standalone file:// artifact uses real DOM keyboard and CDP touch inputs with manually clocked rAF at 100 ms, drawing the final frame of each accelerated input batch. Every screenshot renders the full WebGL scene. This functional test is not the separately frame-rendered normal-speed recording. The separate source harness completes the encounter with input-only aiming, tests repeated restarts and synthetic Gamepad API. This is not physical HOTAS, Safari or real-device performance evidence.' },null,2));
} finally { await browser.close(); }
