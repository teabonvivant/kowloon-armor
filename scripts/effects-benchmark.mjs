import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const label = process.argv[2] ?? 'final';
assert.match(label, /^[a-z0-9-]+$/);
const evidence = '.omo/evidence/effects';
await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  import { View } from './src/view'; import { Game } from './src/game';
  const view = new View(document.querySelector('canvas')); view.reduceMotion(true);
  const game = new Game(view.scene, view.world, {shot(){}, hit(){}, finish(){}, notify(){}});
  const rest = {throttle:0,steer:0,aimX:0,aimY:0,fire:false,brake:false,scope:false,toggleCamera:false,pause:false};
  window.qa = {view,game,rest};
` }, bundle: true, format: 'iife', write: false });
const harness = resolve(evidence, `benchmark-${label}.html`);
if (!existsSync(harness) || label !== 'baseline') await writeFile(harness, `<body style="margin:0"><canvas></canvas><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
  page.setDefaultTimeout(120000);
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.context().setOffline(true); await page.goto(pathToFileURL(harness).href);
  const samples = [];
  for (const quality of ['low', 'medium', 'high']) for (const scene of ['idle', 'firing', 'contact']) {
    const result = await page.evaluate(({ quality, scene }) => {
      const {view,game,rest} = window.qa;
      let seed = 71439; Math.random = () => { seed = (Math.imul(seed,1664525)+1013904223)>>>0; return seed/4294967296; };
      view.quality(quality); game.configureEffects?.({quality,reducedMotion:true,lowFlash:false,mobile:false});
      game.start('battle',0,'training',71439);
      game.player.visual.root.position.set(0,0,100);
      game.enemies.forEach((enemy,index) => { enemy.visual.root.position.set(index ? 84 : 0,0,index ? -168+index*20 : 65); enemy.cooldown=999; });
      view.render(game,1);
      if(scene !== 'idle') {
        game.update(1/60,{...rest,fire:true});
        for(let i=0;i<(scene==='contact'?12:0);i++) game.update(1/60,rest);
      }
      const gl=view.renderer.getContext(),pixel=new Uint8Array(4);
      const complete=()=>gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);
      view.render(game,0); complete();
      const timings=[];
      for(let i=0;i<12;i++) { const start=performance.now(); view.render(game,0); complete(); timings.push(performance.now()-start); }
      timings.sort((a,b)=>a-b);
      return {quality,scene,shots:game.shots,hits:game.hits,render:{...view.renderer.info.render},memory:{...view.renderer.info.memory},medianMs:timings[6],p95Ms:timings[11],samples:12};
    }, {quality,scene});
    samples.push(result); console.log(JSON.stringify(result));
    if(quality==='low') await page.screenshot({path:`${evidence}/${label}-${scene}.png`});
  }
  assert.deepEqual(errors,[]);
  const gpu=await page.evaluate(()=>{const gl=window.qa.view.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  await writeFile(`${evidence}/scene-budget-${label}.json`,JSON.stringify({label,browser:browser.version(),gpu,viewport:[1280,800],dpr:1,seed:71439,samples,errors,method:'Same source harness, fixed poses, seed and shot step. Twelve repeated renders with synchronous readPixels of frozen idle/17ms firing/217ms contact states after warmup. Software WebGL timing, not physical-device or continuous-game FPS.'},null,2));
} finally {await browser.close();}
