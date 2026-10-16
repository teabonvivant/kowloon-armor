import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { chromium } from 'playwright';

const folder = 'docs/evidence/realism';
const sampleRate = 48000;
const timelineIndex = process.argv.indexOf('--timeline');
const timelinePath = timelineIndex >= 0 ? process.argv[timelineIndex + 1] : undefined;
const timelineOnly = process.argv.includes('--timeline-only');
if (timelineIndex >= 0 && !timelinePath) throw new Error('--timeline requires a JSON path');
if (timelineOnly && !timelinePath) throw new Error('--timeline-only requires --timeline');
await mkdir(folder, { recursive: true });
const hash = value => createHash('sha256').update(value).digest('hex');
const sourceHashes = Object.fromEntries(await Promise.all(['src/audio.ts', 'src/effect-audio.ts', 'src/spatial-audio.ts', 'src/realism.ts'].map(async path => [path, hash(await readFile(path))])));
const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: "import {GameAudio} from './src/audio'; import {REALISM_SAMPLE} from './src/realism'; window.audioReview={GameAudio,REALISM_SAMPLE};" }, define: { __REALISM_SAMPLE__: 'true' }, bundle: true, format: 'iife', write: false });
const harness = resolve(folder, 'audio-review-harness.html');
await writeFile(harness, `<meta charset="utf-8"><title>Offline audio evidence</title><script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);

function wav(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 4, 28);
  header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const cannon = (time = .5, extra = {}) => ({ time, kind: 'cannon', position: { x: 0, z: 0 }, calibre: 120, enemy: false, ...extra });
const complete = events => [...events, { time: 2, kind: 'checkpoint', label: 'natural-cleanup' }, { time: 3, kind: 'stop' }];
const cases = [
  { name: 'after-exterior', save: true, events: complete([cannon()]) },
  { name: 'after-interior', save: true, interior: true, events: complete([cannon()]) },
  { name: 'nearby', save: true, events: complete([cannon(.5, { position: { x: 20, z: 0 }, enemy: true })]) },
  { name: 'distant', save: true, events: complete([cannon(.5, { position: { x: 120, z: 0 }, enemy: true })]) },
  { name: 'occluded', save: true, obstacles: [{ x: 10, z: 0, halfX: 1, halfZ: 10 }], events: complete([cannon(.5, { position: { x: 20, z: 0 }, enemy: true })]) },
  { name: 'night', night: true, events: complete([cannon()]) },
  { name: 'effects-muted', mix: [0, 0, 0], events: complete([cannon()]) },
  { name: 'master-muted', volume: 0, events: complete([cannon()]) },
  { name: 'engine-alone', mix: [0, 1, 0], speed: 10, events: complete([]) },
  { name: 'effects-muted-engine', mix: [0, 1, 0], speed: 10, events: complete([cannon()]) },
  { name: 'alerts-alone', mix: [0, 0, 1], events: complete([{ time: .5, kind: 'ready' }]) },
  { name: 'effects-muted-alerts', mix: [0, 0, 1], events: complete([cannon(), { time: .5, kind: 'ready' }]) },
  { name: 'alerts-muted', mix: [0, 0, 0], events: complete([{ time: .5, kind: 'ready' }]) },
  { name: 'pause', save: true, windows: { paused: [.85, 2] }, events: complete([cannon(), { time: .56, kind: 'stop' }]) },
  { name: 'pending-cancel', windows: { resumed: [.3, 2] }, events: complete([cannon(.2, { position: { x: 120, z: 0 }, enemy: true }), { time: .21, kind: 'stop' }, { time: .25, kind: 'engine', speed: 0 }]) },
  { name: 'resume-tail', save: true, windows: { resumed: [.72, 2] }, events: complete([cannon(), { time: .56, kind: 'stop' }, { time: .62, kind: 'engine', speed: 0 }]) },
  { name: 'full-mix', save: true, volume: 1, mix: [1, 1, 1], musicVolume: 1, speed: 20, events: complete([
    ...Array.from({ length: 10 }, (_, index) => ({ time: index * .25, kind: 'atmosphere', threat: 1, dt: .25 })),
    { time: .4, kind: 'ready' }, { ...cannon(), repeat: 20 },
  ]) },
  { name: 'voice-lifecycle', save: true, volume: 1, duration: 12, events: [
    { ...cannon(), repeat: 20 }, { time: 1.3, kind: 'checkpoint', label: 'salvo-cleanup' },
    ...Array.from({ length: 8 }, (_, index) => cannon(1.5 + index)),
    { time: 9.5, kind: 'checkpoint', label: 'natural-cleanup' }, { time: 10.5, kind: 'stop' },
  ] },
];

const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
const errors = [];
const failures = [];
const checks = [];
const results = [];
const methodology = {
  renderer: 'Chromium OfflineAudioContext; sample production GameAudio with __REALISM_SAMPLE__=true',
  sampleRate, channels: 2, encoding: '16-bit PCM WAV; floating-point measurements are taken before quantization',
  scheduling: 'Render suspends at the 128-frame quantum immediately before each event. Sources are created only at that event, with exact event time exposed as currentTime. Rendering resumes between events, allowing onended to reclaim voices. No whole-timeline upfront source scheduling.',
  clockAdapter: 'Offline context state is exposed as running while invoking gameplay APIs, as in the real application. All native audio methods remain bound to the actual OfflineAudioContext.',
  controls: 'Comparison: 120 mm, master volume 0.7, effects 1, engine/alerts/music 0; shot at 0.5 seconds, stop at 3 seconds; no normalization or post-processing.',
  randomness: 'Current sample renders seed Math.random=123 for shared procedural buffers; cannon-specific noise uses the production fixed seed. Preserved baseline uses its original capture randomness.',
  limitations: 'Numerical signal and lifecycle evidence only. No human listening, loudness preference, physical speakers/headphones, hardware latency or real-time performance acceptance.',
};

function check(name, passed, actual, expected) {
  checks.push({ name, passed, actual, expected });
  if (!passed) failures.push(name);
}

try {
  const page = await browser.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));
  await page.context().setOffline(true);
  await page.goto(pathToFileURL(harness).href);
  assert.equal(await page.evaluate(() => window.audioReview.REALISM_SAMPLE), true);

  async function render(configuration) {
    const result = await page.evaluate(async configuration => {
      const rate = 48000, duration = configuration.duration ?? 5;
      const context = new OfflineAudioContext(2, Math.ceil(rate * duration), rate);
      let eventTime = null;
      const adapter = new Proxy(context, { get(target, key) {
        if (key === 'state') return 'running';
        if (key === 'currentTime') return eventTime ?? target.currentTime;
        const value = Reflect.get(target, key, target);
        return typeof value === 'function' ? value.bind(target) : value;
      } });
      const originalContext = window.AudioContext, originalRandom = Math.random;
      window.AudioContext = function() { return adapter; };
      let seed = 123;
      Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
      const sound = new window.audioReview.GameAudio();
      const snapshots = [];
      let maximumVoices = 0;
      try {
        sound.setMusicVolume(configuration.musicVolume ?? 0); sound.setVolume(configuration.volume ?? .7); sound.setMix(...(configuration.mix ?? [1, 0, 0]));
        sound.setNightMode(configuration.night ?? false); sound.unlock(); sound.engine(configuration.speed ?? 0);
        sound.listen({ x: 0, z: 0 }, 0, configuration.obstacles ?? []); sound.perspective(configuration.interior ?? false);
        const groups = new Map();
        for (const event of configuration.events) {
          if (!Number.isFinite(event.time) || event.time < 0 || event.time >= duration) throw new Error(`Event outside audio duration: ${JSON.stringify(event)}`);
          const frame = Math.floor(event.time * rate / 128 + 1e-9) * 128;
          if (!groups.has(frame)) groups.set(frame, []);
          groups.get(frame).push(event);
        }
        const ordered = [...groups.entries()].sort((first, second) => first[0] - second[0]);
        let suspension = ordered.length ? context.suspend(ordered[0][0] / rate) : null;
        const completion = context.startRendering();
        for (let groupIndex = 0; groupIndex < ordered.length; groupIndex++) {
          await suspension;
          await new Promise(resolve => setTimeout(resolve, 0));
          for (const event of ordered[groupIndex][1]) {
            eventTime = event.time;
            if (event.listener) sound.listen(event.listener, event.listener.yaw, configuration.obstacles ?? []);
            if (event.interior !== undefined) sound.perspective(event.interior);
            const before = sound.stats();
            for (let repeat = 0; repeat < (event.repeat ?? 1); repeat++) {
              if (event.kind === 'cannon') sound.fire(event.position, event.calibre, !event.enemy);
              else if (event.kind === 'contact') sound.impact(event.position, event.destroyed, event.material, event.calibre);
              else if (event.kind === 'ready') sound.ready();
              else if (event.kind === 'engine') sound.engine(event.speed);
              else if (event.kind === 'atmosphere') sound.atmosphere(event.threat, event.dt);
              else if (event.kind === 'stop') sound.stop();
              else if (event.kind !== 'checkpoint') throw new Error(`Unknown event kind ${event.kind}`);
            }
            const after = sound.stats(); maximumVoices = Math.max(maximumVoices, after.voices);
            snapshots.push({ requestedTime: event.time, renderTime: context.currentTime, kind: event.kind, label: event.label, before, after });
          }
          eventTime = null;
          if (groupIndex + 1 < ordered.length) suspension = context.suspend(ordered[groupIndex + 1][0] / rate);
          await context.resume();
        }
        const rendered = await completion;
        await new Promise(resolve => setTimeout(resolve, 0));
        const natural = sound.stats();
        const left = rendered.getChannelData(0), right = rendered.getChannelData(1);
        const samples = new Int16Array(rendered.length * 2);
        let peak = 0, energy = 0, leftEnergy = 0, rightEnergy = 0, finite = true, clippedSamples = 0, firstAudible = null;
        const windows = Object.fromEntries(Object.entries({ tail: [duration - .5, duration], ...(configuration.windows ?? {}) }).map(([name, range]) => [name, { range, peak: 0, energy: 0, samples: 0 }]));
        for (let index = 0; index < rendered.length; index++) {
          const first = left[index], second = right[index], time = index / rate;
          finite &&= Number.isFinite(first) && Number.isFinite(second);
          const amplitude = Math.max(Math.abs(first), Math.abs(second)); peak = Math.max(peak, amplitude);
          if (amplitude >= 1) clippedSamples++;
          if (amplitude > .00001 && firstAudible === null) firstAudible = time;
          const power = first * first + second * second; energy += power; leftEnergy += first * first; rightEnergy += second * second;
          samples[index * 2] = Math.round(Math.max(-1, Math.min(1, first)) * 32767);
          samples[index * 2 + 1] = Math.round(Math.max(-1, Math.min(1, second)) * 32767);
          for (const window of Object.values(windows)) if (time >= window.range[0] && time < window.range[1]) {
            window.peak = Math.max(window.peak, amplitude); window.energy += power; window.samples += 2;
          }
        }
        for (const window of Object.values(windows)) window.rms = Math.sqrt(window.energy / Math.max(1, window.samples));
        const bytes = new Uint8Array(samples.buffer); let binary = '';
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        sound.dispose();
        return { name: configuration.name, duration, finite, peak, clippedSamples, rms: Math.sqrt(energy / (rendered.length * 2)), leftEnergy, rightEnergy, firstAudible, windows, maximumVoices, snapshots, natural, disposed: sound.stats(), pcm: btoa(binary) };
      } finally {
        sound.dispose(); window.AudioContext = originalContext; Math.random = originalRandom;
      }
    }, configuration);
    const pcm = Buffer.from(result.pcm, 'base64'); delete result.pcm;
    result.configuration = { ...configuration, events: configuration.timeline ? undefined : configuration.events };
    result.pcmSha256 = hash(pcm);
    if (configuration.save) {
      result.file = `${folder}/audio-${configuration.name}.wav`;
      await writeFile(result.file, wav(pcm));
    }
    check(`${result.name}: finite unclipped signal`, result.finite && result.peak < .99 && result.clippedSamples === 0, { finite: result.finite, peak: result.peak, clippedSamples: result.clippedSamples }, 'finite; peak < .99; zero samples >= 1');
    check(`${result.name}: bounded and reclaimed voices`, result.maximumVoices <= 24 && result.natural.voices === 0 && result.disposed.voices === 0 && result.disposed.disposed, { maximum: result.maximumVoices, natural: result.natural, disposed: result.disposed }, 'maximum <= 24; final natural/disposed voices = 0');
    if (!configuration.timeline) check(`${result.name}: quiet final tail`, result.windows.tail.peak < .0001, result.windows.tail.peak, '< .0001');
    results.push(result);
    console.log(JSON.stringify({ case: result.name, peak: result.peak, rms: result.rms, maximumVoices: result.maximumVoices, events: result.natural.events, file: result.file }));
    return { result, pcm };
  }

  if (!timelineOnly) {
    let exteriorPcm;
    for (const configuration of cases) {
      const rendered = await render(configuration);
      if (configuration.name === 'after-exterior') exteriorPcm = rendered.pcm;
    }
    const get = name => results.find(result => result.name === name);
    const exterior = get('after-exterior'), interior = get('after-interior');
    check('sample exterior and interior are audible and different', exterior.rms > .001 && interior.rms > .001 && exterior.pcmSha256 !== interior.pcmSha256, { exterior: exterior.rms, interior: interior.rms }, 'both > .001; different PCM');
    check('distance attenuates and delays cannon', get('distant').rms < get('nearby').rms && get('distant').firstAudible - get('nearby').firstAudible > .28, { nearby: get('nearby').rms, distant: get('distant').rms, delayDifference: get('distant').firstAudible - get('nearby').firstAudible }, 'distant quieter; extra onset delay > .28 s for extra 100 m');
    check('right-side cannon pans right', get('nearby').rightEnergy > get('nearby').leftEnergy * 2, { left: get('nearby').leftEnergy, right: get('nearby').rightEnergy }, 'right energy > 2 × left');
    check('wall occlusion attenuates cannon', get('occluded').rms < get('nearby').rms, { clear: get('nearby').rms, occluded: get('occluded').rms }, 'occluded quieter');
    check('night mode lowers output', get('night').rms < exterior.rms, { normal: exterior.rms, night: get('night').rms }, 'night quieter');
    for (const name of ['effects-muted', 'master-muted', 'alerts-muted', 'pending-cancel']) check(`${name}: silence`, get(name).peak < .0001, get(name).peak, '< .0001');
    for (const [reference, withCannon] of [['engine-alone', 'effects-muted-engine'], ['alerts-alone', 'effects-muted-alerts']]) check(`${withCannon}: independent controls`, get(reference).rms > .0001 && get(reference).pcmSha256 === get(withCannon).pcmSha256, { reference: get(reference).rms, withCannon: get(withCannon).rms, identical: get(reference).pcmSha256 === get(withCannon).pcmSha256 }, 'nonzero engine/alert; muted cannon changes no samples');
    check('pause silence after fade', get('pause').windows.paused.peak < .0001, get('pause').windows.paused, 'peak < .0001 from 0.85 s');
    check('pause/resume does not revive old cannon tail', get('resume-tail').windows.resumed.peak < .0001, get('resume-tail').windows.resumed, 'peak < .0001 from 0.72 s after resume at 0.62 s');
    const lifecycle = get('voice-lifecycle');
    check('voice cap does not drop later separated shots', lifecycle.natural.events === 12 && lifecycle.snapshots.filter(snapshot => snapshot.kind === 'checkpoint').every(snapshot => snapshot.before.voices === 0), { events: lifecycle.natural.events, checkpoints: lifecycle.snapshots.filter(snapshot => snapshot.kind === 'checkpoint') }, '4 accepted simultaneous shots + 8 later shots; natural cleanup between salvos');
    const before = await readFile(`${folder}/before-cannon.wav`);
    assert.equal(before.toString('ascii', 0, 4), 'RIFF'); assert.equal(before.toString('ascii', 36, 40), 'data');
    assert.equal(before.readUInt32LE(24), sampleRate); assert.equal(before.readUInt16LE(22), 2); assert.equal(before.readUInt16LE(34), 16);
    const beforePcm = before.subarray(44), comparison = wav(Buffer.concat([beforePcm, Buffer.alloc(sampleRate * 4), exteriorPcm]));
    let beforePeak = 0, beforeEnergy = 0, beforeSaturated = 0;
    for (let offset = 0; offset < beforePcm.length; offset += 2) {
      const sample = beforePcm.readInt16LE(offset); beforePeak = Math.max(beforePeak, Math.abs(sample) / 32768);
      beforeEnergy += (sample / 32768) ** 2; if (Math.abs(sample) >= 32767) beforeSaturated++;
    }
    check('preserved baseline PCM has no saturated samples', beforeSaturated === 0, { peak: beforePeak, saturatedSamples: beforeSaturated }, 'zero saturated 16-bit PCM samples; original floating-point signal unavailable');
    await writeFile(`${folder}/audio-before-after.wav`, comparison);
    methodology.comparison = { file: 'audio-before-after.wav', baselineFile: 'before-cannon.wav', baselineSha256: hash(before), baselineSeconds: beforePcm.length / (sampleRate * 4), baselinePcmPeak: beforePeak, baselinePcmRms: Math.sqrt(beforeEnergy / (beforePcm.length / 2)), silenceSeconds: 1, afterStartsAt: beforePcm.length / (sampleRate * 4) + 1, labels: 'Preserved v1.8 baseline first, then sample exterior. Equal settings; no loudness matching.' };
  }

  if (timelinePath) {
    const timelineBytes = await readFile(timelinePath), timeline = JSON.parse(timelineBytes);
    assert.ok(Number.isFinite(timeline.duration) && timeline.duration > 0 && Array.isArray(timeline.events));
    const events = timeline.events.filter(event => event.time < timeline.duration);
    const rendered = await render({ name: 'gameplay', save: true, timeline: true, duration: timeline.duration, events, obstacles: timeline.obstacles ?? [], volume: .7, mix: [1, 1, 1] });
    methodology.gameplay = { timeline: timelinePath, timelineSha256: hash(timelineBytes), events: events.length, excludedEventsAtOrAfterEnd: timeline.events.length - events.length, duration: timeline.duration, fps: timeline.fps, frames: timeline.frames, file: rendered.result.file, note: 'Offline replay of captured game event times, listener poses and perspective. Engine/effects/alerts enabled; music disabled. Not live audio capture or real-time performance evidence.' };
  }
  check('no browser errors', errors.length === 0, errors, '[]');
  const report = { createdAt: new Date().toISOString(), browser: browser.version(), passed: failures.length === 0, failures, sourceHashes, methodology, checks, cases: results, errors };
  const reportPath = `${folder}/${timelineOnly ? 'audio-gameplay-review' : 'audio-review'}.json`;
  await writeFile(reportPath, JSON.stringify(report, null, 2));
  await writeFile(`${folder}/${timelineOnly ? 'audio-gameplay-methodology' : 'audio-methodology'}.md`, `# Realism sample audio evidence\n\n${methodology.limitations}\n\nPassed: ${report.passed}. Failed checks: ${failures.join('; ') || 'none'}.\n\n\`\`\`json\n${JSON.stringify(methodology, null, 2)}\n\`\`\`\n`);
  console.log(JSON.stringify({ report: reportPath, passed: report.passed, cases: results.length, checks: checks.length, failures }));
  if (failures.length) process.exitCode = 1;
} finally {
  await browser.close();
}
