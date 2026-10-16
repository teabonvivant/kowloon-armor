import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
import { Box3, PerspectiveCamera, Vector3 } from 'three';

const folder = 'docs/evidence/finish-pass';
const detailsIndex = process.argv.indexOf('--details');
const detailsOnly = detailsIndex >= 0;
const detailMode = detailsOnly ? process.argv[detailsIndex + 1] ?? 'all' : 'all';
assert.ok(['all','camera','muzzle'].includes(detailMode),'--details accepts camera, muzzle or all');
const outputName = detailsOnly ? `visual-details${detailMode === 'all' ? '' : `-${detailMode}`}.json` : 'visual.json';
const viewports = [[1440,900],[844,390],[390,844]];
const neutral = { throttle: 0,steer: 0,aimX: 0,aimY: 0,fire: false,brake: true,scope: false,toggleCamera: false,pause: false };
const files = ['before-harness.html','sample-harness.html'].map(name => resolve(folder,name));
files.push(resolve('九龍裝甲行動-寫實樣板.html'));
const frozen = new Map();
const report = {
  timestamp: new Date().toISOString(),passed: false,files: [],screenshots: [],benchmarks: [],cameraProbes: [],muzzle: [],errors: [],requests: [],
  scope: detailsOnly ? `Targeted ${detailMode} checks only` : 'Full comparison and detail checks',
  timingStatus: detailsOnly ? 'Incomplete: prior full run exited 143 during current-sample timing. Existing chase screenshots and visual.log are retained; no completed before/after timing comparison.' : 'Pending',
  method: {
    comparison: 'Offline before/current source harnesses, identical day lighting, medium quality, DPR 1, 15 m chase distance, 50 degree FOV, fixed seed and neutral controls. Clean screenshots hide UI. Default chase height intentionally follows each version. These are source-harness images, not standalone-artifact input verification.',
    timing: 'Sequential same-host 1280x800 complete Three.js scene renders with gl.finish and blocking readPixels; two warmups and five measured samples. Both versions use the exact first before-camera world transform. No intercepted/skipped draw calls. Static render plus synchronization only; excludes simulation, UI, input latency and display refresh. Other browser workloads were observed on this shared host, so timing cannot attribute a difference to this version. Small software-rendering samples are not FPS or hardware-performance claims.',
    camera: 'Ten complete 640x400 source renders exercise the actual View camera at two distance extremes, four bearings and two near-wall cases. Captured camera transforms and actual mesh bounds are then projected mathematically at each target viewport without extra rendering. Conservative mesh boxes and turret pivot checks do not prove all geometry is unobscured.',
    muzzle: 'One shot issued through Game.update with a fire input at simulation time zero, then neutral input steps no larger than 1/240 s to 0.02, 0.08, 0.2 and 0.45 s. Each selected event time is fully rendered from the same front-side observation camera. No HP, damage, cooldown or effect-pool mutations; not real-time footage.',
  },
};
let browser;
await mkdir(folder,{ recursive: true });

async function checkpoint(phase) {
  report.phase = phase; report.updatedAt = new Date().toISOString();
  await writeFile(`${folder}/${outputName}`,JSON.stringify(report,null,2));
}

async function open(label) {
  const context = await browser.newContext({ viewport: { width: 1440,height: 900 },deviceScaleFactor: 1,reducedMotion: 'no-preference' });
  await context.setOffline(true);
  await context.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('kowloon-armor-realism-settings',JSON.stringify({ quality: 'medium',lighting: 'day',reducedMotion: true,volume: 0,musicVolume: 0,controlMode: 'desktop',chaseDistance: 15,chaseFov: 50 }));
  });
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror',error => report.errors.push({ label,type: 'pageerror',message: error.message }));
  page.on('console',message => { if (message.type() === 'error') report.errors.push({ label,type: 'console',message: message.text() }); });
  page.on('request',request => { if (/^https?:/.test(request.url())) report.requests.push({ label,url: request.url() }); });
  await page.goto(pathToFileURL(resolve(folder,`${label}-harness.html`)).href);
  assert.equal(await page.evaluate(() => typeof window.qa?.view?.render),'function','Source harness must expose its isolated QA interface');
  await page.evaluate(() => {
    const { view,audio } = window.qa;
    for (const selector of ['#app','#notice','#touch-controls']) {
      const element = document.querySelector(selector);
      if (element) element.style.visibility = 'hidden';
    }
    audio.setVolume(0); audio.setMusicVolume(0);
    view.quality('medium'); view.lighting('day'); view.reduceMotion(true); view.adaptive(false);
    view.chaseDistance = 15; view.chaseFov = 50;
    window.qa.finishSnapshot = () => {
      const { view,game } = window.qa, context = view.renderer.getContext(), pixel = new Uint8Array(4);
      context.finish(); context.readPixels(context.drawingBufferWidth >> 1,context.drawingBufferHeight >> 1,1,1,context.RGBA,context.UNSIGNED_BYTE,pixel);
      const minimum = game.player.visual.root.position.clone().set(Infinity,Infinity,Infinity);
      const maximum = minimum.clone().set(-Infinity,-Infinity,-Infinity);
      const corner = minimum.clone(), transform = view.camera.matrixWorld.clone(), instance = transform.clone();
      game.player.visual.root.updateWorldMatrix(true,true);
      game.player.visual.root.traverse(node => {
        if (!node.isMesh) return;
        node.geometry.computeBoundingBox();
        const bounds = node.geometry.boundingBox;
        if (!bounds || bounds.isEmpty()) return;
        for (let index = 0; index < (node.isInstancedMesh ? node.count : 1); index++) {
          if (node.isInstancedMesh) { node.getMatrixAt(index,instance); transform.multiplyMatrices(node.matrixWorld,instance); }
          else transform.copy(node.matrixWorld);
          for (const horizontal of [bounds.min.x,bounds.max.x]) for (const vertical of [bounds.min.y,bounds.max.y]) for (const depth of [bounds.min.z,bounds.max.z]) {
            corner.set(horizontal,vertical,depth).applyMatrix4(transform); minimum.min(corner); maximum.max(corner);
          }
        }
      });
      const aim = game.getAimPoint(corner).toArray();
      return {
        camera: { position: view.camera.position.toArray(),quaternion: view.camera.quaternion.toArray(),fov: view.camera.fov,near: view.camera.near,far: view.camera.far },
        player: game.player.visual.root.position.toArray(),turret: game.player.visual.turret.getWorldPosition(corner).toArray(),aim,
        bounds: { min: minimum.toArray(),max: maximum.toArray() },worldSize: game.world.size,obstacles: game.world.obstacles,
        draw: { ...view.renderer.info.render },resources: { ...view.renderer.info.memory,programs: view.renderer.info.programs?.length ?? 0 },
        pixel: [...pixel],glError: context.getError(),drawingBuffer: [context.drawingBufferWidth,context.drawingBufferHeight],
      };
    };
  });
  return { context,page };
}

async function prepare(page,options = {}) {
  return page.evaluate(({ neutral,options }) => {
    const { game,view } = window.qa;
    game.start('drive',0,'standard',71439);
    game.configureEffects({ quality: 'medium',mobile: false,reducedMotion: true,lowFlash: false });
    if (options.position) game.player.visual.root.position.fromArray(options.position);
    game.player.aim = options.yaw ?? 0;
    view.chaseDistance = options.distance ?? 15;
    view.chaseFov = 50; view.reduceMotion(true);
    game.update(0,neutral); view.render(game,2);
    return window.qa.finishSnapshot();
  },{ neutral,options });
}

function validateSnapshot(snapshot,name) {
  assert.equal(snapshot.glError,0,`${name}: WebGL error`);
  for (const values of [snapshot.camera.position,snapshot.camera.quaternion,snapshot.player,snapshot.turret,snapshot.aim,snapshot.bounds.min,snapshot.bounds.max]) {
    assert.ok(values.every(Number.isFinite),`${name}: non-finite camera or model coordinates`);
  }
  assert.ok(snapshot.draw.calls > 0 && snapshot.draw.triangles > 0,`${name}: scene must render actual geometry`);
  assert.ok(snapshot.resources.geometries > 0 && snapshot.resources.textures > 0,`${name}: renderer resources missing`);
}

async function screenshot(page,name,snapshot) {
  validateSnapshot(snapshot,name);
  const image = await page.screenshot({ path: `${folder}/${name}.png`,timeout: 120000,animations: 'disabled' });
  const { obstacles,...detail } = snapshot;
  report.screenshots.push({ name,sha256: createHash('sha256').update(image).digest('hex'),...detail });
  await checkpoint(name);
  console.log(`Full render: ${name}; ${snapshot.draw.calls} calls, ${snapshot.draw.triangles} triangles`);
}

function project(snapshot) {
  const cameraPosition = new Vector3().fromArray(snapshot.camera.position);
  const playerPosition = new Vector3().fromArray(snapshot.player);
  const bounds = new Box3(new Vector3().fromArray(snapshot.bounds.min),new Vector3().fromArray(snapshot.bounds.max));
  assert.ok(!bounds.containsPoint(cameraPosition),'Camera must remain outside the conservative vehicle box');
  assert.ok(Math.abs(cameraPosition.x) <= snapshot.worldSize / 2 && Math.abs(cameraPosition.z) <= snapshot.worldSize / 2,'Camera escaped world bounds');
  for (const obstacle of snapshot.obstacles) {
    const inside = Math.abs(cameraPosition.x - obstacle.x) < obstacle.halfX + snapshot.camera.near && Math.abs(cameraPosition.z - obstacle.z) < obstacle.halfZ + snapshot.camera.near && cameraPosition.y < (obstacle.height ?? Infinity) + snapshot.camera.near;
    assert.ok(!inside,'Camera near plane intersects an obstacle box');
  }
  const boomLength = Math.hypot(cameraPosition.x - playerPosition.x,cameraPosition.z - playerPosition.z);
  const projections = viewports.map(([width,height]) => {
    const camera = new PerspectiveCamera(snapshot.camera.fov,width / height,snapshot.camera.near,snapshot.camera.far);
    camera.position.copy(cameraPosition); camera.quaternion.fromArray(snapshot.camera.quaternion); camera.updateMatrixWorld(true);
    const aim = new Vector3().fromArray(snapshot.aim).project(camera);
    const turret = new Vector3().fromArray(snapshot.turret).project(camera);
    assert.ok(Math.abs(aim.x) < 1e-6 && Math.abs(aim.y) < 1e-6 && aim.z > -1 && aim.z < 1,'Aim point must remain on the screen centre');
    const corners = [];
    for (const horizontal of [bounds.min.x,bounds.max.x]) for (const vertical of [bounds.min.y,bounds.max.y]) for (const depth of [bounds.min.z,bounds.max.z]) {
      corners.push(new Vector3(horizontal,vertical,depth).project(camera).toArray());
    }
    assert.ok(corners.flat().every(Number.isFinite),'Model projection must remain finite');
    return { viewport: [width,height],aim: aim.toArray(),turret: turret.toArray(),bounds: { min: [0,1,2].map(axis => Math.min(...corners.map(corner => corner[axis]))),max: [0,1,2].map(axis => Math.max(...corners.map(corner => corner[axis]))) } };
  });
  return { boomLength,height: cameraPosition.y - playerPosition.y,projections };
}

try {
  for (const file of files) {
    const contents = await readFile(file); frozen.set(file,contents);
    report.files.push({ path: file,bytes: contents.length,sha256: createHash('sha256').update(contents).digest('hex') });
  }
  await checkpoint('frozen-files-recorded');
  browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  report.browser = browser.version();
  let fixedCamera;
  for (const label of detailsOnly ? ['sample'] : ['before','sample']) {
    const { context,page } = await open(label);
    try {
      if (!detailsOnly) {
      for (const [width,height] of viewports) {
        await page.setViewportSize({ width,height });
        const snapshot = await prepare(page);
        if (!fixedCamera) fixedCamera = snapshot.camera;
        await screenshot(page,`${label === 'sample' ? 'after' : 'before'}-chase-${width}x${height}`,snapshot);
      }
      await page.setViewportSize({ width: 1280,height: 800 });
      await prepare(page);
      const benchmark = await page.evaluate(camera => {
        const { view,game } = window.qa, context = view.renderer.getContext(), pixel = new Uint8Array(4);
        view.camera.clearViewOffset(); view.camera.position.fromArray(camera.position); view.camera.quaternion.fromArray(camera.quaternion);
        view.camera.fov = camera.fov; view.camera.near = camera.near; view.camera.far = camera.far; view.camera.updateProjectionMatrix();
        view.scene.getObjectByName('street-atmosphere')?.position.copy(view.camera.position);
        game.prepareEffects(view.camera,context.drawingBufferHeight);
        const samples = [];
        for (let index = 0; index < 7; index++) {
          const started = performance.now();
          view.renderer.render(view.scene,view.camera); context.finish(); context.readPixels(0,0,1,1,context.RGBA,context.UNSIGNED_BYTE,pixel);
          if (index >= 2) samples.push(performance.now() - started);
        }
        const sorted = [...samples].sort((first,second) => first - second), extension = context.getExtension('WEBGL_debug_renderer_info');
        return { samples,medianMs: sorted[2],maximumMs: sorted[sorted.length - 1],gpu: extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER),snapshot: window.qa.finishSnapshot() };
      },fixedCamera);
      validateSnapshot(benchmark.snapshot,`${label} benchmark`);
      assert.equal(benchmark.samples.length,5); assert.ok(benchmark.samples.every(value => Number.isFinite(value) && value > 0));
      report.benchmarks.push({ label,viewport: [1280,800],dpr: 1,quality: 'medium',...benchmark });
      await checkpoint(`${label}-benchmark`);
      console.log(`${label}: median synchronized render ${benchmark.medianMs.toFixed(1)} ms; five samples, no FPS claim`);
      }
      if (label !== 'sample') continue;

      if (detailMode !== 'muzzle') {
      await page.setViewportSize({ width: 640,height: 400 });
      const cases = [12,22].flatMap(distance => [0,Math.PI / 2,Math.PI,-Math.PI / 2].map(yaw => ({ name: 'spawn',distance,yaw })));
      cases.push(...[12,22].map(distance => ({ name: 'near-wall',distance,yaw: Math.PI / 2,position: [6,0,117] })));
      for (const entry of cases) {
        const snapshot = await prepare(page,entry); validateSnapshot(snapshot,`${entry.name} camera`);
        const result = project(snapshot);
        assert.ok(result.height >= 5.5 - 1e-6 && result.height <= 8.2 + 1e-6,'Sample chase height left its safe range');
        assert.ok(result.boomLength <= entry.distance + 1e-5,'Camera exceeded the selected boom length');
        if (result.boomLength >= entry.distance * .99) {
          for (const projection of result.projections) assert.ok(Math.abs(projection.turret[0]) < 1 && projection.turret[1] > -1 && projection.turret[1] < -.02,'Open-street turret pivot must remain visible below the reticle');
        }
        const { obstacles,...detail } = snapshot;
        report.cameraProbes.push({ ...entry,...result,...detail });
        await checkpoint(`camera-${report.cameraProbes.length}`);
        console.log(`Camera probe ${report.cameraProbes.length}/${cases.length}: ${entry.name}, ${entry.distance} m, ${(entry.yaw * 180 / Math.PI).toFixed(0)} degrees`);
        if (entry.name === 'near-wall' && entry.distance === 22) {
          assert.ok(result.boomLength < entry.distance * .8,'Near-wall case must actually shorten the camera boom');
          await screenshot(page,'after-near-wall-640x400',snapshot);
        }
      }
      console.log(`Camera checks: ${report.cameraProbes.length} full renders, ${viewports.length} projection aspects each`);
      }

      if (detailMode !== 'camera') {
      await page.setViewportSize({ width: 1280,height: 800 });
      await prepare(page);
      const shot = await page.evaluate(neutral => {
        const { game,view,timeline,launchPose } = window.qa;
        view.reduceMotion(false); game.configureEffects({ quality: 'medium',mobile: false,reducedMotion: false,lowFlash: false });
        timeline.length = 0;
        const origin = launchPose(game.player).origin.toArray();
        game.update(0,{ ...neutral,fire: true });
        return { origin,shots: game.shots,events: timeline.filter(event => event.kind === 'cannon') };
      },neutral);
      assert.equal(shot.shots,1); assert.equal(shot.events.length,1); assert.equal(shot.events[0].time,0);
      report.shot = shot;
      for (const seconds of [.02,.08,.2,.45]) {
        const result = await page.evaluate(({ seconds,neutral }) => {
          const { game,view } = window.qa;
          while (game.elapsed < seconds - 1e-10) game.update(Math.min(1 / 240,seconds - game.elapsed),neutral);
          const position = game.player.visual.root.position;
          view.camera.clearViewOffset(); view.camera.position.set(position.x + 9,position.y + 4.6,position.z - 10);
          view.camera.lookAt(position.x,position.y + 2.4,position.z - 4.6); view.camera.fov = 48; view.camera.updateProjectionMatrix();
          view.scene.getObjectByName('street-atmosphere')?.position.copy(view.camera.position);
          game.prepareEffects(view.camera,view.renderer.domElement.height); view.renderer.render(view.scene,view.camera);
          return { seconds: game.elapsed,shots: game.shots,phase: game.phase,effects: game.effectStats(),recoil: game.player.visual.recoilTube?.position.z ?? 0,shotAge: game.player.visual.shotAge,snapshot: window.qa.finishSnapshot() };
        },{ seconds,neutral });
        assert.ok(Math.abs(result.seconds - seconds) < 1e-8); assert.equal(result.shots,1); assert.equal(result.phase,'playing');
        assert.ok(Number.isFinite(result.recoil) && Number.isFinite(result.shotAge));
        assert.ok(Object.entries(result.effects).filter(([,value]) => typeof value === 'number').every(([,value]) => Number.isFinite(value)));
        assert.ok(result.effects.active <= Object.values(result.effects.capacity).reduce((total,value) => total + value,0),'Active effects exceeded fixed pool capacity');
        report.muzzle.push(result);
        await screenshot(page,`after-muzzle-${String(Math.round(seconds * 1000)).padStart(3,'0')}ms`,result.snapshot);
      }
      }
    } finally { await context.close(); }
  }
  assert.deepEqual(report.errors,[],'Browser errors occurred');
  assert.deepEqual(report.requests,[],'Offline harness made external requests');
  if (!detailsOnly) {
    assert.deepEqual(report.benchmarks[0].snapshot.camera,report.benchmarks[1].snapshot.camera,'Benchmark cameras must match exactly');
    report.timingStatus = 'Completed under shared-host contention; diagnostic only, no attributable performance gain.';
  }
  for (const [file,contents] of frozen) assert.ok(contents.equals(await readFile(file)),`Frozen evidence changed during verification: ${file}`);
  report.passed = true;
} catch (error) {
  report.failure = { name: error.name,message: error.message,stack: error.stack };
  throw error;
} finally {
  if (browser) await browser.close();
  await checkpoint(report.passed ? 'complete' : 'failed');
}
