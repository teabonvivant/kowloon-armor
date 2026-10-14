import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const evidence='.omo/evidence/effects';await mkdir(evidence,{recursive:true});
const bundle=await build({stdin:{resolveDir:resolve('.'),contents:"import {GameAudio} from './src/audio';window.GameAudio=GameAudio;"},bundle:true,format:'iife',write:false});
const harness=resolve(evidence,'audio.html');await writeFile(harness,`<script>${bundle.outputFiles[0].text}</script>`);
const browser=await chromium.launch({args:['--autoplay-policy=no-user-gesture-required']});
try {
  const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.context().setOffline(true);await page.goto(pathToFileURL(harness).href);
  const supported=await page.evaluate(()=>typeof new window.GameAudio().stats);
  assert.equal(supported,'function','Audio transient lifecycle must expose bounded diagnostic counts');
  const results=[];
  for(const name of ['105','152','nearby','distant','occluded','armor','track','building','road','night','salvo','full-mix','pause','resume-tail','preview','dispose','muted']) {
    const result=await page.evaluate(async name=>{
      const context=new OfflineAudioContext(2,48000*4,48000);let time=0;
      const proxy=new Proxy(context,{get(target,key){if(key==='state')return 'running';if(key==='currentTime')return time;const val=Reflect.get(target,key,target);return typeof val==='function'?val.bind(target):val;}});
      const original=window.AudioContext;window.AudioContext=function(){return proxy;};
      let seed=123;const random=Math.random;Math.random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
      const sound=new window.GameAudio();sound.setMusicVolume(name==='full-mix'?1:0);sound.setVolume(1);sound.setMix(name==='muted'?0:1,name==='full-mix'?1:0,name==='full-mix'?1:0);sound.setNightMode(name==='night');sound.unlock();sound.engine(name==='full-mix'?20:0);
      if(name==='full-mix')sound.atmosphere(1,.5);
      sound.listen({x:0,z:0},0,name==='occluded'?[{x:10,z:0,halfX:1,halfZ:10}]:[]);
      time=.2;const remote=['nearby','distant','occluded','pause'].includes(name);
      if(['armor','track','building','road'].includes(name))sound.impact({x:20,z:0},false,name,120);
      else for(let i=0;i<(name==='salvo'||name==='full-mix'?40:1);i++)sound.fire(remote?{x:name==='occluded'||name==='nearby'?20:120,z:0}:{x:0,z:0},name==='105'?105:152,!remote);
      const active=sound.stats();
      if(name==='pause'){time=.21;sound.ready();sound.stop();time=.23;sound.engine(0);}
      if(name==='resume-tail'){time=.24;sound.stop();time=.26;sound.engine(0);}
      if(name==='preview'){sound.stop();sound.setMix(0,0,1);sound.ready();sound.idle();}
      if(name==='dispose'){time=.21;sound.dispose();sound.dispose();}
      const stopped=sound.stats();time=2.5;sound.stop();
      Math.random=random;window.AudioContext=original;
      const rendered=await context.startRendering(),left=rendered.getChannelData(0),right=rendered.getChannelData(1);
      let peak=0,energy=0,early=0,tail=0,resumed=0,finite=true,leftEnergy=0,rightEnergy=0;
      for(let i=0;i<left.length;i++){const a=left[i],b=right[i];finite&&=Number.isFinite(a)&&Number.isFinite(b);peak=Math.max(peak,Math.abs(a),Math.abs(b));energy+=a*a+b*b;leftEnergy+=a*a;rightEnergy+=b*b;if(i<.35*48000)early+=a*a+b*b;if(i>.3*48000)resumed=Math.max(resumed,Math.abs(a),Math.abs(b));if(i>3.5*48000)tail=Math.max(tail,Math.abs(a),Math.abs(b));}
      let pcm;
      if(name==='152'||name==='night'){
        const samples=new Int16Array(left.length*2);for(let i=0;i<left.length;i++){samples[i*2]=left[i]*32767;samples[i*2+1]=right[i]*32767;}
        const bytes=new Uint8Array(samples.buffer);let binary='';for(let i=0;i<bytes.length;i+=8192)binary+=String.fromCharCode(...bytes.subarray(i,i+8192));pcm=btoa(binary);
      }
      return {name,active,stopped,peak,rms:Math.sqrt(energy/(left.length*2)),early,tail,resumed,finite,leftEnergy,rightEnergy,pcm};
    },name);
    if(result.pcm){
      const pcm=Buffer.from(result.pcm,'base64');delete result.pcm;const header=Buffer.alloc(44);
      header.write('RIFF');header.writeUInt32LE(pcm.length+36,4);header.write('WAVEfmt ',8);header.writeUInt32LE(16,16);header.writeUInt16LE(1,20);header.writeUInt16LE(2,22);header.writeUInt32LE(48000,24);header.writeUInt32LE(192000,28);header.writeUInt16LE(4,32);header.writeUInt16LE(16,34);header.write('data',36);header.writeUInt32LE(pcm.length,40);
      await mkdir('docs/evidence/effects',{recursive:true});await writeFile(`docs/evidence/effects/cannon-${name}.wav`,Buffer.concat([header,pcm]));
    }
    assert.equal(result.finite,true);assert.ok(result.peak<.99,JSON.stringify(result));assert.ok(result.tail<.0001,JSON.stringify(result));assert.ok(result.active.voices<=24);
    if(name==='pause'||name==='dispose')assert.equal(result.stopped.voices,0);
    if(name==='resume-tail')assert.ok(result.resumed<.0001,JSON.stringify(result));
    if(name==='pause'||name==='muted'||name==='dispose')assert.ok(result.peak<.0001,JSON.stringify(result));
    else assert.ok(result.peak>.001,JSON.stringify(result));
    results.push(result);console.log(JSON.stringify(result));
  }
  const get=name=>results.find(r=>r.name===name);
  assert.ok(get('night').rms<get('152').rms);assert.ok(get('distant').rms<get('152').rms);
  assert.equal(get('distant').early,0);assert.ok(get('occluded').rms<get('nearby').rms);
  assert.ok(get('distant').rightEnergy>get('distant').leftEnergy*2);
  assert.notEqual(get('105').rms,get('152').rms);
  assert.deepEqual(errors,[]);
  await writeFile(`${evidence}/audio.json`,JSON.stringify({sampleRate:48000,channels:2,secondsPerCase:4,cases:results,errors,limitations:'Deterministic OfflineAudioContext numerical rendering; no human listening, physical speakers or headphones.'},null,2));
}finally{await browser.close();}
