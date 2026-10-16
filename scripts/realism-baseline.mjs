import { copyFile, mkdir, writeFile, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const folder = 'docs/evidence/realism';
await mkdir(folder, { recursive: true });
await copyFile('九龍裝甲行動.html', `${folder}/baseline.html`);
const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  import { View } from './src/view'; import { Game } from './src/game';
  import { GameAudio } from './src/audio';
  const view = new View(document.querySelector('canvas'));
  const game = new Game(view.scene, view.world, { shot() {}, hit() {}, finish() {}, notify() {} });
  view.quality('medium'); view.reduceMotion(true); window.qa = { view, game, GameAudio };
` }, bundle: true, format: 'iife', write: false });
const harness = `${folder}/baseline-harness.html`;
await writeFile(harness, `<style>body{margin:0}canvas{display:block}</style><canvas></canvas><script>${bundle.outputFiles[0].text}</script>`);
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page.setDefaultTimeout(120000);
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve(harness)).href);
  await page.evaluate(() => { const { view, game } = window.qa; view.render(game, 2); view.renderer.getContext().finish(); });
  await page.screenshot({ path: `${folder}/before-garage-clean.png` });
  await page.evaluate(() => { const { view, game } = window.qa; game.start('drive', 0); view.render(game, 2); view.renderer.getContext().finish(); });
  await page.screenshot({ path: `${folder}/before-drive-clean.png` });
  const pcm = await page.evaluate(async () => {
    const context = new OfflineAudioContext(2, 48000 * 5, 48000);
    let clock = 0;
    const proxy = new Proxy(context, { get(target, key) { if (key === 'state') return 'running'; if (key === 'currentTime') return clock; const value = Reflect.get(target, key, target); return typeof value === 'function' ? value.bind(target) : value; } });
    window.AudioContext = function() { return proxy; };
    const audio = new window.qa.GameAudio(); audio.setMusicVolume(0); audio.setMix(1, 0, 0); audio.setVolume(.7); audio.unlock(); audio.engine(0);
    clock = .5; audio.fire({ x: 0, z: 0 }, 120, true); clock = 3; audio.stop();
    const rendered = await context.startRendering(), samples = new Int16Array(rendered.length * 2);
    for (let index = 0; index < rendered.length; index++) for (let channel = 0; channel < 2; channel++) samples[index * 2 + channel] = rendered.getChannelData(channel)[index] * 32767;
    const bytes = new Uint8Array(samples.buffer); let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
    return btoa(binary);
  });
  const data = Buffer.from(pcm, 'base64'), header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(data.length + 36, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22); header.writeUInt32LE(48000, 24); header.writeUInt32LE(192000, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(data.length, 40);
  await writeFile(`${folder}/before-cannon.wav`, Buffer.concat([header, data]));
  await page.goto(pathToFileURL(resolve(folder, 'baseline.html')).href);
  await page.waitForSelector('[data-action="start"]');
  await page.screenshot({ path: `${folder}/before-garage.png` });
  await writeFile(`${folder}/baseline.json`, JSON.stringify({ browser: browser.version(), resolution: '1440x900', dpr: 1, quality: 'medium', hudHidden: ['before-garage-clean.png', 'before-drive-clean.png'], releaseBytes: (await readFile(`${folder}/baseline.html`)).length }, null, 2));
} finally { await browser.close(); }
