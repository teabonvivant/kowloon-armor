import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const evidence = '.omo/evidence';
await mkdir(evidence, { recursive: true });
const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  import { Game } from './src/game.ts';
  import { GameAudio } from './src/audio.ts';
  import { Input } from './src/input.ts';
  import { Interface } from './src/interface.ts';
  import { updateHud } from './src/hud.ts';
  import { View } from './src/view.ts';
  localStorage.removeItem('kowloon-armor-progress');
  localStorage.setItem('kowloon-armor-settings', JSON.stringify({ quality: 'low', volume: 0,
    sensitivity: 1, invertY: false, reducedMotion: true, difficulty: 'veteran' }));
  const canvas = document.querySelector('#world');
  const view = new View(canvas), audio = new GameAudio(), input = new Input(canvas);
  const game = new Game(view.scene, view.world, { shot() {}, hit() {},
    finish: victory => ui.finish(victory), notify: message => ui.notify(message) });
  const ui = new Interface(game, input, view, audio);
  const neutral = { throttle: 0, steer: 0, aimX: 0, aimY: 0, fire: false,
    brake: false, scope: false, toggleCamera: false, pause: false };
  window.failureHarness = {
    advance() {
      for (let frame = 0; frame < 220 * 60 && game.phase === 'playing'; frame++) game.update(1 / 60, neutral);
      updateHud(game); view.render(game, 1 / 60);
      return this.state();
    },
    state() { return { phase: game.phase, hp: game.player.hp, maxHp: game.player.maxHp,
      elapsed: game.elapsed, shots: game.shots, difficulty: game.difficulty }; }
  };
  document.getElementById('boot').remove();
  view.render(game, 1 / 60);
` }, bundle: true, format: 'iife', write: false });
const css = (await Promise.all(['src/style.css', 'src/hud.css'].map(file => readFile(file, 'utf8')))).join('\n');
const template = await readFile('index.html', 'utf8');
const html = template.replace('<link rel="stylesheet" href="/src/style.css">', '')
  .replace('<link rel="stylesheet" href="/src/hud.css">', '')
  .replace('</head>', `<style>${css}</style></head>`)
  .replace('<script type="module" src="/src/main.ts"></script>', () => `<script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
await writeFile(`${evidence}/defeat-harness.html`, html);
const browser = await chromium.launch({ args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, reducedMotion: 'reduce' });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve(`${evidence}/defeat-harness.html`)).href, { waitUntil: 'domcontentloaded' });
  await page.locator('[data-action="start"]').click({ force: true });
  const defeated = await page.evaluate(() => window.failureHarness.advance());
  assert.equal(defeated.phase, 'defeat');
  assert.equal(defeated.hp, 0);
  assert.equal(defeated.shots, 0);
  assert.equal(await page.locator('#modal-title').textContent(), '演習結束');
  await page.screenshot({ path: `${evidence}/release-defeat.png` });
  await page.locator('[data-action="retry"]').click({ force: true });
  const restarted = await page.evaluate(() => window.failureHarness.state());
  assert.equal(restarted.phase, 'playing');
  assert.equal(restarted.hp, restarted.maxHp);
  assert.equal(restarted.elapsed, 0);
  assert.equal(restarted.difficulty, 'veteran');
  assert.equal(await page.locator('#modal').evaluate(modal => modal.open), false);
  assert.deepEqual(errors, []);
  const report = { browser: browser.version(), defeated, restarted, errors,
    method: 'Real Game, city, Interface and View in an isolated browser fixture. Fixed-step physics fast-forwarded without intermediate rendering; no health or outcome overrides. Production offline playthrough is covered separately.' };
  await writeFile(`${evidence}/defeat-check.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
