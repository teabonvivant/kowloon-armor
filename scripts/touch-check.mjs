import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
export { loadPreferences } from './src/preferences';
export * from './src/touch-state';
` }, bundle: true, format: 'esm', platform: 'node', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('touch defaults migrate without erasing keyboard settings', () => {
  globalThis.localStorage = { getItem: () => JSON.stringify({ sensitivity: 1.7, touchSensitivity: 999, touchHand: 'invalid' }) };
  const settings = api.loadPreferences();
  assert.equal(settings.controlMode, 'auto'); assert.equal(settings.touchSensitivity, 1);
  assert.equal(settings.hudDensity, 'compact'); assert.equal(settings.touchHand, 'right');
  assert.equal(settings.sensitivity, 1.7); delete globalThis.localStorage;
});

test('automatic touch detection handles tablets and hybrid input, honors override', () => {
  assert.equal(api.wantsTouch('auto', true, false), true);
  assert.equal(api.wantsTouch('auto', false, true), true);
  assert.equal(api.wantsTouch('auto', false, false), false);
  assert.equal(api.wantsTouch('desktop', true, true), false);
  assert.equal(api.wantsTouch('touch', false, false), true);
});

test('stick uses deadzone, proportional travel, bounded diagonal and reverse', () => {
  assert.deepEqual(api.stickAxes(2, -2, 50), { steer: 0, throttle: 0 });
  const half = api.stickAxes(0, -25, 50); assert.ok(half.throttle > 0 && half.throttle < 1);
  const diagonal = api.stickAxes(100, -100, 50);
  assert.ok(Math.abs(Math.hypot(diagonal.steer, diagonal.throttle) - 1) < .00001);
  assert.equal(api.stickAxes(0, 200, 50).throttle, -1);
});

test('three independent fingers drive, aim and fire without stealing ownership', () => {
  const state = new api.TouchState();
  assert.equal(state.begin(1, 'drive', 0, 0), true);
  assert.equal(state.begin(2, 'drive', 0, 0), false);
  assert.equal(state.begin(2, 'aim', 100, 100), true);
  assert.equal(state.begin(3, 'fire', 0, 0), true);
  state.move(1, 0, -50, 50); state.move(2, 125, 90, 50);
  const frame = state.sample(1, false, 1, true);
  assert.equal(frame.throttle, 1); assert.equal(frame.fire, true);
  assert.ok(frame.pointerX > 0 && frame.pointerY > 0);
  assert.equal(state.sample(1, false, 1, true).pointerX, 0);
  state.end(2); assert.equal(state.sample(1, false, 1, true).fire, true);
  state.end(3); assert.equal(state.sample(1, false, 1, true).fire, false);
});

test('release brakes optionally, reset clears all held and latched controls', () => {
  const state = new api.TouchState(); state.begin(1, 'drive', 0, 0); state.move(1, 0, -50, 50); state.end(1);
  assert.equal(state.sample(1, false, 1, true).brake, true);
  assert.equal(state.sample(1, false, 1, false).brake, false);
  state.scope = true; state.observe = true; state.begin(2, 'fire', 0, 0); state.reset();
  const frame = state.sample(1, false, 1, true);
  assert.equal(frame.fire, false); assert.equal(frame.scope, false); assert.equal(frame.observe, false);
  assert.equal(frame.throttle, 0); assert.equal(frame.brake, false);
});

test('scope, invert and sensitivity apply once and preserve accumulated drags', () => {
  const state = new api.TouchState(); state.scope = true; state.begin(1, 'aim', 0, 0);
  state.move(1, 10, 10, 50); state.move(1, 20, 20, 50);
  const frame = state.sample(2, true, .5, false);
  assert.ok(Math.abs(frame.pointerX - .08) < .000001);
  assert.equal(frame.pointerY, frame.pointerX);
  assert.equal(state.sample(2, true, .5, false).pointerX, 0);
});

test('a quick fire tap survives until the next physics sample, cancellation does not fire', () => {
  const state = new api.TouchState(); state.begin(1, 'fire', 0, 0); state.end(1);
  assert.equal(state.sample(1, false, 1, false).fire, true);
  assert.equal(state.sample(1, false, 1, false).fire, false);
  state.begin(2, 'fire', 0, 0); state.end(2, true);
  assert.equal(state.sample(1, false, 1, false).fire, false);
});
