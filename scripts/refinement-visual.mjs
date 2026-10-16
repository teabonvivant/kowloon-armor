import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const folder = 'docs/evidence/refinement', results = [], errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
  for (const label of ['before','sample']) {
    const context = await browser.newContext({ viewport: { width: 1280,height: 800 },deviceScaleFactor: 1 });
    await context.setOffline(true);
    const page = await context.newPage(); page.setDefaultTimeout(120000);
    page.on('pageerror',error => errors.push(error.message));
    page.on('console',message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.goto(pathToFileURL(resolve(folder,`${label}-harness.html`)).href);
    const benchmark = await page.evaluate(() => {
      const { view,game } = window.qa, context = view.renderer.getContext(), pixel = new Uint8Array(4);
      document.querySelector('#app').style.visibility = 'hidden'; document.querySelector('#notice').hidden = true;
      game.start('drive',0); view.quality('medium'); view.reduceMotion(true); view.render(game,2);
      const frames = [], neutral = { throttle: 0,steer: 0,aimX: 0,aimY: 0,fire: false,brake: true,scope: false,toggleCamera: false,pause: false };
      for (let index = 0; index < 16; index++) {
        const start = performance.now(); game.update(1/60,neutral); view.render(game,1/60); context.finish(); context.readPixels(0,0,1,1,context.RGBA,context.UNSIGNED_BYTE,pixel);
        if (index >= 4) frames.push(performance.now() - start);
      }
      const sorted = [...frames].sort((first,second) => first - second);
      const extension = context.getExtension('WEBGL_debug_renderer_info');
      return { frames,medianMs: sorted[Math.floor(sorted.length / 2)],p95Ms: sorted[Math.ceil(sorted.length * .95) - 1],draw: { ...view.renderer.info.render },memory: { ...view.renderer.info.memory },gpu: extension ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL) : 'unknown' };
    });
    await page.screenshot({ path: `${folder}/${label}-drive.png`,timeout: 120000 });
    results.push({ label,...benchmark }); console.log(label,JSON.stringify(benchmark));
    if (label === 'sample') {
      for (const [name,position,target] of [
        ['vehicle-front',[-7,3.7,88],[0,1.8,98]],
        ['vehicle-rear',[7,4.8,107],[0,1.8,98]],
        ['street-close',[-6,3.5,76],[-23,4.5,66]],
        ['road-detail',[0,17,95],[0,0,79]],
      ]) {
        await page.evaluate(({ position,target }) => {
          const { view } = window.qa; view.camera.clearViewOffset(); view.camera.position.set(...position); view.camera.lookAt(...target);
          view.camera.fov = 48; view.camera.updateProjectionMatrix(); view.renderer.render(view.scene,view.camera); view.renderer.getContext().finish();
        },{ position,target });
        await page.screenshot({ path: `${folder}/${name}.png`,timeout: 120000 });
      }
      const world = await page.evaluate(() => {
        const { view,game } = window.qa;
        game.start('battle',0); view.render(game,2);
        const count = () => { let draws = 0,instances = 0,shadow = 0; view.world.group.traverse(node => { if (node.isMesh) { draws++; instances += node.count || 1; if (node.castShadow) shadow++; } }); return { draws,instances,shadow }; };
        return { ...count(),obstacles: view.world.obstacles,enemyMarks: game.enemies.map(enemy => !!enemy.visual.root.getObjectByName('opposition-identification')) };
      });
      assert.equal(world.enemyMarks.length,2); assert.ok(world.enemyMarks.every(Boolean));
      assert.equal(world.obstacles.length,15,'visual enrichment must not silently change the battle route');
      await writeFile(`${folder}/world.json`,JSON.stringify(world,null,2));
    }
    await context.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${folder}/benchmark.json`,JSON.stringify({ browser: browser.version(),viewport: [1280,800],quality: 'medium',method: 'Sequential same-host offline source harnesses, four warmups + twelve full simulation/render/gl.finish/readPixels samples. No skipped draw calls. Software rendering; not hardware FPS. Different geometry is intentional.',results,errors },null,2));
} finally { await browser.close(); }
