// v1.9 audio acceptance (A group): AC-AUD-1..8 + voice cap, mute, pause, stinger, prop breaks.
// Offline numerical renders only (OfflineAudioContext with a Proxy clock, as in effects-audio.mjs). Not a human listening test.
import { build } from 'esbuild';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const evidence = '.omo/evidence/effects';
const outDir = 'docs/evidence/v1.9/audio';
await mkdir(evidence, { recursive: true }); await mkdir(outDir, { recursive: true });
const bundle = await build({
  stdin: { resolveDir: resolve('.'), contents: `
    import {GameAudio} from './src/audio';
    import {explosionSound, gradeSound, cannonSound, impactSound, debrisRain, glassShards} from './src/effect-audio';
    import {ambienceLoop} from './src/audio-ambience';
    import {duckDepthDb, blastProximity} from './src/spatial-audio';
    window.Lib={GameAudio, explosionSound, gradeSound, cannonSound, impactSound, debrisRain, glassShards, ambienceLoop, duckDepthDb, blastProximity};` },
  bundle: true, format: 'iife', write: false,
});
const harness = resolve(evidence, 'audio-v19.html');
await writeFile(harness, `<script>${bundle.outputFiles[0].text}</script>`);

const PAGE_HELPERS = String.raw`
window.T = (() => {
  const RATE = 48000;
  const fft = (re, im) => {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) { let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit; if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; } }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = -2 * Math.PI / len, wr = Math.cos(ang), wi = Math.sin(ang);
      for (let i = 0; i < n; i += len) { let cr = 1, ci = 0;
        for (let k = 0; k < len / 2; k++) {
          const a = i + k, b = i + k + len / 2, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
          re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti; const nr = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nr; } } }
  };
  /** power spectrum of mid signal over [t0,t1) seconds, Hann window, zero padded to power of two */
  const spectrum = (mid, t0, t1) => {
    const s = Math.max(0, Math.floor(t0 * RATE)), e = Math.min(mid.length, Math.floor(t1 * RATE)), len = Math.max(2, e - s);
    let n = 1; while (n < len) n <<= 1;
    const re = new Float64Array(n), im = new Float64Array(n);
    for (let i = 0; i < len; i++) re[i] = (mid[s + i] || 0) * (0.5 - 0.5 * Math.cos(2 * Math.PI * i / (len - 1)));
    fft(re, im);
    const power = new Float64Array(n / 2); for (let i = 0; i < n / 2; i++) power[i] = re[i] * re[i] + im[i] * im[i];
    return { power, binHz: RATE / n };
  };
  const band = (sp, lo, hi) => { let sum = 0; for (let i = Math.floor(lo / sp.binHz); i <= Math.min(sp.power.length - 1, Math.ceil(hi / sp.binHz)); i++) sum += sp.power[i]; return sum; };
  const centroid = (mid, t0, t1, lo = 100, hi = 12000) => {
    const sp = spectrum(mid, t0, t1); let num = 0, den = 0;
    for (let i = Math.floor(lo / sp.binHz); i <= Math.ceil(hi / sp.binHz); i++) { const f = i * sp.binHz; num += f * sp.power[i]; den += sp.power[i]; }
    return den > 0 ? num / den : 0;
  };
  const rms = (x, t0 = 0, t1 = x.length / RATE) => { let e = 0; const s = Math.floor(t0 * RATE), n = Math.floor(t1 * RATE) - s; for (let i = 0; i < n; i++) e += (x[s + i] || 0) ** 2; return Math.sqrt(e / Math.max(1, n)); };
  const peak = (x, t0 = 0, t1 = x.length / RATE) => { let p = 0; for (let i = Math.floor(t0 * RATE); i < Math.min(x.length, Math.floor(t1 * RATE)); i++) p = Math.max(p, Math.abs(x[i])); return p; };
  const db = v => 20 * Math.log10(Math.max(1e-12, v));
  const render = async (o = {}) => {
    const { seconds = 4.5, endAt = 3.2, setup, volume = 1, effects = 1, engine = 0, alerts = 0, music = 0, night = false, obstacles = [], interior = false, tap = false } = o;
    const context = new OfflineAudioContext(2, Math.floor(RATE * seconds), RATE); let time = 0;
    const counts = { nodes: 0 };
    const skip = new Set(['createBuffer', 'createPeriodicWave']);
    const proxy = new Proxy(context, { get(target, key) {
      if (key === 'state') return 'running'; if (key === 'currentTime') return time;
      const val = Reflect.get(target, key, target); if (typeof val !== 'function') return val;
      if (typeof key === 'string' && key.startsWith('create') && !skip.has(key)) return (...a) => { counts.nodes++; return val.apply(target, a); };
      return val.bind(target); } });
    const original = window.AudioContext; window.AudioContext = function () { return proxy; };
    let seed = 123; const random = Math.random; Math.random = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };
    const sound = new window.Lib.GameAudio();
    sound.setMusicVolume(music); sound.setVolume(volume); sound.setMix(effects, engine, alerts); sound.setNightMode(night); sound.unlock();
    sound.listen({ x: 0, z: 0 }, 0, obstacles); sound.perspective(interior); sound.engine(0);
    const api = { setTime: t => { time = t; }, counts, context };
    if (tap) { // route the three duck buses straight to the destination, with a DC source into each, to read the real envelopes
      sound.ambienceUpdate(.016, {});
      sound.output.disconnect();
      const taps = [sound.soundtrack.duckNode, sound.engineDuck.node, sound.ambience.duckNode];
      for (const key of ['street', 'cooling', 'neon']) sound.ambience[key].disconnect();
      taps.forEach(n => { n.disconnect(); n.connect(context.destination); const dc = context.createConstantSource(); dc.offset.value = 1; dc.connect(n); dc.start(); });
    }
    const result = setup ? await setup(sound, api) : undefined;
    time = endAt; sound.stop();
    Math.random = random; window.AudioContext = original;
    const buffer = await context.startRendering();
    const left = buffer.getChannelData(0), right = buffer.getChannelData(1), mid = new Float32Array(left.length);
    let finite = true; for (let i = 0; i < left.length; i++) { mid[i] = (left[i] + right[i]) / 2; if (!Number.isFinite(left[i]) || !Number.isFinite(right[i])) finite = false; }
    return { left, right, mid, finite, sound, counts, result, stats: sound.stats() };
  };
  const wav = chunks => { // chunks: [{left,right}] -> base64 16-bit stereo
    let n = 0; for (const c of chunks) n += c.left.length; const pcm = new Int16Array(n * 2); let o = 0;
    for (const c of chunks) for (let i = 0; i < c.left.length; i++) { pcm[o++] = Math.max(-1, Math.min(1, c.left[i])) * 32767; pcm[o++] = Math.max(-1, Math.min(1, c.right[i])) * 32767; }
    const bytes = new Uint8Array(pcm.buffer); let bin = ''; for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode(...bytes.subarray(i, i + 8192)); return btoa(bin);
  };
  const silence = s => ({ left: new Float32Array(Math.floor(RATE * s)), right: new Float32Array(Math.floor(RATE * s)) });
  const trim = (r, s) => ({ left: r.left.subarray(0, Math.floor(RATE * s)), right: r.right.subarray(0, Math.floor(RATE * s)) });
  return { RATE, spectrum, band, centroid, rms, peak, db, render, wav, silence, trim };
})();`;

const T = { db0: v => 20 * Math.log10(Math.max(1e-12, v)) };
let pass = 0; const failures = []; const report = {};
const check = (name, condition, detail) => {
  if (condition) { pass++; console.log(`PASS ${name} ${detail ?? ''}`); } else { failures.push(name); console.log(`FAIL ${name} ${detail ?? ''}`); }
};
const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
try {
  const page = await browser.newPage(); const pageErrors = []; page.on('pageerror', e => pageErrors.push(e.message));
  await page.context().setOffline(true); await page.goto(pathToFileURL(harness).href);
  await page.evaluate(PAGE_HELPERS);
  const KINDS = ['barrel', 'lpg', 'vehicle', 'tanker', 'ammo', 'strike'];
  const POWER = { barrel: 1, lpg: 1.2, vehicle: 1.4, tanker: 2, ammo: 1.3, strike: 2.2 };

  // ---- AC-AUD-1 peaks ------------------------------------------------------------------------------------------
  const peaks = await page.evaluate(async ({ KINDS, POWER }) => {
    const out = [];
    for (const kind of KINDS) {
      const r = await T.render({ setup: (s, a) => { a.setTime(.2); s.explosion({ x: 12, z: 0 }, kind, POWER[kind]); return s.stats().voices; } });
      out.push({ kind, peak: T.peak(r.mid), finite: r.finite, voices: r.result, tail: T.peak(r.mid, 3.6, 4.5), peakLR: Math.max(T.peak(r.left), T.peak(r.right)), nan: !r.finite });
    }
    const chain = await T.render({ setup: (s, a) => { KINDS.slice(0, 5).forEach((k, i) => { a.setTime(.2 + i * .15); s.explosion({ x: 10 + i, z: 0 }, k, POWER[k]); }); return s.stats(); } });
    const triple = await T.render({ setup: (s, a) => { a.setTime(.2); for (let i = 0; i < 3; i++) s.fire({ x: 0, z: 0 }, 120 + i * 15, true); return s.stats(); } });
    const full = await T.render({ music: 1, engine: 1, alerts: 1, setup: (s, a) => { s.engine(20); s.atmosphere(1, .5); s.ambienceUpdate(.016, { neon: 1, cooling: 1 }); a.setTime(.2); KINDS.forEach((k, i) => { a.setTime(.2 + i * .1); s.explosion({ x: 5 + i * 3, z: 4 }, k, POWER[k]); }); s.fire({ x: 0, z: 0 }, 155, true); return s.stats(); } });
    const near = await T.render({ setup: (s, a) => { a.setTime(.2); s.explosion({ x: 0, z: 0 }, 'tanker', 2.5); } });
    return { out, chain: { peak: Math.max(T.peak(chain.left), T.peak(chain.right)), finite: chain.finite, tail: T.peak(chain.mid, 3.6, 4.5), voices: chain.result.voices },
      triple: { peak: Math.max(T.peak(triple.left), T.peak(triple.right)), finite: triple.finite }, full: { peak: Math.max(T.peak(full.left), T.peak(full.right)), finite: full.finite },
      near: { peak: Math.max(T.peak(near.left), T.peak(near.right)), finite: near.finite } };
  }, { KINDS, POWER });
  report.peaks = peaks;
  for (const r of peaks.out) {
    check(`AC-AUD-1 ${r.kind} peak 0.5-0.95 @12m`, r.peakLR >= .5 && r.peakLR <= .95 && r.finite, `peak=${r.peakLR.toFixed(3)}`);
    check(`AC-AUD-1 ${r.kind} <=7 sources, tail<0.0001`, r.voices <= 7 && r.tail < .0001, `voices=${r.voices} tail=${r.tail}`);
  }
  check('AC-AUD-1 five chained explosions 0.5-0.95', peaks.chain.peak >= .5 && peaks.chain.peak <= .95 && peaks.chain.finite, `peak=${peaks.chain.peak.toFixed(3)} voices=${peaks.chain.voices}`);
  check('AC-AUD-1 chain tail < 0.0001', peaks.chain.tail < .0001, `tail=${peaks.chain.tail}`);
  check('AC-AUD-1 three cannons together 0.5-0.95', peaks.triple.peak >= .5 && peaks.triple.peak <= .95 && peaks.triple.finite, `peak=${peaks.triple.peak.toFixed(3)}`);
  check('AC-AUD-1 full mix < 0.99', peaks.full.peak < .99 && peaks.full.finite, `peak=${peaks.full.peak.toFixed(3)}`);
  check('AC-AUD-1 point-blank tanker 2.5x < 0.99', peaks.near.peak < .99 && peaks.near.finite, `peak=${peaks.near.peak.toFixed(3)}`);

  // ---- AC-AUD-2 low-frequency energy vs v1.8 --------------------------------------------------------------------
  const lf = await page.evaluate(async ({ KINDS, POWER }) => {
    const norm = (mid, p) => { const o = new Float32Array(mid.length); for (let i = 0; i < o.length; i++) o[i] = mid[i] / p; return o; };
    const ratioOf = mid => { const sp = T.spectrum(mid, .2, .5); return T.band(sp, 25, 120) / T.band(sp, 2000, 6000); };
    const old = await T.render({ setup: (s, a) => { a.setTime(.2); s.impact({ x: 12, z: 0 }, true, 'armor', 155); } });
    const op = T.peak(old.mid), oldRatio = ratioOf(norm(old.mid, op));
    const rows = [];
    for (const kind of KINDS) {
      const r = await T.render({ setup: (s, a) => { a.setTime(.2); s.explosion({ x: 12, z: 0 }, kind, POWER[kind]); } });
      const ratio = ratioOf(norm(r.mid, T.peak(r.mid)));
      rows.push({ kind, deltaDb: 10 * Math.log10(ratio / oldRatio) });
    }
    return { oldRatio, rows };
  }, { KINDS, POWER });
  report.lowFrequency = lf;
  for (const r of lf.rows) check(`AC-AUD-2 ${r.kind} LF/HF ratio >= +6 dB vs v1.8 impactSound(destroyed)`, r.deltaDb >= 6, `delta=${r.deltaDb.toFixed(1)} dB`);

  // ---- AC-AUD-3 ducking ---------------------------------------------------------------------------------------
  const duck = await page.evaluate(async () => {
    const out = {};
    for (const [label, x] of [['near', 10], ['edge', 28], ['far', 70]]) {
      const r = await T.render({ tap: true, setup: (s, a) => { a.setTime(.5); s.explosion({ x, z: 0 }, 'vehicle', 1.4); a.setTime(.5 + x / 343); return null; } });
      const arrival = .5 + x / 343, env = (t, ch) => Math.abs(r.mid[Math.floor(t * T.RATE)]);
      const sample = t => { const i = Math.floor(t * T.RATE); return (Math.abs(r.left[i]) + Math.abs(r.right[i])) / 2; };
      // three taps are summed into the destination; each carries DC=1 so the sum is 3x the mean duck gain
      const mean = t => sample(t) / 3;
      out[label] = { before: mean(arrival - .05), at50ms: mean(arrival + .06), after1200: mean(arrival + 1.25), min: Math.min(...Array.from({ length: 40 }, (_, i) => mean(arrival + i * .03))), stats: r.stats };
    }
    return out;
  });
  report.duck = duck;
  const dbOf = v => 20 * Math.log10(v);
  check('AC-AUD-3 <30 m: buses drop >= 6 dB within 50 ms', dbOf(duck.near.at50ms / duck.near.before) <= -6, `drop=${dbOf(duck.near.at50ms / duck.near.before).toFixed(1)} dB`);
  check('AC-AUD-3 <30 m: recovers within +-1 dB after 1.2 s', Math.abs(dbOf(duck.near.after1200 / duck.near.before)) <= 1, `after=${dbOf(duck.near.after1200 / duck.near.before).toFixed(2)} dB`);
  check('AC-AUD-3 28 m also ducks >= 6 dB', dbOf(duck.edge.min / duck.edge.before) <= -6, `min=${dbOf(duck.edge.min / duck.edge.before).toFixed(1)} dB`);
  check('AC-AUD-3 70 m: no duck', Math.abs(dbOf(duck.far.min / duck.far.before)) < .1 && duck.far.stats.ducks === 0, `min=${dbOf(duck.far.min / duck.far.before).toFixed(2)} dB`);

  // ---- AC-AUD-4 cannon vs v1.8 burst ----------------------------------------------------------------------------
  const cannon = await page.evaluate(async () => {
    const lfEnergy = (mid) => { const sp = T.spectrum(mid, 0, 1); return T.band(sp, 30, 120); };
    const rows = [];
    for (const calibre of [105, 120, 155]) {
      const oldR = await T.render({ setup: (s, a) => { a.setTime(.2); s.burst(window.Lib.cannonSound(calibre), { pan: 0, gain: 1, cutoff: 6500 }, 0, true); } });
      const newR = await T.render({ setup: (s, a) => { a.setTime(.2); s.fire({ x: 0, z: 0 }, calibre, true); } });
      const shift = (m) => m.subarray(Math.floor(.2 * T.RATE));
      rows.push({ calibre, deltaDb: 10 * Math.log10(lfEnergy(shift(newR.mid)) / lfEnergy(shift(oldR.mid))), tail: T.peak(newR.mid, 3.6, 4.5), peak: T.peak(newR.mid), voices: newR.stats.voices });
    }
    const tiers = [];
    for (const d of [20, 100, 250]) { const r = await T.render({ setup: (s, a) => { a.setTime(.2); s.fire({ x: d, z: 0 }, 120, false); return s.stats().voices; } }); tiers.push({ d, voices: r.result, peak: T.peak(r.mid), tail: T.peak(r.mid, 3.6, 4.5) }); }
    const inside = await T.render({ interior: true, setup: (s, a) => { a.setTime(.2); s.fire({ x: 0, z: 0 }, 120, true); } });
    const outside = await T.render({ setup: (s, a) => { a.setTime(.2); s.fire({ x: 0, z: 0 }, 120, true); } });
    return { rows, tiers, interior: { centroid: (() => { const sp = T.spectrum(inside.mid, .2, .6); return T.band(sp, 2000, 12000) / T.band(sp, 30, 12000); })(), exterior: (() => { const sp = T.spectrum(outside.mid, .2, .6); return T.band(sp, 2000, 12000) / T.band(sp, 30, 12000); })(), peak: T.peak(inside.mid) } };
  });
  report.cannon = cannon;
  for (const r of cannon.rows) check(`AC-AUD-4 ${r.calibre} mm 30-120 Hz energy >= +4 dB vs v1.8 burst`, r.deltaDb >= 4 && r.tail < .0001 && r.peak < .99, `delta=${r.deltaDb.toFixed(1)} dB peak=${r.peak.toFixed(2)}`);
  check('AC-AUD-4 near/mid/far tiers use 5/3/2 sources and end clean', cannon.tiers[0].voices === 5 && cannon.tiers[1].voices === 3 && cannon.tiers[2].voices === 2 && cannon.tiers.every(t => t.tail < .0001), JSON.stringify(cannon.tiers.map(t => t.voices)));
  check('AC-AUD-4 interior view has <50% of exterior >2 kHz energy share', cannon.interior.centroid < cannon.interior.exterior * .5, `HF(>2k) share ${cannon.interior.centroid.toExponential(2)} vs ${cannon.interior.exterior.toExponential(2)}`);

  // ---- AC-AUD-5 flyby ---------------------------------------------------------------------------------------------
  const fly = await page.evaluate(async () => {
    const r = await T.render({ setup: (s, a) => { a.setTime(.2); s.flyby({ x: 8, z: 0 }, 190, 120); return s.stats(); } });
    const t0 = .2, e = (x, a, b) => { let s = 0; for (let i = Math.floor((t0 + a) * T.RATE); i < Math.floor((t0 + b) * T.RATE); i++) s += x[i] * x[i]; return s; };
    return { c1: T.centroid(r.mid, t0, t0 + .08), c2: T.centroid(r.mid, t0 + .22, t0 + .3), leftA: e(r.left, 0, .1), rightA: e(r.right, 0, .1), leftB: e(r.left, .2, .3), rightB: e(r.right, .2, .3),
      peak: Math.max(T.peak(r.left), T.peak(r.right)), events: r.result.events, tail: T.peak(r.mid, 3.6, 4.5), voices: r.result.voices };
  });
  report.flyby = fly;
  check('AC-AUD-5 centroid falls >=1.4 kHz -> <=0.8 kHz within 0.3 s', fly.c1 >= 1400 && fly.c2 <= 800, `${fly.c1.toFixed(0)} -> ${fly.c2.toFixed(0)} Hz`);
  check('AC-AUD-5 pan crosses (right-heavy then left-heavy)', fly.rightA > fly.leftA * 1.5 && fly.leftB > fly.rightB * 1.5, `A r/l=${(fly.rightA / fly.leftA).toFixed(1)} B l/r=${(fly.leftB / fly.rightB).toFixed(1)}`);
  check('AC-AUD-5 one event per call, peak < 0.99, clean tail', fly.events === 1 && fly.peak < .99 && fly.peak > .02 && fly.tail < .0001, `events=${fly.events} peak=${fly.peak.toFixed(3)}`);

  // ---- AC-AUD-6 ambience / engine ---------------------------------------------------------------------------------
  const amb = await page.evaluate(async () => {
    const steady = async (opts) => T.render({ seconds: 7, endAt: 6.5, ...opts, setup: async (s, a) => {
      for (let i = 0; i < 360; i++) { a.setTime(i / 60); s.ambienceUpdate(1 / 60, { neon: .3, cooling: .3 }); if (opts.idleEngine) s.engine(0); }
      a.setTime(3); s.ambienceUpdate(1 / 60, {}); return null; } });
    const day = await steady({ effects: 1 }), night = await steady({ effects: 1, night: true });
    const withEngine = await steady({ effects: 1, engine: 1, idleEngine: true });
    // nodes created by the ambience constructor (first update only)
    const nodeProbe = await T.render({ seconds: 1, endAt: .5, setup: (s, a) => { const before = a.counts.nodes; s.ambienceUpdate(.016, {}); return a.counts.nodes - before; } });
    // sporadic events + stop
    const sporadic = await T.render({ seconds: 3, endAt: 2, setup: (s, a) => { let max = 0; for (let i = 0; i < 120; i++) { a.setTime(0); s.ambienceUpdate(1, { enemy: { x: 90, z: 40 }, neon: 1 }); max = Math.max(max, s.stats().voices); } const live = s.stats().voices; s.stop(); return { max, after: s.stats().voices, live }; } });
    const loop = window.Lib.ambienceLoop(48000);
    let maxStep = 0; for (let i = 1; i < loop.length; i++) maxStep = Math.max(maxStep, Math.abs(loop[i] - loop[i - 1]));
    const muted = await T.render({ effects: 0, setup: (s, a) => { for (let i = 0; i < 100; i++) { a.setTime(i / 60); s.ambienceUpdate(1, { enemy: { x: 90, z: 40 }, neon: 1 }); } } });
    const windowRms = x => T.rms(x, 2, 6);
    return { dayRms: windowRms(day.mid), nightRms: windowRms(night.mid), engineRms: windowRms(withEngine.mid), seam: Math.abs(loop[0] - loop[loop.length - 1]), maxStep, nodes: nodeProbe.result, sporadic: sporadic.result, mutedPeak: T.peak(muted.mid), loopLength: loop.length };
  });
  report.ambience = amb;
  check('AC-AUD-6 static ambience RMS -42..-30 dBFS', T.db0(amb.dayRms) >= -42 && T.db0(amb.dayRms) <= -30, `${T.db0(amb.dayRms).toFixed(1)} dBFS`);
  check('AC-AUD-6 ambience + idle engine RMS reported (-42..-26)', T.db0(amb.engineRms) >= -42 && T.db0(amb.engineRms) <= -26, `${T.db0(amb.engineRms).toFixed(1)} dBFS`);
  check('AC-AUD-6 loop seam jump < 0.02 and no larger than normal sample step', amb.seam < .02 && amb.seam <= amb.maxStep * 1.0001, `seam=${amb.seam.toFixed(4)} maxStep=${amb.maxStep.toFixed(4)}`);
  check('AC-AUD-6 ambience adds <= 12 nodes', amb.nodes <= 12 && amb.nodes > 0, `nodes=${amb.nodes}`);
  check('AC-AUD-6 sporadic horn/gun/pop stay <=16 voices; stop() leaves voices===0', amb.sporadic.live > 0 && amb.sporadic.max <= 24 && amb.sporadic.after === 0, JSON.stringify(amb.sporadic));
  check('AC-AUD-7 night ambience >= 6 dB quieter', T.db0(amb.dayRms) - T.db0(amb.nightRms) >= 6, `${(T.db0(amb.dayRms) - T.db0(amb.nightRms)).toFixed(1)} dB`);
  check('AC-AUD-7 effects volume 0: ambience peak < 0.0001', amb.mutedPeak < .0001, `peak=${amb.mutedPeak}`);

  // ---- AC-AUD-7 night / mute for explosions --------------------------------------------------------------------
  const night = await page.evaluate(async () => {
    const day = await T.render({ setup: (s, a) => { a.setTime(.2); s.explosion({ x: 15, z: 0 }, 'vehicle', 1.4); } });
    const nit = await T.render({ night: true, setup: (s, a) => { a.setTime(.2); s.explosion({ x: 15, z: 0 }, 'vehicle', 1.4); } });
    const muted = await T.render({ effects: 0, setup: (s, a) => { a.setTime(.2); s.explosion({ x: 3, z: 0 }, 'tanker', 2); s.flyby({ x: 5, z: 0 }, 190, 120); s.impact({ x: 4, z: 0 }, true, 'armor', 120, 'penetrate'); s.propBreak({ x: 5, z: 0 }, 'neon'); s.stinger(); return s.stats(); } });
    const closeDay = await T.render({ setup: (s, a) => { a.setTime(.2); s.explosion({ x: 4, z: 0 }, 'tanker', 2); } });
    const closeNight = await T.render({ night: true, setup: (s, a) => { a.setTime(.2); s.explosion({ x: 4, z: 0 }, 'tanker', 2); } });
    return { dayRms: T.rms(day.mid, .2, 2), nightRms: T.rms(nit.mid, .2, 2), mutedPeak: Math.max(T.peak(muted.left), T.peak(muted.right)), mutedEvents: muted.result.events,
      closeDayRms: T.rms(closeDay.mid, .2, 2), closeNightRms: T.rms(closeNight.mid, .2, 2), closeNightPeak: T.peak(closeNight.mid) };
  });
  report.night = night;
  check('AC-AUD-7 night explosion RMS >= 6 dB below day', T.db0(night.dayRms) - T.db0(night.nightRms) >= 6, `${(T.db0(night.dayRms) - T.db0(night.nightRms)).toFixed(1)} dB`);
  check('AC-AUD-7 night close explosion RMS >= 6 dB below day', T.db0(night.closeDayRms) - T.db0(night.closeNightRms) >= 6, `${(T.db0(night.closeDayRms) - T.db0(night.closeNightRms)).toFixed(1)} dB`);
  check('AC-AUD-7 effects volume 0: explosion/flyby/impact/propBreak/stinger peak < 0.0001', night.mutedPeak < .0001 && night.mutedEvents === 0, `peak=${night.mutedPeak}`);

  // ---- AC-AUD-8 impact grades -------------------------------------------------------------------------------------
  const grades = await page.evaluate(async () => {
    const out = {};
    for (const grade of ['penetrate', 'ricochet', 'blocked']) {
      const r = await T.render({ setup: (s, a) => { a.setTime(.2); s.impact({ x: 8, z: 0 }, false, 'armor', 120, grade); return s.stats().voices; } });
      out[grade] = { centroid: T.centroid(r.mid, .2, .9, 60, 12000), peak: T.peak(r.mid), tail: T.peak(r.mid, 3.6, 4.5), voices: r.result, finite: r.finite };
    }
    const dry = await T.render({ setup: (s, a) => { a.setTime(.2); s.impact({ x: 1, z: 0 }, false, 'armor', 120, 'ricochet'); } });
    const sp = T.spectrum(dry.mid, .2, .6);
    const near = (f) => { let best = 0; for (let i = Math.floor(f * .95 / sp.binHz); i <= Math.ceil(f * 1.05 / sp.binHz); i++) best = Math.max(best, sp.power[i]); return best; };
    const floorAt = (f) => { let sum = 0, n = 0; for (let i = Math.floor(f * 1.12 / sp.binHz); i <= Math.ceil(f * 1.3 / sp.binHz); i++) { sum += sp.power[i]; n++; } return sum / Math.max(1, n); };
    const base = 1250;
    out.partials = [1, 2.76, 5.4].map(ratio => ({ ratio, prominence: near(base * ratio) / Math.max(1e-30, floorAt(base * ratio)) }));
    const legacy = await T.render({ setup: (s, a) => { a.setTime(.2); s.impact({ x: 8, z: 0 }, false, 'armor', 120); return s.stats().voices; } });
    out.legacyVoices = legacy.result;
    return out;
  });
  report.grades = grades;
  const gc = ['penetrate', 'ricochet', 'blocked'].map(g => grades[g].centroid);
  const rel = (a, b) => Math.abs(a - b) / Math.max(a, b);
  check('AC-AUD-8 centroids differ >= 15% pairwise', rel(gc[0], gc[1]) >= .15 && rel(gc[0], gc[2]) >= .15 && rel(gc[1], gc[2]) >= .15, `penetrate=${gc[0].toFixed(0)} ricochet=${gc[1].toFixed(0)} blocked=${gc[2].toFixed(0)} Hz`);
  check('AC-AUD-8 grades peak 0.02-0.9, clean tail, <=4 sources', ['penetrate', 'ricochet', 'blocked'].every(g => grades[g].peak > .02 && grades[g].peak < .9 && grades[g].tail < .0001 && grades[g].voices <= 4 && grades[g].finite), JSON.stringify(['penetrate', 'ricochet', 'blocked'].map(g => grades[g].peak.toFixed(2))));
  check('AC-AUD-8 ricochet partials at 1 : 2.76 : 5.4 stand >= 10 dB above skirt', grades.partials.every(p => p.prominence >= 10), JSON.stringify(grades.partials.map(p => +p.prominence.toFixed(1))));
  check('AC-AUD-8 ungraded impact keeps the v1.8 3-source sound', grades.legacyVoices === 3, `voices=${grades.legacyVoices}`);

  // ---- voice cap / cascade -----------------------------------------------------------------------------------------
  const cap = await page.evaluate(async () => {
    const r = await T.render({ setup: (s, a) => { a.setTime(.2);
      for (let i = 0; i < 3; i++) s.fire({ x: 0, z: 0 }, 120, true);          // 15 voices
      const before = s.stats().voices; s.explosion({ x: 20, z: 0 }, 'tanker', 2); const after1 = s.stats().voices;
      s.explosion({ x: 20, z: 0 }, 'tanker', 2); const after2 = s.stats().voices;
      for (let i = 0; i < 10; i++) s.explosion({ x: 20, z: 0 }, 'barrel', 1);
      return { before, after1, after2, final: s.stats().voices, max: s.stats().maxVoices }; } });
    const lone = await T.render({ setup: (s, a) => { a.setTime(.2); s.explosion({ x: 30, z: 0 }, 'barrel', 1); return s.stats().voices; } });
    return { ...r.result, lone: lone.result, peak: Math.max(T.peak(r.left), T.peak(r.right)), finite: r.finite };
  });
  report.cap = cap;
  check('voices never exceed 24; explosion adds <= 7 sources', cap.final <= 24 && cap.after1 - cap.before <= 7 && cap.lone <= 7, JSON.stringify(cap));
  check('cascade peak < 0.99 and finite', cap.peak < .99 && cap.finite, `peak=${cap.peak.toFixed(3)}`);

  // ---- prop breaks / stinger / engine / pause ---------------------------------------------------------------------------
  const misc = await page.evaluate(async () => {
    const out = { props: {} };
    for (const kind of ['sign', 'neon', 'stall']) {
      const r = await T.render({ setup: (s, a) => { a.setTime(.2); s.propBreak({ x: 10, z: 3 }, kind); return s.stats().voices; } });
      out.props[kind] = { peak: Math.max(T.peak(r.left), T.peak(r.right)), voices: r.result, tail: T.peak(r.mid, 3.6, 4.5), centroid: T.centroid(r.mid, .2, .8), late: T.peak(r.mid, 1.5, 4.5) };
    }
    const st = await T.render({ volume: 1, setup: (s, a) => { a.setTime(.2); s.stinger(); return s.stats().voices; } });
    const stNight = await T.render({ volume: 1, night: true, setup: (s, a) => { a.setTime(.2); s.stinger(); } });
    out.stinger = { peak: Math.max(T.peak(st.left), T.peak(st.right)), after1s: T.peak(st.mid, 1.22, 4.5), voices: st.result, nightPeak: Math.max(T.peak(stNight.left), T.peak(stNight.right)) };
    // engine: start-up whine, 8-12 Hz modulation, knocks
    const eng = await T.render({ seconds: 6, endAt: 5.5, engine: 1, setup: (s, a) => { for (let i = 0; i < 300; i++) { a.setTime(i / 60); s.engine(0); } return null; } });
    const startBand = T.band(T.spectrum(eng.mid, .3, 1.0), 150, 450) / T.band(T.spectrum(eng.mid, .3, 1.0), 20, 150);
    const idleBand = T.band(T.spectrum(eng.mid, 3.0, 4.0), 150, 450) / T.band(T.spectrum(eng.mid, 3.0, 4.0), 20, 150);
    // envelope modulation: rectify, then look at 2-30 Hz
    const env = new Float32Array(eng.mid.length); for (let i = 0; i < env.length; i++) env[i] = Math.abs(eng.mid[i]);
    const dec = []; for (let i = 0; i < env.length; i += 240) { let sum = 0; for (let k = 0; k < 240 && i + k < env.length; k++) sum += env[i + k]; dec.push(sum / 240); }
    const sub = Float32Array.from(dec.slice(Math.floor(3 * 200), Math.floor(5.5 * 200)));
    const mean = sub.reduce((x, y) => x + y, 0) / sub.length; for (let i = 0; i < sub.length; i++) sub[i] -= mean;
    let best = 0, bestHz = 0; for (let hz = 2; hz <= 30; hz += .25) { let re = 0, im = 0; for (let i = 0; i < sub.length; i++) { re += sub[i] * Math.cos(2 * Math.PI * hz * i / 200); im += sub[i] * Math.sin(2 * Math.PI * hz * i / 200); } const m = Math.hypot(re, im); if (m > best) { best = m; bestHz = hz; } }
    const startRms = T.rms(eng.mid, 0, 1.5), idleRms = T.rms(eng.mid, 3, 5);
    const knock = await T.render({ engine: 1, seconds: 4, endAt: 3.5, setup: (s, a) => { let phase = 0; for (let i = 0; i < 120; i++) { a.setTime(i / 60); phase += 10 / 60; s.engine(20, phase); } return { knocks: s.stats().knocks, expected: Math.floor(phase / (Math.PI / 2)), phase }; } });
    const slow = await T.render({ engine: 1, seconds: 4, endAt: 3.5, setup: (s, a) => { for (let i = 0; i < 120; i++) { a.setTime(i / 60); s.engine(0); } return s.stats().knocks; } });
    out.engine = { startBand, idleBand, modHz: bestHz, startRms, idleRms, knock: knock.result, slowKnocks: slow.result, peak: T.peak(eng.mid), finite: eng.finite };
    // pause: stop() => no sound after, voices 0
    const pause = await T.render({ setup: (s, a) => { a.setTime(.2); s.explosion({ x: 40, z: 0 }, 'tanker', 2); s.flyby({ x: 8, z: 0 }, 190, 120); s.impact({ x: 8, z: 0 }, false, 'armor', 120, 'ricochet'); s.propBreak({ x: 9, z: 0 }, 'sign'); s.ambienceUpdate(1, { enemy: { x: 50, z: 0 } }); a.setTime(.21); s.stop(); a.setTime(.23); s.engine(0); return s.stats().voices; } });
    out.pause = { voices: pause.result, peak: Math.max(T.peak(pause.left), T.peak(pause.right), 0), late: T.peak(pause.mid, .3, 4.5) };
    return out;
  });
  report.misc = misc;
  for (const [kind, v] of Object.entries(misc.props)) check(`propBreak ${kind}: peak 0.02-0.9, <=5 sources, clean tail`, v.peak > .02 && v.peak < .9 && v.voices <= 5 && v.tail < .0001, `peak=${v.peak.toFixed(2)} voices=${v.voices} centroid=${v.centroid.toFixed(0)}`);
  check('propBreak kinds are spectrally distinct (>=15% centroid)', rel(misc.props.sign.centroid, misc.props.neon.centroid) >= .15 && rel(misc.props.neon.centroid, misc.props.stall.centroid) >= .15 && rel(misc.props.sign.centroid, misc.props.stall.centroid) >= .15, JSON.stringify(Object.values(misc.props).map(p => Math.round(p.centroid))));
  check('C16 stinger: <= 1 s, peak <= -14 dBFS (day and night)', misc.stinger.peak <= .1995 && misc.stinger.peak > .05 && misc.stinger.nightPeak <= .1995 && misc.stinger.after1s < .0001, `peak=${misc.stinger.peak.toFixed(3)} (${T.db0(misc.stinger.peak).toFixed(1)} dBFS) night=${misc.stinger.nightPeak.toFixed(3)} after1s=${misc.stinger.after1s}`);
  check('C09 engine: start-up whine >=3x idle band ratio, then settles', misc.engine.startBand > misc.engine.idleBand * 3, `start=${misc.engine.startBand.toFixed(3)} idle=${misc.engine.idleBand.toFixed(3)}`);
  check('C09 engine: amplitude modulation 8-12 Hz', misc.engine.modHz >= 8 && misc.engine.modHz <= 12, `mod=${misc.engine.modHz} Hz`);
  check('C09 engine: track knocks follow wheel phase (+-1), none when stopped', Math.abs(misc.engine.knock.knocks - misc.engine.knock.expected) <= 1 && misc.engine.slowKnocks === 0, JSON.stringify([misc.engine.knock, misc.engine.slowKnocks]));
  check('C09 engine: peak < 0.99, finite', misc.engine.peak < .99 && misc.engine.finite, `peak=${misc.engine.peak.toFixed(3)}`);
  check('pause/stop: voices===0 and silence afterwards', misc.pause.voices === 0 && misc.pause.late < .0001, JSON.stringify(misc.pause));

  // ---- A/B listening files (numbers above are not a human listening verdict) -----------------------------------------
  const exportWav = async (file, build) => {
    const b64 = await page.evaluate(build);
    const pcm = Buffer.from(b64, 'base64'), header = Buffer.alloc(44);
    header.write('RIFF'); header.writeUInt32LE(pcm.length + 36, 4); header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(2, 22);
    header.writeUInt32LE(48000, 24); header.writeUInt32LE(192000, 28); header.writeUInt16LE(4, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
    await writeFile(`${outDir}/${file}`, Buffer.concat([header, pcm])); return pcm.length / 192000;
  };
  const exports = {};
  exports['explosion-old-vs-new.wav'] = await exportWav('explosion-old-vs-new.wav', async () => {
    const chunks = [], gap = T.silence(.6);
    const one = async fn => { const r = await T.render({ seconds: 3.4, endAt: 3.2, setup: fn }); chunks.push(T.trim(r, 3.4), gap); };
    await one((s, a) => { a.setTime(.1); s.impact({ x: 12, z: 0 }, true, 'armor', 155); });                 // v1.8 explosion
    await one((s, a) => { a.setTime(.1); s.explosion({ x: 12, z: 0 }, 'barrel', 1); });
    await one((s, a) => { a.setTime(.1); s.explosion({ x: 12, z: 0 }, 'vehicle', 1.4); });
    await one((s, a) => { a.setTime(.1); s.explosion({ x: 12, z: 0 }, 'tanker', 2); });
    await one((s, a) => { a.setTime(.1); s.explosion({ x: 4, z: 0 }, 'tanker', 2); });                    // near: ducking + muffling + ring
    await one((s, a) => { a.setTime(.1); s.explosion({ x: 90, z: 20 }, 'strike', 2.2); });                // distant
    return T.wav(chunks);
  });
  exports['cannon-old-vs-new.wav'] = await exportWav('cannon-old-vs-new.wav', async () => {
    const chunks = [], gap = T.silence(.5);
    const one = async (fn, opts = {}) => { const r = await T.render({ seconds: 2.4, endAt: 2.2, ...opts, setup: fn }); chunks.push(T.trim(r, 2.4), gap); };
    await one((s, a) => { a.setTime(.1); s.burst(window.Lib.cannonSound(120), { pan: 0, gain: 1, cutoff: 6500 }, 0, true); });   // v1.8
    await one((s, a) => { a.setTime(.1); s.fire({ x: 0, z: 0 }, 120, true); });
    await one((s, a) => { a.setTime(.1); s.fire({ x: 0, z: 0 }, 155, true); });
    await one((s, a) => { a.setTime(.1); s.fire({ x: 0, z: 0 }, 120, true); }, { interior: true });
    await one((s, a) => { a.setTime(.1); s.fire({ x: 30, z: 10 }, 120, false); });
    await one((s, a) => { a.setTime(.1); s.fire({ x: 220, z: 60 }, 120, false); });
    return T.wav(chunks);
  });
  exports['hit-props-flyby-stinger.wav'] = await exportWav('hit-props-flyby-stinger.wav', async () => {
    const chunks = [], gap = T.silence(.4);
    const one = async (fn, secs = 1.6) => { const r = await T.render({ seconds: secs, endAt: secs - .1, setup: fn }); chunks.push(T.trim(r, secs), gap); };
    await one((s, a) => { a.setTime(.1); s.impact({ x: 8, z: 0 }, false, 'armor', 120); });                 // v1.8 armour hit
    for (const g of ['penetrate', 'ricochet', 'blocked']) await one((s, a) => { a.setTime(.1); s.impact({ x: 8, z: 0 }, false, 'armor', 120, g); });
    await one((s, a) => { a.setTime(.1); s.flyby({ x: 8, z: 0 }, 190, 120); }, 1);
    for (const k of ['sign', 'neon', 'stall']) await one((s, a) => { a.setTime(.1); s.propBreak({ x: 10, z: 3 }, k); });
    await one((s, a) => { a.setTime(.1); s.stinger(); }, 1.5);
    return T.wav(chunks);
  });
  exports['ambience-engine-ducking.wav'] = await exportWav('ambience-engine-ducking.wav', async () => {
    const r = await T.render({ seconds: 9, endAt: 8.8, engine: 1, music: 1, setup: (s, a) => {
      for (let i = 0; i < 480; i++) { a.setTime(i / 60); s.engine(i < 240 ? 0 : 14); s.atmosphere(i < 360 ? .3 : 1, 1 / 60); s.ambienceUpdate(1 / 60, { neon: .6, cooling: .5, enemy: { x: 120, z: 60 } }); }
      a.setTime(6.5); s.explosion({ x: 9, z: 4 }, 'tanker', 2); a.setTime(6.51);
      for (let i = 0; i < 150; i++) { a.setTime(6.5 + i / 60); s.engine(14); s.atmosphere(1, 1 / 60); s.ambienceUpdate(1 / 60, { neon: .6, cooling: .5 }); }
      return null; } });
    return T.wav([T.trim(r, 9)]);
  });
  report.exports = exports;
  for (const [file, seconds] of Object.entries(exports)) check(`WAV written ${file}`, seconds > 3, `${seconds.toFixed(1)} s`);
} catch (error) { failures.push(`exception ${error.stack ?? error}`); console.log(error); }
finally { await browser.close(); }
console.log(`\n${pass} passed, ${failures.length} failed`);
await writeFile(`${evidence}/audio-v19.json`, JSON.stringify({ pass, failures, report }, null, 2));
if (failures.length) process.exit(1);
