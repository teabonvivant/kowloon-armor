import assert from 'node:assert/strict';
import { test } from 'node:test';
import { existsSync } from 'node:fs';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export * from './src/effects'; export * from './src/combat'; export * from './src/actors';
  export * from './src/render/tank'; export {Game} from './src/game'; export {TANKS} from './src/data/tanks';
  export {Interface} from './src/interface'; export {GameAudio} from './src/audio';
  export {Scene,Group,Vector3,Matrix4,PerspectiveCamera} from 'three';
  ${existsSync('src/effect-math.ts') ? "export * from './src/effect-math';" : ''}
  ${existsSync('src/effect-audio.ts') ? "export * from './src/effect-audio';" : ''}
` }, bundle:true,format:'esm',platform:'node',write:false });
const api=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const v=(x=0,y=0,z=0)=>new api.Vector3(x,y,z);
const rest={throttle:0,steer:0,aimX:0,aimY:0,fire:false,brake:false,scope:false,toggleCamera:false,pause:false};
function requireFunction(name) {assert.equal(typeof api[name],'function',`${name} must exist`);return api[name];}
function effects() {return new api.Effects(new api.Scene());}
function combat() {
  const scene=new api.Scene(),fx=new api.Effects(scene),contacts=[],hits=[];
  const c=new api.Combat(scene,fx,{shot(){},hit:(...args)=>hits.push(args),contact:(...args)=>contacts.push(args)});
  const actor=api.createActor(api.TANKS[0],0,0);
  return {scene,fx,c,actor,contacts,hits};
}
test('M01 calibre profiles scale force, length and time within bounded ranges',()=>{
  const profile=requireFunction('gunProfile'); const small=profile(105,70),large=profile(152,40);
  assert.ok(large.stroke>small.stroke && large.length>small.length && large.force>small.force);
  assert.deepEqual(profile(NaN,NaN),profile(120,60));
  assert.ok(profile(999,1).stroke<.8 && profile(999,1).force<=1.6);
});
test('M02 recoil has fast compression, slower recovery and exact resting endpoint',()=>{
  const envelope=requireFunction('recoilEnvelope');
  assert.equal(envelope(0),0);assert.ok(envelope(.04)>.8);assert.ok(envelope(.18)>.3);
  assert.ok(envelope(.4)<envelope(.18));assert.equal(envelope(1),0);assert.equal(envelope(-1),0);
});
test('M03 flash ignition and tail end quickly; particle fade reaches zero',()=>{
  const flash=requireFunction('flashEnvelope'),fade=requireFunction('particleEnvelope');
  assert.ok(flash(.017)>flash(.1));assert.equal(flash(.2),0);
  assert.equal(fade(0,1),0);assert.ok(fade(.2,1)>.5);assert.equal(fade(1,1),0);
});
test('M04 view and scope attenuate camera force and reduced motion cancels it',()=>{
  const kick=requireFunction('cameraKick');
  const chase=kick(.05,'chase',false,2,1,false),driver=kick(.05,'driver',false,2,1,false),scope=kick(.05,'gunner',true,4,1,false);
  assert.ok(Math.abs(chase)>Math.abs(driver) && Math.abs(driver)>Math.abs(scope));
  assert.equal(kick(.05,'chase',false,2,1,true),0);assert.equal(kick(2,'chase',false,2,1,false),0);
});
test('M05 tracer is capped, never longer than travelled segment; ground contact interpolates',()=>{
  const length=requireFunction('tracerLength'),ground=requireFunction('groundContact');
  assert.ok(length(190,.2)<=4);assert.ok(length(190,.001)<=.19);
  assert.equal(ground(1,-2),.4);assert.equal(ground(1,2),1);
});
test('M06 wall normals point out of the contacted face without changing collision boxes',()=>{
  const normal=requireFunction('wallNormal'),boxes=[{x:0,z:0,halfX:5,halfZ:5}];
  assert.deepEqual(normal(v(5,2,0),boxes,v(-1,0,0)).toArray(),[1,0,0]);
  assert.deepEqual(normal(v(0,2,-5),boxes,v(0,0,1)).toArray(),[0,0,-1]);
});
test('M07 impact direction reflects away from a surface at glancing incidence',()=>{
  const reflect=requireFunction('impactDirection'),normal=v(1,0,0),ray=v(-.1,0,-1).normalize();
  const bounced=reflect(ray,normal);assert.ok(bounced.x>0 && bounced.z<-.8);assert.ok(Math.abs(bounced.length()-1)<1e-9);
});
test('M08 quality and mobile budgets are monotonically bounded',()=>{
  const budget=requireFunction('effectBudget');
  for(const name of ['smoke','sparks','debris','marks']) {
    assert.ok(budget('low',false)[name]<budget('high',false)[name]);
    assert.ok(budget('high',true)[name]<=budget('low',false)[name]);
  }
});
test('M09 every tank muzzle follows the actual barrel world transform',()=>{
  const muzzle=requireFunction('muzzlePosition');
  for(const spec of api.TANKS) for(const pitch of [-.12,.32]) {
    const a=api.createActor(spec,12,84);a.visual.root.rotation.y=.7;a.visual.turret.rotation.y=1.1;a.visual.barrel.rotation.x=pitch;
    a.visual.root.updateMatrixWorld(true);
    const expected=a.visual.barrel.localToWorld(v(0,0,-3.745));
    assert.ok(muzzle(a.visual,v()).distanceTo(expected)<1e-8,spec.id);api.disposeTank(a.visual);
  }
});
test('M10 recoil moves along pitched barrel while physics root and tracks remain fixed',()=>{
  const kick=requireFunction('kickTank'),update=requireFunction('updateTankMotion'),a=api.createActor(api.TANKS[0],0,0);
  a.pitch=.3;a.visual.barrel.rotation.x=.3;const root=a.visual.root.position.clone();
  kick(a.visual,120,60,.8);update(a.visual,.025,.3,0,false);
  assert.ok(a.visual.barrel.position.y<.28);assert.ok(a.visual.barrel.position.z>-1.42);
  assert.deepEqual(a.visual.root.position,root);assert.equal(a.visual.treads.parent,a.visual.root);
  assert.ok(Math.abs(a.visual.body.rotation.z)>0);update(a.visual,2,.3,0,false);
  assert.equal(a.visual.recoil,0);assert.equal(a.visual.body.rotation.z,0);
});
test('M11 reduced motion removes suspension and repeated impulse cannot exceed cap',()=>{
  const kick=requireFunction('kickTank'),update=requireFunction('updateTankMotion'),a=api.createActor(api.TANKS[0],0,0);
  for(let i=0;i<100;i++)kick(a.visual,152,40,1);update(a.visual,.02,0,20,true);
  assert.equal(a.visual.body.rotation.x,0);assert.equal(a.visual.body.rotation.z,0);assert.ok(a.visual.recoil<.8);
});
test('P01 firing uses stable scene objects and all emission types remain within pools',()=>{
  const fx=effects();assert.equal(typeof fx.muzzle,'function');assert.equal(typeof fx.stats,'function');
  const before=fx.stats();
  for(let i=0;i<200;i++){fx.muzzle(v(0,2.5,0),v(0,0,-1),120,true);fx.impact(v(),v(0,1,0),v(0,-1,0),'road',120);fx.dust(v(),0,20);}
  const after=fx.stats();assert.equal(after.resources,before.resources);
  for(const key of ['smoke','sparks','debris','marks','flash','dust'])assert.ok(after[key]<=after.capacity[key],key);
  fx.clear();assert.equal(fx.stats().active,0);fx.dispose();
});
test('P02 smoke grows and fades, debris stays above ground, zero dt is inert',()=>{
  const fx=effects();assert.equal(typeof fx.impact,'function');
  fx.impact(v(0,.2,0),v(0,1,0),v(0,-1,0),'building',120);fx.update(.05);
  const before=fx.stats();fx.update(0);assert.deepEqual(fx.stats(),before);
  let bounced=false;
  for(let i=0;i<300;i++){fx.update(1/60);for(const p of fx.debris.slots.filter(p=>p.life>0)){
    assert.ok(p.position.y>=.035);bounced ||= p.bounce;
  }}
  assert.ok(bounced,'at least one live fragment must reach and rebound from the road');
  fx.update(30);assert.equal(fx.stats().active,0);fx.dispose();
});
test('P03 clear drops anchors and pending effects; dispose is idempotent',()=>{
  const scene=new api.Scene(),fx=new api.Effects(scene);assert.equal(typeof fx.destroy,'function');
  fx.destroy(v(),120);fx.clear();fx.update(.3);assert.equal(fx.stats().active,0);
  const resources=[];scene.traverse(o=>{if(o.geometry)resources.push(o.geometry);});let disposed=0;
  for(const resource of new Set(resources))resource.addEventListener('dispose',()=>disposed++);
  fx.dispose();fx.dispose();assert.equal(disposed,new Set(resources).size);assert.equal(scene.children.length,0);
});
test('P04 damage severity, cooling and range change emissions without immortal wreck smoke',()=>{
  const fx=effects();assert.equal(typeof fx.stats,'function');
  fx.damage(v(),.55,0);const medium=fx.stats().active;assert.ok(medium>0);fx.clear();
  fx.damage(v(),.15,0);assert.ok(fx.stats().active>medium);fx.clear();
  fx.damage(v(),0,40);assert.equal(fx.stats().active,0);fx.dispose();
});
test('P05 low flash reduces radiance; quality changes clear excess particles',()=>{
  const fx=effects();assert.equal(typeof fx.configure,'function');
  fx.muzzle(v(0,2,0),v(0,0,-1),120,true);fx.update(.017);const bright=fx.stats().radiance;
  fx.clear();fx.configure({quality:'low',mobile:true,reducedMotion:true,lowFlash:true});
  fx.muzzle(v(0,2,0),v(0,0,-1),120,true);fx.update(.017);assert.ok(fx.stats().radiance<bright*.5);fx.dispose();
});
test('P06 armour marks follow an anchor, release it after expiry and have bounded life',()=>{
  const fx=effects();assert.equal(typeof fx.stats,'function');const anchor=new api.Group();
  fx.impact(v(0,2,0),v(0,0,1),v(0,0,-1),'armor',120,anchor);assert.equal(fx.stats().anchors,1);
  anchor.position.x=12;anchor.updateMatrixWorld(true);fx.update(.2);assert.ok(fx.stats().markX>11);
  fx.update(30);assert.equal(fx.stats().anchors,0);fx.dispose();
});
test('C01 shell timeout has no false contact or explosion',()=>{
  const {c,actor,fx,contacts}=combat();assert.equal(typeof c.stats,'function');actor.pitch=.32;c.fire(actor,[]);fx.clear();
  for(let i=0;i<190;i++){c.update(1/60,[actor],[],1);fx.update(1/60);}
  assert.equal(contacts.length,0);assert.equal(c.stats().active,0);assert.equal(fx.stats().active,0);c.dispose();fx.dispose();
});
test('C02 wall and ground contacts publish exact position, kind and outward normal',()=>{
  const {c,actor,fx,contacts}=combat();const wall=[{x:0,z:-15,halfX:4,halfZ:1}];
  c.fire(actor,wall);for(let i=0;i<20;i++)c.update(1/60,[actor],wall,1);
  assert.equal(contacts.length,1);assert.equal(contacts[0][0].kind,'building');assert.equal(contacts[0][0].position.z,-14);
  assert.ok(contacts[0][0].normal.z>.9);c.clear();actor.cooldown=0;actor.pitch=-.12;c.fire(actor,[]);
  for(let i=0;i<40;i++)c.update(1/60,[actor],[],1);
  assert.equal(contacts[1][0].kind,'road');assert.ok(Math.abs(contacts[1][0].position.y-.2)<1e-8);c.dispose();fx.dispose();
});
test('C03 muzzle obstruction emits one contact, no escaping shell',()=>{
  const {c,actor,fx,contacts}=combat();assert.equal(typeof c.stats,'function');
  c.fire(actor,[{x:0,z:-3,halfX:5,halfZ:.1}]);assert.equal(c.stats().active,0);assert.equal(contacts.length,1);
  assert.ok(contacts[0][0].position.z>-3);c.dispose();fx.dispose();
});
test('C04 projectile pool saturates safely, clear reuses slots and disposes GPU resources',()=>{
  const {c,actor,fx}=combat();assert.equal(typeof c.stats,'function');
  for(let i=0;i<100;i++){actor.cooldown=0;c.fire(actor,[]);}assert.ok(c.stats().active<=32);
  c.clear();assert.equal(c.stats().active,0);actor.cooldown=0;assert.equal(c.fire(actor,[]),true);
  assert.equal(c.stats().active,1);c.dispose();c.dispose();assert.equal(c.stats().active,0);fx.dispose();
});
test('C05 ordinary armour contact and lethal destruction are distinct, damage remains original formula',()=>{
  const {c,actor,fx,hits,contacts}=combat(),target=api.createActor(api.TANKS[0],0,-30,true);
  target.visual.root.rotation.y=target.yaw;c.fire(actor,[]);for(let i=0;i<20;i++)c.update(1/60,[actor,target],[],1);
  assert.equal(hits.length,1);assert.equal(contacts.length,1);assert.equal(contacts[0][0].destroyed,false);
  assert.equal(contacts[0][0].kind,'armor');assert.equal(hits[0][0],Math.round(actor.spec.damage*.85*.95*(1.35-target.spec.armor/200)*1.9));
  target.hp=1;actor.cooldown=0;c.fire(actor,[]);for(let i=0;i<20;i++)c.update(1/60,[actor,target],[],1);
  assert.equal(contacts[1][0].destroyed,true);assert.equal(target.alive,false);c.dispose();fx.dispose();
});
test('C06 pause freezes all effects and restart clears old anchors, projectiles and recoil',()=>{
  const scene=new api.Scene(),game=new api.Game(scene,{group:new api.Group(),obstacles:[],size:460},{shot(){},hit(){},finish(){},notify(){}});
  assert.equal(typeof game.effectStats,'function');game.start('drive',0);game.update(1/60,{...rest,fire:true});game.pause();
  const before=game.effectStats();for(let i=0;i<100;i++)game.update(.1,rest);assert.deepEqual(game.effectStats(),before);
  game.start('drive',0);assert.equal(game.effectStats().active,0);assert.equal(game.player.visual.recoil,0);game.dispose();
});
test('A01 calibre and material sound profiles are distinct and finite',()=>{
  const cannon=requireFunction('cannonSound'),impact=requireFunction('impactSound');
  assert.ok(cannon(152).frequency<cannon(105).frequency);assert.ok(cannon(152).duration>cannon(105).duration);
  assert.notEqual(impact('armor',false).frequency,impact('road',false).frequency);
  assert.notEqual(impact('track',false).cutoff,impact('building',false).cutoff);
  for(const kind of ['armor','track','building','road','metal'])for(const value of Object.values(impact(kind,false)))assert.ok(Number.isFinite(value));
});
test('P07 road mark sits on the asphalt rather than at projectile centre height',()=>{
  const fx=effects();fx.impact(v(0,.2,0),v(0,1,0),v(0,-1,0),'road',120);
  const mark=fx.marks.slots.find(p=>p.life>0);assert.ok(mark.position.y>=.02&&mark.position.y<=.05);fx.dispose();
});
test('P08 low quality submits only its point and instance limits',()=>{
  const fx=effects();fx.configure({quality:'low',mobile:false,reducedMotion:false,lowFlash:false});
  fx.muzzle(v(),v(0,0,-1),120);fx.update(.08);
  assert.equal(fx.flash.object.count,fx.stats().capacity.flash);
  assert.equal(fx.smoke.object.geometry.drawRange.count,fx.stats().capacity.smoke);fx.dispose();
});
test('P09 muzzle axes, delayed smoke and side jets follow an elevated sideways gun',()=>{
  const fx=effects(),direction=v(-1,.2,0).normalize();fx.muzzle(v(3,2,8),direction,152,true);
  const flames=fx.flash.slots.filter(p=>p.life>0),smoke=fx.smoke.slots.filter(p=>p.life>0);
  assert.ok(flames[0].normal.dot(direction)>.999);assert.ok(flames[0].scale.z>flames[0].scale.x*2);
  assert.ok(flames[2].normal.dot(flames[3].normal)<-.99);
  assert.ok(smoke.every(p=>p.delay>=.035 && p.velocity.dot(direction)>1));fx.dispose();
});
test('P10 distinct contact materials produce different spark to dust proportions',()=>{
  const fx=effects(),counts={};
  for(const kind of ['armor','track','road','building']){fx.clear();fx.impact(v(0,2,0),v(0,0,1),v(0,0,-1),kind,120);counts[kind]=fx.stats();}
  assert.ok(counts.armor.sparks>counts.building.sparks);assert.ok(counts.building.smoke>counts.armor.smoke);
  assert.ok(counts.track.debris>counts.armor.debris);fx.dispose();
});
test('P11 emitted sparks stay in the surface outward hemisphere',()=>{
  const fx=effects();fx.impact(v(),v(1,0,0),v(-.05,0,-1),'armor',120);
  assert.ok(fx.sparks.slots.filter(p=>p.life>0).every(p=>p.velocity.x>=0));fx.dispose();
});
test('P12 distance reduces emissions and removes distant detailed debris',()=>{
  const fx=effects();fx.impact(v(0,2,-10),v(0,0,1),v(0,0,-1),'building',120);const near=fx.stats();fx.clear();
  fx.impact(v(0,2,-190),v(0,0,1),v(0,0,-1),'building',120);const far=fx.stats();
  assert.ok(far.smoke<near.smoke);assert.equal(far.debris,0);fx.clear();fx.destroy(v(0,2,-400),120);assert.equal(fx.stats().active,0);fx.dispose();
});
test('P13 track damage suppresses one side dust and speed changes scale',()=>{
  const fx=effects();fx.dust(v(),0,20,false,true);assert.equal(fx.stats().dust,1);const fast=fx.dustPool.slots.find(p=>p.life>0);
  assert.ok(fast.position.x>0);const size=fast.size;fx.clear();fx.dust(v(),0,4);assert.ok(fx.dustPool.slots[0].size<size);fx.dispose();
});
test('P14 independently aged particles grow, fade and cool with depth-tested materials',()=>{
  const fx=effects();fx.damage(v(0,2,0),.2);fx.update(.2);
  const p=fx.smoke.slots.find(p=>p.life>0),index=fx.smoke.slots.indexOf(p),g=fx.smoke.object.geometry;
  const young={size:g.getAttribute('diameter').getX(index),alpha:g.getAttribute('alpha').getX(index),r:g.getAttribute('tint').getX(index)};
  fx.update(1.8);assert.ok(g.getAttribute('diameter').getX(index)>young.size);assert.ok(g.getAttribute('alpha').getX(index)<young.alpha);assert.ok(g.getAttribute('tint').getX(index)>young.r);
  for(const pool of fx.pools){assert.equal(pool.object.material.depthTest,true);assert.equal(pool.object.material.depthWrite,false);assert.equal(pool.object.castShadow,false);}fx.dispose();
});
test('P15 reset reproduces procedural emissions without affecting global random',()=>{
  const fx=effects(),sample=()=>{fx.muzzle(v(),v(0,0,-1),120);fx.impact(v(),v(0,1,0),v(0,-1,0),'road',120);return fx.smoke.slots.map(p=>[p.life,p.delay,...p.velocity.toArray()]);};
  const first=sample();fx.clear();assert.deepEqual(sample(),first);fx.dispose();
});
test('M12 recoil sampling at 30, 60 and 144 Hz has the same absolute pose',()=>{
  const poses=[];for(const hz of [30,60,144]){const a=api.createActor(api.TANKS[0],0,0);api.kickTank(a.visual,120,60,.7);for(let i=0;i<hz/2;i++)api.updateTankMotion(a.visual,1/hz,.2,0,false);poses.push(a.visual.barrel.position.clone());api.disposeTank(a.visual);}
  assert.ok(poses[0].distanceTo(poses[1])<1e-8&&poses[0].distanceTo(poses[2])<1e-8);
});
test('C07 pooled bodies and bounded tracers align to the shell current velocity',()=>{
  const {c,actor,fx}=combat();actor.pitch=.3;actor.aim=.8;c.fire(actor,[]);c.update(1/60,[actor],[],1);
  const shell=c.shells.find(s=>s.source),matrix=new api.Matrix4();c.bodies.getMatrixAt(0,matrix);
  const axis=v(0,0,1).transformDirection(matrix);assert.ok(axis.dot(shell.velocity.clone().normalize())>.999);
  c.tracers.getMatrixAt(0,matrix);const size=new api.Vector3().setFromMatrixScale(matrix);assert.ok(size.z*2<=4);c.dispose();fx.dispose();
});
test('C08 touch fallback changes live limits without resetting the game',()=>{
  const game=new api.Game(new api.Scene(),{group:new api.Group(),obstacles:[],size:460},{shot(){},hit(){},finish(){},notify(){}});
  assert.equal(typeof game.touchEffects,'function');game.configureEffects({quality:'high',mobile:false,reducedMotion:false,lowFlash:false});game.start('drive',0);game.update(.1,rest);const elapsed=game.elapsed;
  game.touchEffects(true);assert.equal(game.effectStats().capacity.smoke,48);assert.equal(game.elapsed,elapsed);game.dispose();
});
test('M13 muzzle direction follows nonuniform family transforms independently of physics aim',()=>{
  const direction=requireFunction('muzzleDirection');
  for(const spec of api.TANKS){const a=api.createActor(spec,2,3);a.visual.root.rotation.y=.7;a.visual.turret.rotation.y=1.1;a.visual.barrel.rotation.x=.3;a.visual.root.updateMatrixWorld(true);
    const tip=a.visual.barrel.localToWorld(v(0,0,-3.745)),back=a.visual.barrel.localToWorld(v(0,0,-2.745));
    assert.ok(direction(a.visual,v()).dot(tip.sub(back).normalize())>.999999);api.disposeTank(a.visual);}
});
test('P16 spark streaks turn with their falling velocity',()=>{
  const fx=effects();fx.impact(v(0,4,0),v(0,0,1),v(0,0,-1),'armor',120);fx.update(.15);
  for(const p of fx.sparks.slots.filter(p=>p.life>0))assert.ok(p.normal.dot(p.velocity.clone().normalize())>.9999);fx.dispose();
});
test('P17 a larger calibre has a longer bounded muzzle pulse',()=>{
  const fx=effects();fx.muzzle(v(),v(0,0,-1),105);const small=fx.flash.slots[0].life;fx.clear();fx.muzzle(v(),v(0,0,-1),152);
  assert.ok(fx.flash.slots[0].life>small&&fx.flash.slots[0].life<.15);fx.dispose();
});
test('A02 UI hit notification does not duplicate the spatial contact sound',()=>{
  let localHits=0;globalThis.document={getElementById:()=>null};
  try{api.Interface.prototype.hit.call({audio:{hit(){localHits++;}},notify(){}},10,false,true);assert.equal(localHits,0);}
  finally{delete globalThis.document;}
});
test('A03 inactive audio maintenance has a separate path from explicit cancellation',()=>{
  const audio=new api.GameAudio();assert.equal(typeof audio.idle,'function');audio.idle();assert.equal(audio.stats().cancelled,0);audio.dispose();
});
test('C09 lethal ignition vents above the turret envelope instead of inside opaque armour',()=>{
  const {c,actor,fx}=combat(),target=api.createActor(api.TANKS[0],0,-30,true);target.hp=1;
  c.fire(actor,[]);fx.clear();for(let i=0;i<20&&target.alive;i++){c.update(1/60,[actor,target],[],1);fx.update(1/60);}
  const ignition=fx.flash.slots.filter(p=>p.life>0);assert.equal(ignition.length,5);
  assert.ok(ignition.every(p=>p.position.y>3.12),'ignition centres must clear the turret roof');c.dispose();fx.dispose();
});
test('M14 mass attenuates suspension and acceleration has bounded visual inertia only',()=>{
  const light=api.createActor(api.TANKS[0],0,0),heavy=api.createActor(api.TANKS[0],0,0);
  for(const [a,mass] of [[light,40],[heavy,75]]){api.kickTank(a.visual,120,mass,.8);api.updateTankMotion(a.visual,.04,0,0,false);}
  assert.ok(Math.abs(light.visual.body.rotation.z)>Math.abs(heavy.visual.body.rotation.z));
  for(let i=0;i<60;i++)api.updateTankMotion(heavy.visual,1/60,0,100,false);
  assert.ok(heavy.visual.body.rotation.x<0&&Math.abs(heavy.visual.body.rotation.x)<=.018);
  assert.deepEqual(heavy.visual.root.position.toArray(),[0,0,0]);assert.equal(heavy.speed,0);
  assert.equal(heavy.visual.wheels.parent,heavy.visual.root);api.disposeTank(light.visual);api.disposeTank(heavy.visual);
});
test('P18 trails expire promptly and are omitted on mobile, low quality and distant shots',()=>{
  const fx=effects();fx.configure({quality:'high',mobile:false,reducedMotion:false,lowFlash:false});fx.trail(v(0,2,30),true);
  assert.equal(fx.stats().smoke,1);fx.update(.3);assert.equal(fx.stats().active,0);
  fx.trail(v(0,2,150),true);assert.equal(fx.stats().active,0);
  for(const options of [{quality:'low',mobile:false},{quality:'high',mobile:true}]){
    fx.configure({...options,reducedMotion:false,lowFlash:false});fx.trail(v(0,2,30),true);assert.equal(fx.stats().active,0);
  }fx.dispose();
});
test('P19 firing ground cues are delayed, local and share resources without adding lights',()=>{
  const scene=new api.Scene(),fx=new api.Effects(scene);fx.muzzle(v(2,2.5,4),v(0,0,-1),120,true);
  assert.ok(fx.dustPool.slots.filter(p=>p.life>0).every(p=>p.delay>=.04&&p.position.y<.3));
  const glow=fx.glow.slots.find(p=>p.life>0);assert.ok(glow.position.y<.05&&glow.normal.y===1&&glow.life<=.15);
  assert.equal(scene.children.some(o=>o.isLight),false);
  const a=api.createActor(api.TANKS[0],0,0),b=api.createActor(api.TANKS[1],10,0);
  const first=a.visual.root.getObjectByName('contact-shadow'),second=b.visual.root.getObjectByName('contact-shadow');
  assert.equal(first.geometry,second.geometry);assert.equal(first.material,second.material);assert.equal(first.castShadow,false);
  fx.dispose();api.disposeTank(a.visual);api.disposeTank(b.visual);
});
test('C10 pooled shells preserve newest-first resolution for simultaneous lethal contacts',()=>{
  const {c,fx,contacts}=combat(),first=api.createActor(api.TANKS[0],0,0,true),
    last=api.createActor(api.TANKS.find(t=>t.gun===140),0,0,true),target=api.createActor(api.TANKS[0],0,-30);
  target.hp=1;for(const a of [first,last]){a.aim=0;a.yaw=0;a.cooldown=0;c.fire(a,[]);}
  for(let i=0;i<20;i++)c.update(1/60,[first,last,target],[],1);
  assert.equal(contacts[0][0].destroyed,true);assert.equal(contacts[0][0].calibre,140);c.dispose();fx.dispose();
});
test('V19-01 explosion is a dedicated effect (fire ball pool, smoke column, scorch) and not the old destroy stub',()=>{
  const fx=effects();fx.explosion('vehicle',v(0,1,-12),1.2);const s=fx.stats();
  assert.ok(s.fire>=6&&s.smoke>=12&&s.debris>=12&&s.marks>=1&&s.glow>=1&&s.dust>=12);
  for(const key of ['smoke','sparks','debris','marks','flash','dust','fire','glow'])assert.ok(s[key]<=s.capacity[key],key);
  fx.clear();assert.equal(fx.stats().active,0);fx.dispose();
});
test('V19-02 quality budgets: touch/low unchanged from v1.8, medium/high raised and still monotonic',()=>{
  const b=requireFunction('effectBudget');
  assert.deepEqual([b('low',false).smoke,b('low',false).debris,b('low',false).flash],[48,16,12]);
  assert.ok(b('medium',false).smoke>88&&b('high',false).smoke>b('medium',false).smoke);
  assert.deepEqual(b('high',true),b('low',false));
});
test('V19-03 combat contacts carry a grade without changing the damage formula',()=>{
  const {c,actor,hits,contacts}=combat(),target=api.createActor(api.TANKS[0],0,-30,true);
  target.visual.root.rotation.y=target.yaw;c.fire(actor,[]);for(let i=0;i<20;i++)c.update(1/60,[actor,target],[],1);
  assert.equal(hits[0][0],Math.round(actor.spec.damage*.85*.95*(1.35-target.spec.armor/200)*1.9));
  assert.ok(['penetrate','ricochet','blocked'].includes(contacts[0][0].grade));c.dispose();
});
