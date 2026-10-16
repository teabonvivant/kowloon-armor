import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const folder = 'docs/evidence/realism', samples = [], errors = [];
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
try {
  for (const label of ['baseline','sample']) {
    const page = await browser.newPage({ viewport: { width: 1280,height: 800 },deviceScaleFactor: 1 });
    page.setDefaultTimeout(120000); await page.context().setOffline(true);
    page.on('pageerror',error => errors.push(error.message));
    await page.goto(pathToFileURL(resolve(folder,`${label}-harness.html`)).href);
    const result = await page.evaluate(() => {
      const { game,view } = window.qa, context = view.renderer.getContext();
      for (const selector of ['#app','#notice']) { const element = document.querySelector(selector); if (element) element.style.visibility = 'hidden'; }
      game.start('drive',0); view.quality('medium'); view.reduceMotion(true); view.render(game,2); context.finish();
      const frames = [], pixel = new Uint8Array(4), control = { throttle: 0,steer: 0,brake: true,aimX: 0,aimY: 0,fire: false,scope: false,toggleCamera: false,pause: false };
      for (let frame = 0; frame < 24; frame++) {
        const start = performance.now(); game.update(1 / 60,control); view.render(game,1 / 60); context.finish(); context.readPixels(0,0,1,1,context.RGBA,context.UNSIGNED_BYTE,pixel);
        if (frame >= 4) frames.push(performance.now() - start);
      }
      const sorted = [...frames].sort((first,second) => first - second), debug = context.getExtension('WEBGL_debug_renderer_info');
      return { frames,medianMs: sorted[Math.floor(sorted.length * .5)],p95Ms: sorted[Math.floor(sorted.length * .95)],draw: { ...view.renderer.info.render },resources: { ...view.renderer.info.memory },gpu: debug ? context.getParameter(debug.UNMASKED_RENDERER_WEBGL) : context.getParameter(context.RENDERER) };
    });
    samples.push({ label,...result }); console.log(label,JSON.stringify(result)); await page.close();
  }
  assert.deepEqual(errors,[]);
  await writeFile(`${folder}/benchmark.json`,JSON.stringify({ timestamp: new Date().toISOString(),browser: browser.version(),viewport: [1280,800],dpr: 1,quality: 'medium',samples,errors,method: 'Sequential baseline/sample source harnesses on the same container. Twenty complete simulation + Three.js render + gl.finish + blocking pixel readback samples after four warm-up frames, stationary driving camera, no HUD; no draw-call interception. Readback forces rendered work to complete rather than timing command submission alone. Timing includes the synchronization cost, not display refresh, UI compositing or input latency. SwiftShader is software rendering, not a Windows/mobile hardware FPS promise. Different street/model geometry is intentional.' },null,2));
} finally { await browser.close(); }
