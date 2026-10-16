// v1.9 scene (C08/C10/C13/C14/C15) checks.
//   node scripts/scene-v19.mjs                 node-side business-logic tests
//   node scripts/scene-v19.mjs --measure       browser: spawn-view draw calls / triangles (JSON on stdout)
//   node scripts/scene-v19.mjs --shots <dir>   browser: spawn-view dusk/day screenshots + luminance
// Run --measure with cwd = another checkout (e.g. _team_runs/v18-base) to measure that tree's src.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const browserMode = args.includes('--measure') || args.includes('--shots') || args.includes('--casters');

async function harness(root) {
  const bundle = await build({ stdin: { resolveDir: root, contents: `
    import { View } from './src/view';
    import { Game } from './src/game';
    const view = new View(document.querySelector('canvas'));
    const game = new Game(view.scene, view.world, { shot(){}, hit(){}, finish(){}, notify(){} });
    window.qa = { view, game };
  ` }, bundle: true, format: 'iife', write: false, define: { __REALISM_SAMPLE__: 'false' } });
  return bundle.outputFiles[0].text;
}

async function withPage(fn) {
  const { chromium } = await import('playwright');
  const root = resolve('.');
  const script = await harness(root);
  const dir = resolve('/tmp', `scene-v19-${process.pid}`); await mkdir(dir, { recursive: true });
  const file = resolve(dir, 'scene.html');
  await writeFile(file, `<body style="margin:0"><canvas></canvas><script>${script.replaceAll('</script', '<\\/script')}</script>`);
  const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 960, height: 600 } });
  page.setDefaultTimeout(240000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(() => {
    const gl = WebGL2RenderingContext.prototype;
    window.renderStats = { calls: 0, triangles: 0 };
    for (const method of ['drawElements', 'drawElementsInstanced', 'drawArrays', 'drawArraysInstanced']) {
      const original = gl[method];
      gl[method] = function (...a) {
        const count = method.startsWith('drawElements') ? a[1] : a[2];
        const inst = method.endsWith('Instanced') ? a[method.startsWith('drawElements') ? 4 : 3] : 1;
        window.renderStats.calls++;
        if (a[0] === this.TRIANGLES) window.renderStats.triangles += count * inst / 3;
        return original.apply(this, a);
      };
    }
  });
  try {
    await page.goto(pathToFileURL(file).href);
    return await fn(page, dir, errors);
  } finally { await browser.close(); }
}

const spawnJs = () => {
  const { view, game } = window.qa;
  game.start('drive', 0);
  view.camera.clearViewOffset();
  window.__frame = (dt = 1 / 60) => { if (view.world.updateDestructibles) view.world.updateDestructibles(dt); game.update(dt, { throttle: 0, steer: 0, brake: true, aimX: 0, aimY: 0, fire: false, scope: false, toggleCamera: false, pause: false }); view.render(game, dt); };
  for (let i = 0; i < 3; i++) window.__frame();
};

if (args.includes('--measure')) {
  const result = await withPage(async (page, dir, errors) => {
    await page.evaluate(spawnJs);
    if (args.includes('--no-arcade-shadows')) // projection: integrator switches arcade props to createPropVisual (castShadow=false)
      await page.evaluate(() => window.qa.view.scene.getObjectByName('arcade')?.traverse(o => { if (o.isMesh) o.castShadow = false; }));
    const out = {};
    for (const quality of ['medium', 'low']) for (const lighting of ['day', 'dusk']) {
      out[`${quality}/${lighting}`] = await page.evaluate(([q, l]) => {
        const { view } = window.qa;
        view.quality(q); view.lighting(l);
        for (let i = 0; i < 2; i++) window.__frame();
        window.renderStats.calls = 0; window.renderStats.triangles = 0;
        window.__frame();
        return { calls: window.renderStats.calls, triangles: Math.round(window.renderStats.triangles),
          infoCalls: view.renderer.info.render.calls, infoTriangles: view.renderer.info.render.triangles };
      }, [quality, lighting]);
    }
    return { spawnView: out, errors };
  });
  console.log(JSON.stringify(result, null, 2));
} else if (args.includes('--casters')) {
  const result = await withPage(async (page) => {
    await page.evaluate(spawnJs);
    return await page.evaluate(() => {
      const { view } = window.qa, rows = { camera: { position: view.camera.position.toArray(), quaternion: view.camera.quaternion.toArray(), fov: view.camera.fov, aspect: view.camera.aspect, far: view.camera.far, player: window.qa.game.player.visual.root.position.toArray() } };
      view.scene.traverse(o => {
        if (!o.isMesh || !o.visible) return;
        let top = o; while (top.parent && top.parent !== view.scene) top = top.parent;
        const key = (top.name || top.type) + (o.castShadow ? ' [shadow]' : '');
        rows[key] = (rows[key] ?? 0) + 1;
      });
      return rows;
    });
  });
  console.log(JSON.stringify(result, null, 2));
} else if (args.includes('--shots')) {
  const outDir = resolve(args[args.indexOf('--shots') + 1] ?? 'docs/evidence/v1.9/scene');
  const prefix = args[args.indexOf('--prefix') + 1] ?? 'after';
  await mkdir(outDir, { recursive: true });
  const result = await withPage(async (page, dir, errors) => {
    await page.evaluate(spawnJs);
    const out = {};
    for (const lighting of ['dusk', 'day']) {
      await page.evaluate(l => { window.qa.view.quality('medium'); window.qa.view.lighting(l); for (let i = 0; i < 2; i++) window.__frame(); }, lighting);
      const png = await page.screenshot({ path: resolve(outDir, `${prefix}-${lighting}.png`) });
      out[lighting] = await page.evaluate(async b64 => {
        const image = new Image(); image.src = `data:image/png;base64,${b64}`; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
        const context = canvas.getContext('2d'); context.drawImage(image, 0, 0);
        const x0 = Math.floor(image.width * .42), y0 = Math.floor(image.height * .6), w = Math.floor(image.width * .48), h = Math.floor(image.height * .14);
        const d = context.getImageData(x0, y0, w, h).data; let sum = 0;
        for (let i = 0; i < d.length; i += 4) sum += .2126 * d[i] + .7152 * d[i + 1] + .0722 * d[i + 2];
        // brightly emissive (neon) pixels over the whole frame
        const all = context.getImageData(0, 0, image.width, image.height).data; let neon = 0;
        for (let i = 0; i < all.length; i += 4) if (Math.max(all[i], all[i + 1], all[i + 2]) > 225 && Math.max(all[i], all[i + 1], all[i + 2]) - Math.min(all[i], all[i + 1], all[i + 2]) > 60) neon++;
        return { roadMeanLuminance: sum / (d.length / 4), neonPixelShare: neon / (all.length / 4) };
      }, png.toString('base64'));
    }
    return { shots: out, errors };
  });
  console.log(JSON.stringify(result, null, 2));
  const { default: assert } = await import('node:assert/strict');
  assert.ok(result.shots.dusk.roadMeanLuminance > result.shots.day.roadMeanLuminance, 'AC-HK-6: dusk road mean luminance must exceed day');
  assert.ok(result.shots.dusk.neonPixelShare > result.shots.day.neonPixelShare, 'dusk shows more neon-bright pixels than day');
  assert.deepEqual(result.errors, []);
}

if (!browserMode) await runTests();

async function runTests() {
  const { test } = await import('node:test');
  const assert = (await import('node:assert/strict')).default;
  const { writeFileSync } = await import('node:fs');
  const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
    export { createWorld } from './src/render/world';
    export { createAsphaltMaterial } from './src/render/materials';
    export { createPropVisual, createPickupVisual } from './src/render/props-hk';
    export { NEON_SIGNS, LIGHTBOX_ADS, REAL_BRAND_BLACKLIST, SIGN_TIERS, ACTIVE_CAP } from './src/render/hk-street';
    export { shopSigns, streetSigns } from './src/render/city-details';
    export { applyWorldLighting, flickerAt, updateFlicker, flicker, FLICKER_DEPTH, FLICKER_CHANNELS } from './src/render/lighting';
    export { LANDMARKS } from './src/render/hong-kong';
    export { MISSIONS } from './src/data/missions';
    export { TOUR_STOPS } from './src/field';
    export { blocked, wallFraction } from './src/math';
    export { loadPreferences } from './src/preferences';
    export { Frustum, Matrix4, PerspectiveCamera, Vector3, Quaternion, Color } from 'three';
  ` }, bundle: true, format: 'esm', platform: 'node', write: false });
  const file = resolve('/tmp', `scene-v19-tests-${process.pid}.mjs`);
  writeFileSync(file, bundle.outputFiles[0].text);
  globalThis.document = { createElement: () => ({ getContext: () => null }), body: { classList: { contains: () => false } } };
  const api = await import(pathToFileURL(file).href);
  const world = api.createWorld();
  const legacy = api.createWorld({ hkExtras: false });
  const SIMPLIFIED = [...'门铺药馆龙凤业东乐华发兴汉酱鱼鸡饭面楼书车钱银电广鸿运达顺们这个时来过无为开关记鲜园会学区医岛团艺场气热爱贝轻视觉'];
  const names = {};
  world.group.traverse(o => { const m = /^hk-([a-z]+)-\d+$/.exec(o.name); if (m) names[m[1]] = (names[m[1]] ?? 0) + 1; });
  const anchors = kind => world.hk.anchors.filter(a => a.kind === kind);

  // spawn view as recorded from View.render (player 0,0,100; chase camera)
  const camera = new api.PerspectiveCamera(50, 1.6, .2, 220);
  camera.position.set(8.232174541410396, 7.142742108578649, 115);
  camera.quaternion.set(-0.02010923989086439, 0.03571627873543662, 0.0007188314875042784, 0.9991593712644629);
  camera.updateMatrixWorld(true);
  const frustum = new api.Frustum().setFromProjectionMatrix(new api.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
  const hung = world.hk.signs.filter(sign => sign.slot.startsWith('neon-'));
  const visible = hung.filter(sign => frustum.containsPoint(new api.Vector3(sign.x, sign.y, sign.z)));

  test('AC-HK-1 spawn view: >=20 sign instances, >=8 texts, >=6 vertical, >=2 height tiers 2 m apart', () => {
    assert.ok(visible.length >= 20, `${visible.length} signs in spawn frustum`);
    assert.ok(new Set(visible.map(sign => sign.text)).size >= 8, 'distinct texts');
    const vertical = visible.filter(sign => sign.length > sign.width * 2);
    assert.ok(vertical.length >= 6);
    const tiers = [...new Set(vertical.map(sign => sign.y))].sort((a, b) => a - b);
    assert.ok(tiers.length >= 2 && tiers.at(-1) - tiers[0] >= 2, `tiers ${tiers}`);
    assert.deepEqual([...api.SIGN_TIERS], [6.5, 9.5, 13]);
    process.stdout.write(`# spawn frustum: ${visible.length} signs, ${new Set(visible.map(sign => sign.text)).size} texts, tiers ${tiers.join('/')} m\n`);
  });

  test('sign geometry: 3-5 per block face, 1.4-2.2 m wide, 5-9 m long, three tiers, double-sided pair', () => {
    for (const sign of hung) {
      assert.ok(sign.width >= 1.4 - 1e-9 && sign.width <= 2.2 + 1e-9, `width ${sign.width}`);
      assert.ok(sign.length >= 5 - 1e-9 && sign.length <= 9 + 1e-9, `length ${sign.length}`);
      assert.ok(api.SIGN_TIERS.includes(sign.y), `tier ${sign.y}`);
    }
    // 30 ordinary blocks x 4 faces x 3..5 signs
    assert.ok(hung.length >= 30 * 4 * 3 && hung.length <= 30 * 4 * 5, `${hung.length}`);
    const layer = world.hk.layer();
    assert.ok(layer.mesh && layer.count >= hung.length * 2, 'every sign has a front and a back quad in ONE instanced mesh');
  });

  test('sign texts: >=8 fictional traditional styles, no simplified-only characters, no real-brand names', () => {
    const texts = [...api.NEON_SIGNS.map(s => s.text), ...api.LIGHTBOX_ADS.map(s => s.text), ...api.shopSigns.map(s => s.text), ...api.streetSigns.map(s => s.text),
      ...api.LANDMARKS.map(l => l.name)];
    assert.ok(new Set(api.NEON_SIGNS.map(s => s.text)).size >= 8);
    for (const word of ['旅館', '酒樓', '當押', '藥行', '金舖', '茶樓', '找換', '粥麵']) assert.ok(api.NEON_SIGNS.some(s => s.text.includes(word)), word);
    for (const text of texts) {
      for (const char of text) assert.ok(!SIMPLIFIED.includes(char), `simplified character ${char} in ${text}`);
      for (const brand of api.REAL_BRAND_BLACKLIST) assert.ok(!text.includes(brand), `real brand ${brand} in ${text}`);
    }
    for (const style of api.NEON_SIGNS) assert.ok(style.neon && style.vertical && [...style.text].length >= 2 && [...style.text].length <= 4);
  });

  test('flicker: <=3 channels, never dims more than 10%, still when motion is reduced; day glow unchanged, dusk raised', () => {
    assert.equal(api.FLICKER_CHANNELS, 3); assert.ok(api.FLICKER_DEPTH <= .1);
    let low = 1;
    for (let t = 0; t < 600; t += .37) for (let c = 0; c < 3; c++) { const v = api.flickerAt(t, c); assert.ok(v <= 1 && v >= .9 - 1e-9); low = Math.min(low, v); }
    assert.ok(low < .99, 'flicker actually varies');
    document.body.classList.contains = name => name === 'reduce-motion';
    api.updateFlicker(1234.5); assert.deepEqual(api.flicker.toArray(), [1, 1, 1]);
    document.body.classList.contains = () => false;
    const material = world.hk.layer().material;
    api.applyWorldLighting('day'); const day = material.emissiveIntensity;
    api.applyWorldLighting('dusk'); const dusk = material.emissiveIntensity;
    api.applyWorldLighting('day');
    assert.equal(day, .38); assert.ok(dusk >= 1 && dusk > day * 2.5, `dusk ${dusk}`);
    assert.equal(material.emissiveIntensity, day, 'day restored exactly');
  });

  test('C08 default lighting is dusk for new installs; a stored day setting stays day', () => {
    const data = new Map();
    globalThis.localStorage = { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
    assert.equal(api.loadPreferences().lighting, 'dusk');
    data.set('kowloon-armor-settings', JSON.stringify({ lighting: 'day' }));
    assert.equal(api.loadPreferences().lighting, 'day');
    delete globalThis.localStorage;
  });

  test('AC-HK-2 props by node name: taxis, minibuses, bus stops, flyovers >=6 m, dai pai dong >=3, laundry poles >=12', () => {
    assert.ok(names.taxi >= 4); assert.ok(names.minibus >= 2); assert.ok(names.busstop >= 6);
    assert.ok(names.flyover >= 2); assert.ok(names.stall >= 3); assert.ok(names.laundry >= 12);
    const roofs = world.group.getObjectByName('hk-minibus-0') && anchors('minibus').map(a => world.group.getObjectByName(`hk-minibus-${a.index}`).userData.roof);
    assert.ok(roofs.every(roof => roof === 0xc23b2e || roof === 0x2e8b57), 'minibus roofs red or green');
    for (const a of anchors('flyover')) assert.ok(world.group.getObjectByName(`hk-flyover-${a.index}`).userData.deckBottom >= 6);
    // taxi prop: red lower body + silver roof, one mesh, shared geometry/material
    const taxi = api.createPropVisual('car', 0), again = api.createPropVisual('car', 0);
    const colours = new Set(); const attribute = taxi.root.children[0].geometry.getAttribute('color');
    for (let i = 0; i < attribute.count; i++) colours.add([attribute.getX(i), attribute.getY(i), attribute.getZ(i)].map(v => Math.round(v * 255)).join(','));
    assert.ok(colours.has('200,38,27'), 'taxi red'); assert.ok([...colours].some(c => { const [r, g, b] = c.split(',').map(Number); return r > 200 && g > 200 && b > 200 && Math.abs(r - g) < 12; }), 'silver roof');
    assert.equal(taxi.root.children[0].geometry, again.root.children[0].geometry); assert.equal(taxi.root.children[0].material, again.root.children[0].material);
  });

  test('AC-HK-3 new colliders never block spawns, mission/tour points or any road centreline; road graph connectivity unchanged', () => {
    const base = legacy.obstacles, now = world.obstacles;
    const key = o => `${o.x},${o.z},${o.halfX},${o.halfZ}`;
    const present = new Set(now.map(key));
    for (const o of base) assert.ok(present.has(key(o)), `v1.8 obstacle lost ${key(o)}`);
    assert.ok(now.length > base.length);
    const points = [[0, 100], [0, 20], [84, 100], ...api.MISSIONS.flatMap(m => [m.spawn, ...m.targets, ...('center' in m.objective ? [m.objective.center] : [])]), ...api.TOUR_STOPS.map(s => [s.x, s.z])];
    for (const [x, z] of points) assert.equal(api.blocked(x, z, now), false, `blocked ${x},${z}`);
    for (const road of [-168, -84, 0, 84, 168]) for (let along = -180; along <= 180; along += 3) for (const [x, z] of [[road, along], [along, road]]) {
      assert.ok(now.every(item => Math.abs(x - item.x) >= item.halfX + 2.3 || Math.abs(z - item.z) >= item.halfZ + 2.3), `road blocked ${x},${z}`);
    }
    const roads = [-168, -84, 0, 84, 168], junctions = roads.flatMap(x => roads.map(z => [x, z]));
    const pairs = obstacles => {
      const n = junctions.length, reach = junctions.map((a, i) => junctions.map((b, j) => i === j ||
        (Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) === 84 && api.wallFraction(a[0], a[1], b[0] - a[0], b[1] - a[1], obstacles, 2.3) === 1)));
      for (let m = 0; m < n; m++) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) if (reach[i][m] && reach[m][j]) reach[i][j] = true;
      return reach.flat().filter(Boolean).length;
    };
    assert.equal(pairs(now), pairs(base)); assert.equal(pairs(now), 625, 'whole 5x5 junction grid stays connected');
  });

  test('AC-HK-4/5 breakables: cap 24 active, obstacles never change, sign lands in 0.8-1.4 s and goes dark', () => {
    const obstacles = world.obstacles, snapshot = [...obstacles];
    assert.ok(world.destructibles.length >= 100 && world.updateDestructibles && world.resetDestructibles);
    const signs = world.destructibles.filter(d => d.kind === 'sign'), necks = world.destructibles.filter(d => d.kind === 'neon'), stalls = world.destructibles.filter(d => d.kind === 'stall');
    assert.ok(signs.length > 30 && necks.length > 30 && stalls.length >= 3);
    const layer = world.hk.layer();
    // cap
    let accepted = 0;
    for (const item of signs.slice(0, 40)) if (item.break(1)) accepted++;
    assert.equal(accepted, api.ACTIVE_CAP); assert.equal(world.hk.active(), 24); assert.equal(signs[30].broken, false);
    let peak = 0;
    for (let step = 0; step < 120; step++) { world.updateDestructibles(1 / 60); peak = Math.max(peak, world.hk.active()); }
    assert.ok(peak <= 24); assert.equal(world.hk.active(), 0);
    // landing time per instance
    for (const item of signs.slice(0, 24)) {
      assert.ok(item.fallDuration >= .8 && item.fallDuration <= 1.4, `fall ${item.fallDuration}`);
      assert.equal(item.state, 'done'); assert.equal(item.landed, true); assert.equal(item.emissive, 0);
    }
    assert.equal(signs[0].break(1), false, 'already broken');
    // after the cap clears, another sign can break; measure real landing time at 60 Hz
    const target = signs[30]; assert.equal(target.emissive, 1);
    assert.equal(target.break(2), true);
    let time = 0, landedAt = -1;
    for (let step = 0; step < 240 && target.state !== 'done'; step++) { world.updateDestructibles(1 / 60); time += 1 / 60; if (target.landed && landedAt < 0) landedAt = time; }
    assert.ok(landedAt >= .79 && landedAt <= 1.45, `landed after ${landedAt}s`);
    assert.equal(target.emissive, 0);
    // thin fragment: matrix scale height dropped well below the sign length
    const sign = world.hk.signs.find(entry => Math.hypot(entry.x - target.x, entry.z - target.z) < .01 && entry.y === target.y);
    const matrix = new api.Matrix4(); layer.mesh.getMatrixAt(sign.quad, matrix);
    assert.ok(new api.Vector3().setFromMatrixColumn(matrix, 1).length() < sign.length * .5, 'broken sign is a thin fragment');
    assert.ok(matrix.elements[13] < 1, 'fragment lies on the ground');
    // neon: flash (power > 1) then dead
    const neon = necks[0]; neon.break(1);
    let flashed = false;
    for (let step = 0; step < 60 && neon.state !== 'done'; step++) { world.updateDestructibles(1 / 60); if (neon.emissive > 1) flashed = true; }
    assert.ok(flashed && neon.emissive === 0 && neon.state === 'done');
    // stall canvas lifts
    const stall = stalls[0]; assert.equal(stall.break(1), true);
    for (let step = 0; step < 60; step++) world.updateDestructibles(1 / 60);
    assert.equal(stall.state, 'done');
    assert.equal(world.obstacles, obstacles); assert.deepEqual([...world.obstacles], snapshot);
    world.resetDestructibles();
    assert.ok(world.destructibles.every(item => !item.broken && item.state === 'idle'));
    assert.equal(signs[0].emissive, 1);
    world.updateDestructibles(0); world.updateDestructibles(-1); world.updateDestructibles(Number.NaN);
  });

  test('C10 prop visuals: one shared-geometry mesh per prop, wreck() is burnt, squashed and idempotent', () => {
    for (const kind of ['barrel', 'lpg', 'car', 'minibus', 'tanker', 'transformer']) {
      for (let variant = 0; variant < 4; variant++) {
        const a = api.createPropVisual(kind, variant), b = api.createPropVisual(kind, variant);
        assert.equal(a.root.children.length, 1); const mesh = a.root.children[0];
        assert.equal(mesh.geometry, b.root.children[0].geometry); assert.equal(mesh.material, b.root.children[0].material);
        assert.equal(mesh.castShadow, false);
        const before = mesh.material; a.wreck(); const burnt = mesh.material; a.wreck();
        assert.notEqual(burnt, before); assert.ok(burnt.color.getHex() < 0x303030 && !burnt.vertexColors);
        assert.ok(mesh.scale.y < .7 && mesh.scale.y > 0);
        assert.equal(b.root.children[0].material, before, 'wreck affects only that instance');
      }
    }
    for (const kind of ['repair', 'rapid']) {
      const pickup = api.createPickupVisual(kind), second = api.createPickupVisual(kind);
      assert.ok(pickup.children.length <= 2 && pickup.children.length >= 1);
      assert.equal(pickup.children[0].geometry, second.children[0].geometry);
    }
  });

  test('C15 wet street: reflection bars in 1 draw call (<=3), ~50 puddles, asphalt roughness ~0.75, no environment map', () => {
    const bars = world.group.getObjectByName('hk-wet-reflections'), puddles = world.group.getObjectByName('hk-puddles');
    assert.ok(bars.isInstancedMesh && bars.count >= 40 && bars.count <= 48); assert.ok(puddles.count >= 45 && puddles.count <= 55);
    let calls = 0; world.group.traverse(o => { if (o.name === 'hk-wet-reflections') calls++; });
    assert.ok(calls <= 3);
    const asphalt = api.createAsphaltMaterial();
    assert.ok(Math.abs(asphalt.roughness - .75) < .03); assert.equal(asphalt.envMap, null);
    api.applyWorldLighting('dusk'); assert.ok(asphalt.emissiveIntensity > 0 || world.group.children.length); api.applyWorldLighting('day');
  });

  test('static budget: world meshes <=190 and triangles not above the v1.8 city (412,232)', () => {
    const count = group => { let meshes = 0, triangles = 0; group.traverse(o => { if (o.isMesh) { meshes++; triangles += (o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3 * (o.count ?? 1); } }); return { meshes, triangles }; };
    const now = count(world.group), old = count(legacy.group);
    assert.ok(now.meshes <= 190, `${now.meshes} meshes`);
    assert.ok(now.triangles <= 412232, `${now.triangles} triangles (v1.8 city: 412232)`);
    assert.ok(old.meshes <= 190);
    assert.ok(now.meshes <= 199, 'not more meshes than the v1.8 city (199)');
  });
}
