// v1.9 fx browser evidence: explosion time slices (+17/+83/+250/+700 ms/+3 s) and firing slices (+20/+80/+200/+450 ms).
// Software WebGL is slow: fixed 60 Hz stepping, render only at slice times. Run in background: nohup node scripts/fx-v19-browser.mjs &
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const raw = '.omo/evidence/fx-v19', evidence = 'docs/evidence/v1.9/fx';
await mkdir(raw, { recursive: true }); await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  import {View} from './src/view';import {Game} from './src/game';import {createActor} from './src/actors';
  import {TANKS} from './src/data/tanks';import {Vector3} from 'three';
  const view=new View(document.querySelector('canvas'));view.quality('medium');
  const contacts=[];const game=new Game(view.scene,view.world,{shot:()=>view.recoil(),contact:c=>contacts.push({kind:c.kind,grade:c.grade,destroyed:c.destroyed}),hit(){},finish(){},notify(){}});
  const rest={throttle:0,steer:0,aimX:0,aimY:0,fire:false,brake:false,scope:false,toggleCamera:false,pause:false};
  const options={quality:'medium',mobile:false,reducedMotion:false,lowFlash:false};
  function setup(){game.start('drive',0,'training',71439);game.configureEffects(options);contacts.length=0;view.render(game,1);}
  function stats(){const gl=view.renderer.getContext(),w=gl.drawingBufferWidth,h=gl.drawingBufferHeight,px=new Uint8Array(w*h*4);
    gl.readPixels(0,0,w,h,gl.RGBA,gl.UNSIGNED_BYTE,px);let sum=0,bright=0;const n=w*h;
    for(let i=0;i<px.length;i+=4){const l=(.2126*px[i]+.7152*px[i+1]+.0722*px[i+2])/255;sum+=l;if(l>.8)bright++;}
    return {meanLuma:sum/n,brightArea:bright/n};}
  function advance(frames,fire=false){for(let i=0;i<frames;i++)game.update(1/60,{...rest,fire:fire&&i===0});}
  function slice(frames,renderDt,fire=false){advance(frames,fire);view.render(game,renderDt);return {effects:game.effectStats(),camera:view.camera.position.toArray(),fov:view.camera.fov,...stats(),contacts:[...contacts]};}
  window.qa={view,game,setup,slice,advance,options,Vector3,createActor,TANKS};
` }, bundle: true, format: 'iife', write: false });
const harness = resolve(raw, 'fx-scene.html');
await writeFile(harness, `<body style="margin:0;background:#141e22"><canvas></canvas><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script></body>`);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const report = { slices: {}, errors: [] };
try {
  const page = await browser.newPage({ viewport: { width: 960, height: 540 }, deviceScaleFactor: 1 }); page.setDefaultTimeout(300000);
  page.on('pageerror', e => report.errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') report.errors.push(m.text()); });
  await page.goto(pathToFileURL(harness).href);
  const slices = [['017ms', 1], ['083ms', 4], ['250ms', 10], ['700ms', 27], ['3s', 109]];
  for (const [kind, power] of [['lpg', 1.2], ['tanker', 2]]) {
    await page.evaluate(([k, p]) => { const q = window.qa; q.setup(); const at = new q.Vector3(0, 1.2, 76);
      q.game.effects.explosion(k, at, p); q.view.blast(at, p); }, [kind, power]);
    for (const [name, frames] of slices) {
      const data = await page.evaluate(([f]) => window.qa.slice(f, 1 / 60), [frames]);
      await page.screenshot({ path: `${evidence}/explosion-${kind}-${name}.png` });
      (report.slices[`${kind}-${name}`] = data); console.log(kind, name, JSON.stringify({ e: data.effects, l: data.meanLuma.toFixed(3), b: data.brightArea.toFixed(4) }));
    }
  }
  // firing slices (+20/+80/+200/+450 ms) at a stationary enemy 65 m ahead
  await page.evaluate(() => { const q = window.qa; q.setup(); const t = q.createActor(q.TANKS[0], 0, 65, true); t.cooldown = 999;
    q.game.enemies.push(t); q.view.scene.add(t.visual.root); q.view.render(q.game, 1); });
  let first = true;
  for (const [name, frames] of [['020ms', 1], ['080ms', 4], ['200ms', 7], ['450ms', 15]]) {
    const data = await page.evaluate(([f, fire]) => window.qa.slice(f, 1 / 60, fire), [frames, first]); first = false;
    await page.screenshot({ path: `${evidence}/fire-${name}.png` });
    report.slices[`fire-${name}`] = data; console.log('fire', name, JSON.stringify({ e: data.effects, l: data.meanLuma.toFixed(3) }));
  }
  assert.deepEqual(report.errors, []);
} finally { await writeFile(`${evidence}/fx-report.json`, JSON.stringify(report, null, 1)); await browser.close(); }
