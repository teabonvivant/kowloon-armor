import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export * from './src/persistence.ts';
  export * from './src/preferences.ts';
  export { Game } from './src/game.ts';
  export { View } from './src/view.ts';
  export { Scene, Group } from 'three';
  ${existsSync('src/training.ts') ? "export * from './src/training.ts';" : ''}
` }, bundle: true, format: 'esm', platform: 'node', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const initial = { completed: 2, victories: 5, bestScores: { '1': 2000, 'campaign:2:standard': 3200 } };
const storage = () => {
  const values = new Map();
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  return values;
};
const neutral = { throttle: 0, steer: 0, aimX: 0, aimY: 0, fire: false, brake: false, scope: false, toggleCamera: false, pause: false };
const advance = (game, seconds, input = neutral) => {
  for (let frame = 0; frame < Math.round(seconds * 60); frame++) game.update(1 / 60, input);
};

test('versioned backup round-trips legacy records and merges idempotently without losing better local scores', () => {
  assert.equal(typeof api.exportProgress, 'function');
  const parsed = api.parseProgressBackup(api.exportProgress(initial));
  assert.equal(parsed.ok, true); assert.deepEqual(parsed.progress, initial);
  const incoming = { completed: 1, victories: 3, bestScores: { '1': 4000, 'campaign:2:standard': 1000 } };
  const merged = api.mergeProgress(initial, incoming);
  assert.equal(merged.completed, 2); assert.equal(merged.victories, 5);
  assert.equal(merged.bestScores['1'], 4000); assert.equal(merged.bestScores['campaign:2:standard'], 3200);
  assert.deepEqual(api.mergeProgress(merged, incoming), merged);
  assert.equal(initial.bestScores['1'], 2000);
});

test('invalid backups cannot be used as progress: oversized, unrelated, newer, negative, non-finite and hostile keys', () => {
  assert.equal(typeof api.parseProgressBackup, 'function');
  const envelope = JSON.parse(api.exportProgress(initial));
  for (const payload of ['{broken', '{}', 'null', ' '.repeat(70000),
    JSON.stringify({ ...envelope, version: 99 }),
    JSON.stringify({ ...envelope, progress: { ...initial, completed: -1 } }),
    JSON.stringify({ ...envelope, progress: { ...initial, bestScores: { arbitrary: 10 } } }),
    JSON.stringify({ ...envelope, progress: { ...initial, bestScores: { '1': -10 } } }),
    JSON.stringify(envelope).replace('2000', '1e999'),
    JSON.stringify(envelope).replace('"1":2000', '"__proto__":2000'),
  ]) assert.equal(api.parseProgressBackup(payload).ok, false, payload.slice(0, 100));
});

test('a damaged current record recovers the last valid copy and exposes storage failures', () => {
  const values = storage();
  assert.equal(typeof api.readProgress, 'function');
  assert.equal(api.saveProgress(initial), true);
  const newer = { ...initial, completed: 3 };
  assert.equal(api.saveProgress(newer), true);
  values.set('kowloon-armor-progress', '{broken');
  const recovered = api.readProgress();
  assert.equal(recovered.status, 'recovered'); assert.deepEqual(recovered.progress, initial);
  globalThis.localStorage = { getItem() { throw new DOMException('Denied', 'SecurityError'); }, setItem() { throw new DOMException('Full', 'QuotaExceededError'); } };
  assert.equal(api.readProgress().status, 'unavailable'); assert.equal(api.saveProgress(newer), false);
  delete globalThis.localStorage;
});

test('save merges newer records from another tab and never writes malformed values', () => {
  const values = storage();
  values.set('kowloon-armor-progress', JSON.stringify({ ...initial, completed: 4, victories: 8 }));
  assert.equal(api.saveProgress(initial), true);
  assert.equal(api.loadProgress().completed, 4); assert.equal(api.loadProgress().victories, 8);
  const before = values.get('kowloon-armor-progress');
  assert.equal(api.saveProgress({ ...initial, completed: 90 }), false);
  assert.equal(values.get('kowloon-armor-progress'), before);
  delete globalThis.localStorage;
});

test('deployment choice validates per field and legacy preferences retain defaults', () => {
  const values = storage();
  values.set('kowloon-armor-settings', JSON.stringify({ quality: 'low', tankId: 'not-a-tank', mode: 'network', missionIndex: 90 }));
  const preferences = api.loadPreferences();
  assert.equal(preferences.quality, 'low'); assert.equal(preferences.mode, 'campaign'); assert.equal(preferences.missionIndex, 0);
  assert.equal(typeof preferences.tankId, 'string');
  delete globalThis.localStorage;
});

test('optional training requires real driving, a stop, independent aim and a new shot; pause and restart are safe', () => {
  const game = new api.Game(new api.Scene(), { group: new api.Group(), obstacles: [], size: 460 }, { shot() {}, hit() {}, finish() {}, notify() {} });
  assert.equal(typeof game.beginTraining, 'function');
  game.start('drive', 0); assert.equal(game.training, null);
  game.beginTraining();
  advance(game, 1, { ...neutral, fire: true }); assert.equal(game.training.step, 0);
  game.pause(); advance(game, 5, { ...neutral, throttle: 1 }); assert.equal(game.training.distance, 0);
  game.resume(); advance(game, 4, { ...neutral, throttle: 1 }); assert.equal(game.training.step, 1);
  advance(game, 2, { ...neutral, brake: true }); assert.equal(game.training.step, 2);
  advance(game, 1, { ...neutral, aimX: 1, observe: true }); assert.equal(game.training.step, 2);
  advance(game, 1, { ...neutral, steer: 1, brake: true }); assert.equal(game.training.step, 2, 'Hull steering is not independent turret aiming');
  advance(game, 1, { ...neutral, aimX: 1 }); assert.equal(game.training.step, 3);
  advance(game, 6, { ...neutral, fire: true }); assert.equal(game.training.step, 4);
  assert.equal(game.phase, 'playing'); assert.equal(game.enemies.length, 0);
  game.start('drive', 0); assert.equal(game.training, null);
  game.beginTraining(); assert.equal(game.training.step, 0);
  advance(game, 1, { ...neutral, aimX: 1 });
  advance(game, 4, { ...neutral, throttle: 1 });
  advance(game, 2, { ...neutral, brake: true });
  assert.equal(game.training.step, 2, 'Aiming before the step cannot pre-complete it');
  advance(game, 1, { ...neutral, aimX: 1 }); assert.equal(game.training.step, 3);
  game.garage(); assert.equal(game.training, null);
});

test('mobile garage framing stays in document space after selecting a tank below the fold', () => {
  globalThis.innerWidth = 390; globalThis.innerHeight = 844; globalThis.scrollY = 0;
  globalThis.window = globalThis;
  globalThis.document = { querySelector: () => ({ getBoundingClientRect: () => ({ left: 16, top: 60 - globalThis.scrollY, width: 358, height: 250 }) }) };
  try {
    const view = {};
    api.View.prototype.frameGarage.call(view);
    const original = { ...view.garageOffset };
    globalThis.scrollY = 796;
    api.View.prototype.frameGarage.call(view);
    assert.deepEqual(view.garageOffset, original, 'Scrolling cannot change the fixed showroom camera framing');
  } finally {
    delete globalThis.innerWidth; delete globalThis.innerHeight; delete globalThis.scrollY;
    delete globalThis.window; delete globalThis.document;
  }
});
