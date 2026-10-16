import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const folder = process.env.REALISM_EVIDENCE || 'docs/evidence/realism'; await mkdir(folder,{ recursive: true });
const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  import { View } from './src/view'; import { Game } from './src/game'; import { Input } from './src/input';
  import { Interface } from './src/interface'; import { GameAudio } from './src/audio';
  import { updateHud, updateEnemyMarkers } from './src/hud'; import { intercept, launchPose } from './src/ballistics';
  const view = new View(document.querySelector('#world')), input = new Input(view.canvas), audio = new GameAudio();
  const timeline = [];
  const record = (kind,detail = {}) => timeline.push({ time: game.elapsed,kind,listener: { x: game.player.visual.root.position.x,z: game.player.visual.root.position.z,yaw: game.player.aim },interior: game.scope || game.cameraMode !== 'chase',...detail });
  const game = new Game(view.scene, view.world, { shot: () => view.recoil(), hit: (...args) => ui.hit(...args), finish: victory => ui.finish(victory), notify: message => ui.notify(message), cannon: (position,enemy,calibre) => { record('cannon',{ position: { x: position.x,y: position.y,z: position.z },enemy,calibre }); audio.fire(position,calibre,!enemy); }, contact: contact => { record('contact',{ position: { x: contact.position.x,y: contact.position.y,z: contact.position.z },destroyed: contact.destroyed,material: contact.kind,calibre: contact.calibre }); audio.impact(contact.position,contact.destroyed,contact.kind,contact.calibre); }, ready: () => { record('ready'); audio.ready(); } });
  const ui = new Interface(game,input,view,audio); document.querySelector('#boot')?.remove();
  view.quality('medium'); view.reduceMotion(true);
  window.qa = { view,game,input,audio,ui,updateHud,updateEnemyMarkers,intercept,launchPose,GameAudio,timeline,record };
` }, define: { __REALISM_SAMPLE__: 'true' }, bundle: true, format: 'iife', write: false });
const css = (await Promise.all(['src/style.css','src/hud.css','src/mobile.css','src/realism.css'].map(file => readFile(file,'utf8')))).join('\n');
const template = await readFile('index.html','utf8');
const html = template.replace(/<link rel="stylesheet"[^>]+>/g,'').replace('</head>',`<style>${css}</style></head>`).replace('<script type="module" src="/src/main.ts"></script>',() => `<script>${bundle.outputFiles[0].text.replaceAll('</script','<\\/script')}</script>`);
await writeFile(`${folder}/sample-harness.html`,html);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440,height: 900 },deviceScaleFactor: 1 }); page.setDefaultTimeout(120000);
  const errors = []; page.on('pageerror',error => errors.push(error.message)); page.on('console',message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto(pathToFileURL(resolve(folder,'sample-harness.html')).href);
  await page.evaluate(() => { window.qa.view.render(window.qa.game,2); window.qa.view.renderer.getContext().finish(); });
  await page.screenshot({ path: `${folder}/after-garage.png`,timeout: 120000 });
  await page.evaluate(() => { document.querySelector('#app').style.visibility = 'hidden'; document.querySelector('#notice').hidden = true; const { view,game } = window.qa; view.camera.clearViewOffset(); view.frameGarage = () => {}; view.render(game,2); view.renderer.getContext().finish(); });
  await page.screenshot({ path: `${folder}/after-garage-clean.png`,timeout: 120000 });
  await page.evaluate(() => { const { view,game } = window.qa; game.start('drive',0); view.render(game,2); view.renderer.getContext().finish(); });
  await page.screenshot({ path: `${folder}/after-drive-clean.png`,timeout: 120000 });
  const details = await page.evaluate(() => ({ draw: window.qa.view.renderer.info.render,resources: window.qa.view.renderer.info.memory,obstacles: window.qa.view.world.obstacles.length }));
  console.log(JSON.stringify({ errors,...details }));
} finally { await browser.close(); }
