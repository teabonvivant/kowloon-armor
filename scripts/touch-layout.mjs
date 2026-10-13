import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const evidence = '.omo/evidence/touch';
await mkdir(evidence, {recursive:true});
const bundle = await build({stdin:{resolveDir:resolve('.'),contents:`
import { Game } from './src/game';import { GameAudio } from './src/audio';import { Input } from './src/input';import { Interface } from './src/interface';
import { hudMarkup,updateHud } from './src/hud';import { Scene,Group } from 'three';
const canvas=document.getElementById('world');const input=new Input(canvas),audio=new GameAudio();
const game=new Game(new Scene(),{group:new Group(),obstacles:[]},{shot(){},hit(){},finish(){},notify(){}});
const view={canvas,quality(){},reduceMotion(){},lighting(){},adaptive(){},frameGarage(){},rotate(){}};
const ui=new Interface(game,input,view,audio);
window.qa={game,input,ui,render:()=>updateHud(game),scenario(kind){
 game.start(kind==='capture'||kind==='defend'?'campaign':kind==='supply'?'survival':'drive',kind==='capture'?1:3);
 if(kind==='training'||kind==='trained'){game.beginTraining();if(kind==='trained')game.training.step=4;}
 if(kind==='tour'){game.toggleTour();}
 if(kind==='supply')game.intermission=8;
 if(kind==='damage'){game.player.hp=100;game.player.leftTrack=5;}
 document.getElementById('app').innerHTML=hudMarkup(game);document.body.classList.add('in-battle');input.touch.setPlaying(true);updateHud(game);
}};
`},bundle:true,format:'iife',write:false});
const css=(await Promise.all(['src/style.css','src/hud.css','src/mobile.css'].map(file=>readFile(file,'utf8')))).join('\n');
const file=resolve(evidence,'layout-harness.html');
await writeFile(file,`<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>${css}</style><canvas id="world"></canvas><main id="app"></main><dialog id="modal" aria-labelledby="modal-title"></dialog><div id="notice"></div><script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
const browser=await chromium.launch(), checks=[], errors=[];
try{
 const context=await browser.newContext({hasTouch:true,isMobile:true,viewport:{width:390,height:844}});
 const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));
 await page.goto(pathToFileURL(file).href);
 for(const [width,height] of [[320,568],[390,844],[568,320],[844,390],[768,1024],[1024,768],[1366,1024]]){
  await page.setViewportSize({width,height});
  if(await page.locator('#modal').evaluate(modal=>modal.open)) await page.locator('#modal [data-action="close"]').first().click();
  for(const kind of ['drive','training','trained','tour','capture','defend','supply','damage']){
   await page.evaluate(kind=>window.qa.scenario(kind),kind);
   const overlap=await page.evaluate(()=>{
    const visible=element=>element.getBoundingClientRect().width>0&&element.getBoundingClientRect().height>0;
    const rect=element=>{const box=element.getBoundingClientRect();return {left:box.left,right:box.right,top:box.top,bottom:box.bottom};};
    const overlap=(first,second)=>first.left<second.right&&first.right>second.left&&first.top<second.bottom&&first.bottom>second.top;
    const center={left:innerWidth*.43,right:innerWidth*.57,top:innerHeight*.45,bottom:innerHeight*.55};
    const cards=[...document.querySelectorAll('.objective,.training-hud,.tour-panel,.tank-status,.supply-panel,#damage-text.needs-attention')].filter(visible);
    const controls=[...document.querySelectorAll('#touch-controls button,#touch-stick,.compact-map,.hud-tools button')].filter(visible);
    return {overflow:document.documentElement.scrollWidth>innerWidth,
     center:cards.filter(element=>overlap(rect(element),center)).map(element=>element.className),
     cards:cards.flatMap((card,index)=>cards.slice(index+1).filter(other=>!card.contains(other)&&!other.contains(card)&&overlap(rect(card),rect(other))).map(other=>[card.className,other.className])),
     control:cards.flatMap(card=>controls.filter(control=>overlap(rect(card),rect(control))).map(control=>[card.className,control.id||control.className])),
     outside:controls.filter(element=>{const box=rect(element);return box.left<0||box.top<0||box.right>innerWidth+1||box.bottom>innerHeight+1;}).map(element=>element.id)};
   });
   assert.deepEqual(overlap,{overflow:false,center:[],cards:[],control:[],outside:[]},`${width}x${height} ${kind}: ${JSON.stringify(overlap)}`);
   if(kind==='training')assert.match(await page.locator('[data-training-hint="0"]').innerText(),/搖桿/);
   if(kind==='supply')assert.equal(await page.locator('[data-supply="repair"]').isVisible(),true);
  }
  checks.push(`8 HUD states at ${width}x${height}`);
 }
 await page.setViewportSize({width:844,height:390});
 if(await page.locator('#modal').evaluate(modal=>modal.open))await page.locator('#modal [data-action="close"]').first().click();
 await page.evaluate(()=>window.qa.scenario('drive'));
 await page.locator('[data-action="pause"]').click();await page.locator('#modal [data-action="settings"]').click();
 await page.locator('#tab-controls').click();await page.locator('#touchHand').selectOption('left');await page.locator('#touchAutoBrake').uncheck();
 await page.locator('#touchSensitivity').press('End');await page.locator('#controlMode').selectOption('desktop');
 await page.locator('#tab-display').click();await page.locator('#hudDensity').selectOption('full');
 await page.locator('#modal [data-action="close"]').first().click();
 assert.equal(await page.locator('#touch-controls').isVisible(),false);assert.equal(await page.locator('.minimap-wrap').isVisible(),true);
 await page.reload();
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('kowloon-armor-settings')));
 assert.equal(saved.touchHand,'left');assert.equal(saved.touchAutoBrake,false);assert.equal(saved.touchSensitivity,2);assert.equal(saved.hudDensity,'full');assert.equal(saved.controlMode,'desktop');
 checks.push('actual settings controls persist and desktop full HUD remains available');
 await page.locator('[data-action="settings"]').click();await page.locator('#tab-controls').click();await page.locator('#controlMode').selectOption('auto');
 await page.locator('#modal [data-action="close"]').first().click();await page.locator('[data-action="training"]').first().click();
 await page.evaluate(()=>window.qa.render());assert.equal(await page.locator('.minimap-wrap').isVisible(),false);
 assert.match(await page.locator('[data-training-hint="0"]').innerText(),/搖桿/);
 for(let index=0;index<8;index++)await page.evaluate(()=>window.qa.ui.start(true));
 assert.equal(await page.locator('#touch-controls').count(),1);checks.push('touch overrides full HUD, correct training copy and single control root after repeated restarts');
 assert.deepEqual(errors,[]);
 await writeFile(`${evidence}/layout.json`,JSON.stringify({checks,errors},null,2));console.log(JSON.stringify({checks,errors}));
}finally{await browser.close();}
