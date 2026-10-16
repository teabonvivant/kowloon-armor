import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ entryPoints: [resolve('src/camera-framing.ts')],bundle: true,platform: 'node',format: 'esm',write: false });
const { chaseHeight } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('street-height framing preserves the legacy camera outside the sample', () => {
  for (const distance of [12,15,22]) for (const clearance of [0,.3,1]) assert.equal(chaseHeight(distance,clearance,false),8.2);
});
test('sample camera scales with chosen boom length while staying below old overhead framing', () => {
  assert.equal(chaseHeight(15,1,true),6.1);
  assert.ok(chaseHeight(12,1,true) < chaseHeight(22,1,true));
  for (const distance of [12,15,22]) assert.ok(chaseHeight(distance,1,true) >= 5.5 && chaseHeight(distance,1,true) < 8.2);
});
test('near-wall shortening raises the camera continuously to protect turret visibility', () => {
  for (const distance of [12,15,22]) {
    assert.equal(chaseHeight(distance,0,true),8.2);
    let previous = chaseHeight(distance,0,true);
    for (let step = 1; step <= 100; step++) {
      const height = chaseHeight(distance,step / 100,true);
      assert.ok(height <= previous + 1e-10); assert.ok(previous - height < .1); previous = height;
    }
  }
});
