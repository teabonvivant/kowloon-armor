import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const label = process.argv[2] ?? 'current';
assert.match(label, /^[a-z0-9-]+$/);
const evidence = '.omo/evidence';
await mkdir(evidence, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ['--enable-unsafe-swiftshader', '--disable-gpu-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, reducedMotion: 'reduce' });
page.setDefaultTimeout(120000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.addInitScript(() => {
  const gl = WebGL2RenderingContext.prototype;
  window.renderStats = { calls: 0, triangles: 0 };
  for (const method of ['drawElements', 'drawElementsInstanced', 'drawArrays', 'drawArraysInstanced']) {
    const original = gl[method];
    gl[method] = function (...args) {
      const count = method.startsWith('drawElements') ? args[1] : args[2];
      const instances = method.endsWith('Instanced') ? args[method.startsWith('drawElements') ? 4 : 3] : 1;
      window.renderStats.calls++;
      if (args[0] === this.TRIANGLES) window.renderStats.triangles += count * instances / 3;
      return original.apply(this, args);
    };
  }
});
try {
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(resolve('九龍裝甲行動.html')).href, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('.garage', { state: 'attached' });
  const gpu = await page.evaluate(() => {
    const gl = document.querySelector('#world').getContext('webgl2');
    const debug = gl.getExtension('WEBGL_debug_renderer_info');
    return debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
  });
  const samples = [];
  for (const quality of ['medium', 'low']) {
    await page.locator('#app [data-action="settings"]').click({ force: true });
    await page.locator('#quality').selectOption(quality);
    await page.locator('#modal [data-action="close"]').click({ force: true });
    for (const surface of ['garage', 'drive']) {
      if (surface === 'drive') {
        await page.locator('[data-mode="drive"]').click({ force: true });
        await page.locator('[data-action="start"]').click({ force: true });
      }
      await page.waitForTimeout(1500);
      const metrics = await page.evaluate(() => new Promise(resolve => {
        const frames = [], submissions = [];
        let previous = performance.now();
        function sample(now) {
          frames.push(now - previous); previous = now;
          submissions.push({ ...window.renderStats });
          window.renderStats.calls = 0; window.renderStats.triangles = 0;
          if (frames.length <= 12) requestAnimationFrame(sample);
          else {
            frames.shift(); submissions.shift(); frames.sort((left, right) => left - right);
            resolve({ frames: frames.length, medianMs: frames[Math.floor(frames.length * .5)], p95Ms: frames[Math.floor(frames.length * .95)],
              meanCalls: submissions.reduce((sum, item) => sum + item.calls, 0) / submissions.length,
              meanTriangles: submissions.reduce((sum, item) => sum + item.triangles, 0) / submissions.length });
          }
        }
        requestAnimationFrame(sample);
      }));
      samples.push({ quality, surface, ...metrics });
      console.log(JSON.stringify({ quality, surface, ...metrics }));
      await page.screenshot({ path: `${evidence}/${label}-${quality}-${surface}.png` });
      if (surface === 'drive') {
        await page.keyboard.press('Escape');
        await page.locator('#modal [data-action="return"]').click({ force: true });
      }
    }
  }
  assert.deepEqual(errors, []);
  const artifactSha256 = createHash('sha256').update(await readFile('九龍裝甲行動.html')).digest('hex');
  const report = { label, timestamp: new Date().toISOString(), artifactSha256, browser: browser.version(), gpu, viewport: [1280, 800], dpr: 1, samples,
    note: 'Headless Chromium, software rendering where reported. Includes WebGL shadow submissions. Frame times are environment specific, not a hardware FPS promise.' };
  await writeFile(`${evidence}/benchmark-${label}.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser.close(); }
