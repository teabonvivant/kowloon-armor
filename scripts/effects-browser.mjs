import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const raw='.omo/evidence/effects',evidence='docs/evidence/effects';
await mkdir(raw,{recursive:true});await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{resolveDir:resolve('.'),contents:`
  import {View} from './src/view';import {Game} from './src/game';import {createActor} from './src/actors';
  import {TANKS} from './src/data/tanks';import {Vector3,Mesh,BoxGeometry,MeshBasicMaterial} from 'three';
  const view=new View(document.querySelector('canvas'));view.quality('low');
  const contacts=[];const game=new Game(view.scene,view.world,{shot:()=>view.recoil(),contact:c=>contacts.push({kind:c.kind,destroyed:c.destroyed,position:c.position.toArray(),normal:c.normal.toArray()}),hit(){},finish(){},notify(){}});
  const rest={throttle:0,steer:0,aimX:0,aimY:0,fire:false,brake:false,scope:false,toggleCamera:false,pause:false};
  const options={quality:'low',mobile:false,reducedMotion:false,lowFlash:false};
  function render(){view.render(game,0);const gl=view.renderer.getContext();gl.readPixels(0,0,1,1,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(4));}
  function setup(lethal=false){game.start('drive',0,'training',71439);game.configureEffects(options);contacts.length=0;
    const target=createActor(TANKS[0],0,65,true);target.cooldown=999;if(lethal)target.hp=1;
    game.enemies.push(target);view.scene.add(target.visual.root);view.render(game,1);return target;}
  function step(count,fire=false){for(let i=0;i<count;i++)game.update(1/60,{...rest,fire});render();return snapshot();}
  function snapshot(){return {effects:game.effectStats(),contacts:[...contacts],root:game.player.visual.root.position.toArray(),
    barrel:game.player.visual.barrel.position.toArray(),body:game.player.visual.body.rotation.toArray(),camera:view.camera.position.toArray(),
    render:{...view.renderer.info.render},memory:{...view.renderer.info.memory,programs:view.renderer.info.programs?.length??0},hp:game.enemies[0]?.hp};}
  window.qa={view,game,setup,step,render,snapshot,options,Vector3,Mesh,BoxGeometry,MeshBasicMaterial};
`},bundle:true,format:'iife',write:false});
const harness=resolve(raw,'effects-scene.html');await writeFile(harness,`<body style="margin:0;background:#141e22"><canvas></canvas><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
const browser=await chromium.launch({args:['--enable-unsafe-swiftshader','--disable-gpu-sandbox']});
try {
  const page=await browser.newPage({viewport:{width:1440,height:900},deviceScaleFactor:1});page.setDefaultTimeout(120000);
  const errors=[],requests=[],checks=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});await page.context().setOffline(true);
  await page.goto(pathToFileURL(harness).href);
  const check=(name,data)=>{checks.push({id:`R${checks.length+1}`,name,data});console.log(name,JSON.stringify(data));};
  const shot=async name=>{await page.screenshot({path:`${evidence}/${name}.png`});};
  await page.evaluate(()=>window.qa.setup());
  const muzzle=await page.evaluate(()=>window.qa.step(1,true));
  assert.ok(muzzle.effects.flash>0 && muzzle.effects.projectiles===1);assert.ok(muzzle.barrel[2]>-1.42);assert.equal(muzzle.root[2],100);
  await shot('muzzle-017ms-1440');check('actual cannon emits aligned muzzle, projectile and immediate recoil',muzzle);
  const recoil=await page.evaluate(()=>window.qa.step(3));assert.ok(recoil.barrel[2]>muzzle.barrel[2]);
  await shot('recoil-067ms-1440');
  const impact=await page.evaluate(()=>window.qa.step(8));assert.equal(impact.contacts.length,1);assert.equal(impact.contacts[0].kind,'armor');assert.equal(impact.contacts[0].destroyed,false);assert.ok(impact.effects.sparks>0);
  await shot('armor-200ms-1440');check('ordinary swept armour contact has sparks, mark and no lethal flag',impact);
  const paused=await page.evaluate(()=>{window.qa.view.render(window.qa.game,.03);window.qa.game.pause();const before=window.qa.snapshot();window.qa.step(60);window.qa.view.render(window.qa.game,.5);return {before,after:window.qa.snapshot()};});
  assert.deepEqual(paused.after.effects,paused.before.effects);assert.deepEqual(paused.after.camera,paused.before.camera);assert.deepEqual(paused.after.barrel,paused.before.barrel);
  check('pause freezes particles, projectiles, camera and recoil',paused.after.effects);
  await page.evaluate(()=>{window.qa.game.resume();window.qa.step(60);});
  await page.evaluate(()=>{window.qa.setup(true);window.qa.step(1,true);window.qa.step(12);});
  const destroyed=await page.evaluate(()=>window.qa.snapshot());assert.equal(destroyed.contacts[0].destroyed,true);assert.ok(destroyed.effects.smoke>0);
  await shot('destruction-217ms-1440');await page.evaluate(()=>window.qa.step(168));await shot('wreck-3s-1440');
  const cooled=await page.evaluate(()=>window.qa.step(1900));assert.equal(cooled.effects.active,0);check('lethal contact, staged fire/smoke and eventual wreck cooling',{destroyed,cooled});
  const materials=[];
  for(const kind of ['track','road','building','metal']) {
    const state=await page.evaluate(kind=>{const {game,view,Vector3}=window.qa;game.start('drive',0);game.effects.impact(new Vector3(0,kind==='road'?.2:2.5,84),new Vector3(0,kind==='road'?1:0,kind==='road'?0:1),new Vector3(0,kind==='road'?-1:0,kind==='road'?0:-1),kind,120);game.effects.update(.07);
      view.camera.position.set(7,5,96);view.camera.lookAt(0,1.5,84);view.renderer.render(view.scene,view.camera);return game.effectStats();},kind);
    assert.ok(state.marks>0 && state.debris>0);materials.push({kind,...state});await shot(`contact-${kind}`);
  }
  check('material-specific oriented contacts use fixed spark/debris/mark pools',materials);
  const realContacts=[];
  for(const kind of ['building','road','track']) {
    const state=await page.evaluate(kind=>{const {game,view}=window.qa;const target=window.qa.setup();
      if(kind==='building')game.player.aim=Math.PI/2;
      else game.player.pitch=-.12;
      if(kind==='track'){target.visual.root.position.set(0,0,85);target.think=999;target.tactic='advance';target.waypoint.copy(target.visual.root.position);game.player.aim=-Math.atan2(2.6,15);}
      view.render(game,1);window.qa.step(1,true);return window.qa.step(kind==='building'?4:kind==='track'?4:7);
    },kind);
    assert.equal(state.contacts[0]?.kind,kind,JSON.stringify(state));realContacts.push({kind,...state});await shot(`actual-${kind}-contact`);
  }
  check('actual swept shots hit building, road and a track at their calculated contacts',realContacts);
  const comfort=await page.evaluate(()=>{const {game,view,options}=window.qa;options.reducedMotion=true;options.lowFlash=true;options.mobile=true;options.quality='high';view.reduceMotion(true);window.qa.setup();const before=view.camera.position.toArray();window.qa.step(1,true);view.render(game,.05);const after=window.qa.snapshot();return {before,after};});
  assert.equal(comfort.after.body[0],0);assert.equal(comfort.after.body[2],0);assert.ok(comfort.after.effects.capacity.smoke<=48);assert.ok(comfort.after.effects.radiance<.5);
  await shot('reduced-motion-low-flash');check('reduced motion, low flash and mobile budgets apply to actual firing',comfort);
  const views=[];
  for(const mode of ['chase','driver','gunner','scope','observe']) {
    const data=await page.evaluate(mode=>{const {game,view,options}=window.qa;options.reducedMotion=false;options.mobile=false;options.lowFlash=false;options.quality='low';view.reduceMotion(false);window.qa.setup();game.cameraMode=mode==='scope'||mode==='observe'?'chase':mode;game.scope=mode==='scope';game.observing=mode==='observe';view.render(game,1);
      game.combat.fire(game.player,game.world.obstacles);game.effects.update(.017);view.render(game,.017);return window.qa.snapshot();},mode);
    views.push({mode,...data});assert.ok(data.camera.every(Number.isFinite));await shot(`view-${mode}`);
  }
  check('five view contexts retain readable aim with bounded directional kick',views);
  for(const lighting of ['day','dusk']) {await page.evaluate(lighting=>{window.qa.view.lighting(lighting);window.qa.setup();window.qa.step(1,true);},lighting);await shot(`lighting-${lighting}`);}
  const resources=[];
  for(let round=0;round<8;round++) {
    const state=await page.evaluate(()=>{window.qa.setup(true);window.qa.step(1,true);window.qa.step(14);window.qa.game.garage();window.qa.render();return window.qa.snapshot();});
    assert.equal(state.effects.active,0);assert.equal(state.effects.projectiles,0);resources.push(state.memory);
  }
  for(const memory of resources.slice(2))assert.deepEqual(memory,resources[2]);
  check('eight real firing/destruction/restart cycles have stable warmed renderer resources',resources);
  const occlusion=await page.evaluate(()=>{
    const {game,view,Vector3,Mesh,BoxGeometry,MeshBasicMaterial}=window.qa;game.garage();game.player.visual.root.visible=false;
    view.camera.position.set(0,3,110);view.camera.lookAt(0,3,90);view.camera.clearViewOffset();
    const wall=new Mesh(new BoxGeometry(20,12,1),new MeshBasicMaterial({color:0x24383d}));wall.position.set(0,4,96);view.scene.add(wall);
    const sample=()=>{view.renderer.render(view.scene,view.camera);const gl=view.renderer.getContext(),pixel=new Uint8Array(4);gl.readPixels(gl.drawingBufferWidth/2,gl.drawingBufferHeight/2,1,1,gl.RGBA,gl.UNSIGNED_BYTE,pixel);return [...pixel];};
    const before=sample();game.effects.destroy(new Vector3(0,2,90),120);game.effects.update(.06);const after=sample();
    wall.removeFromParent();wall.geometry.dispose();wall.material.dispose();game.effects.clear();return {before,after};
  });assert.deepEqual(occlusion.after,occlusion.before);check('opaque wall depth-occludes smoke/flame in framebuffer',occlusion);
  const disposed=await page.evaluate(()=>{const {game,view}=window.qa;game.dispose();game.dispose();view.renderer.render(view.scene,view.camera);return {effects:game.effectStats(),remaining:view.scene.children.filter(o=>/pool|projectile|impact-|track-dust|ground-reflection/.test(o.name)).map(o=>o.name)};});
  assert.equal(disposed.effects.resources,0);assert.deepEqual(disposed.remaining,[]);check('dispose releases all transient render objects idempotently',disposed);
  assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);
  const gpu=await page.evaluate(()=>{const gl=window.qa.view.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return ext?gl.getParameter(ext.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);});
  await writeFile(`${evidence}/renderer.json`,JSON.stringify({browser:browser.version(),gpu,checks,errors,requests,method:'Offline source harness uses actual Game/Combat/Effects/View; controlled targets/HP for exact contact and destruction captures. Material gallery and occlusion probes directly invoke Effects. Not gameplay difficulty or physical-device validation.'},null,2));
}finally{await browser.close();}
