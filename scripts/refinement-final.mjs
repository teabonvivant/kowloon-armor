import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { readFile,writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL,fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const folder = 'docs/evidence/refinement', errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280,height: 800 } });
  page.setDefaultTimeout(120000); await page.context().setOffline(true); page.on('pageerror',error => errors.push(error.message));
  await page.goto(pathToFileURL(resolve(folder,'sample-harness.html')).href);
  const firing = await page.evaluate(() => {
    const { game,view } = window.qa;
    document.querySelector('#app').style.visibility = 'hidden'; document.querySelector('#notice').style.visibility = 'hidden';
    game.start('drive',0); view.render(game,2);
    const input = { throttle: 0,steer: 0,aimX: 0,aimY: 0,fire: true,brake: true,scope: false,toggleCamera: false,pause: false };
    game.update(.008,input); game.update(.004,{ ...input,fire: false }); view.render(game,.012);
    view.camera.position.set(6,4.5,87); view.camera.lookAt(0,2.3,94); view.renderer.render(view.scene,view.camera); view.renderer.getContext().finish();
    return { shots: game.shots,effects: game.effectStats(),recoil: game.player.visual.recoilTube.position.z };
  });
  assert.equal(firing.shots,1); assert.equal(firing.effects.flash,2); assert.ok(firing.recoil > 0);
  await page.screenshot({ path: `${folder}/muzzle.png`,timeout: 120000 });
  const dusk = await page.evaluate(() => {
    const { view,game } = window.qa; game.start('drive',0); view.lighting('dusk'); view.render(game,2); view.renderer.getContext().finish();
    return view.scene.getObjectByName('street-atmosphere').material.uniforms.zenith.value.getHex();
  });
  assert.equal(dusk,0x626e86); await page.screenshot({ path: `${folder}/dusk.png`,timeout: 120000 });
  await page.goto(pathToFileURL(resolve(folder,'index.html')).href);
  const targets = await page.locator('a').evaluateAll(anchors => anchors.map(anchor => anchor.href));
  for (const target of targets) await readFile(fileURLToPath(target));
  const layouts = [];
  for (const width of [390,1440]) {
    await page.setViewportSize({ width,height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    layouts.push({ width,overflow: false });
  }
  const bytes = await readFile('九龍裝甲行動-寫實樣板.html');
  const browserResult = JSON.parse(await readFile(`${folder}/browser.json`,'utf8'));
  const digest = createHash('sha256').update(bytes).digest('hex'); assert.equal(digest,browserResult.artifactSha256);
  assert.deepEqual(bytes,await readFile('dist/realism.html')); assert.deepEqual(errors,[]);
  await writeFile(`${folder}/final.json`,JSON.stringify({ firing,dusk,links: targets.length,layouts,artifactSha256: digest,bytes: bytes.length,errors,method: 'Firing/dusk images are full rendering of the source harness at a known event time, not real-time FPS evidence. Review links are opened as local files; production artifact hash matches frozen offline-browser verification.' },null,2));
  console.log('Final firing, dusk, review links, layouts and artifact hash verified.');
} finally { await browser.close(); }
