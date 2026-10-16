import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

const bundle = await build({ stdin: { resolveDir: resolve('.'), contents: `
  export { createRealismWorld } from './src/render/realism-world';
  export { agedPlaster, streetGlass, distantFacade } from './src/render/realism-materials';
  export { Matrix4, PerspectiveCamera, Raycaster, Vector2, Vector3 } from 'three';
` }, bundle: true, platform: 'node', format: 'esm', write: false });
const api = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
globalThis.document = { createElement: () => ({ getContext: () => null }) };
const world = api.createRealismWorld();

test('distant ground closes the gap beneath peripheral buildings', () => {
  for (const [horizontal,along] of [[0,220],[160,100],[-200,100],[0,-140],[0,400]]) {
    const ray = new api.Raycaster(new api.Vector3(horizontal,20,along),new api.Vector3(0,-1,0));
    const hit = ray.intersectObject(world.group,true)[0];
    assert.ok(hit,`missing distant ground at ${horizontal},${along}`);
    assert.ok(Math.abs(hit.point.y) < .1,'distant ground must join the street elevation');
    assert.equal(hit.object.material.fog,true,'distant ground must blend with scene fog');
  }
});

test('garage rear horizon rays encounter peripheral skyline', () => {
  const camera = new api.PerspectiveCamera(48,1440 / 900,.2,1000);
  camera.position.set(12.09,6.6,88.05); camera.lookAt(-1.2,1.3,100); camera.updateMatrixWorld(true);
  const backdrop = [];
  world.group.traverse(object => { if (object.material === api.distantFacade) backdrop.push(object); });
  for (const horizontal of [-.95,-.8,-.65]) {
    const ray = new api.Raycaster(); ray.setFromCamera(new api.Vector2(horizontal,.9),camera);
    assert.ok(ray.intersectObjects(backdrop).length > 0,`empty rear horizon at screen ${horizontal}`);
  }
});

test('window reflections have no hard repeated skyline steps', () => {
  const { data,width,height } = api.streetGlass.map.image;
  let maximumStep = 0;
  for (let row = 1; row < height; row++) for (let column = 0; column < width; column++) {
    maximumStep = Math.max(maximumStep,Math.abs(data[(row * width + column) * 4] - data[((row - 1) * width + column) * 4]));
  }
  assert.ok(maximumStep <= 3,`reflection jumps ${maximumStep} levels between adjacent texels`);
});

test('street glazing sits inside a real facade recess', () => {
  const facade = world.group.getObjectByName('street-front-0');
  const glazing = facade.children.find(child => child.material === api.streetGlass);
  const matrix = new api.Matrix4(), centre = new api.Vector3();
  for (let instance = 0; instance < glazing.count; instance++) {
    glazing.getMatrixAt(instance,matrix); centre.setFromMatrixPosition(matrix);
    if (centre.y < 4.5) continue;
    const origin = facade.localToWorld(new api.Vector3(centre.x + .25,centre.y + .25,-3));
    const direction = new api.Vector3(0,0,1).transformDirection(facade.matrixWorld);
    const hit = new api.Raycaster(origin,direction).intersectObject(facade,true)[0];
    assert.ok(hit,'window ray must hit the facade');
    const local = facade.worldToLocal(hit.point.clone());
    assert.ok(local.z > .4,`window must sit behind the facade plane, got ${local.z}`);
    return;
  }
  assert.fail('residential glazing missing');
});

test('scene refinement preserves the existing collision footprint', () => {
  assert.equal(world.obstacles.length,15);
  assert.deepEqual(world.obstacles.slice(-2),[
    { x: -8.5,z: 60,halfX: 1.45,halfZ: .5,surface: 'building',height: .94 },
    { x: 8.8,z: 14,halfX: 1.45,halfZ: .5,surface: 'building',height: .94 }
  ]);
  for (const along of [-15,0,25,45,65,85,105,125]) {
    assert.equal(world.obstacles.some(obstacle => Math.abs(obstacle.x) < obstacle.halfX + 2.4 && Math.abs(obstacle.z - along) < obstacle.halfZ + 2.4),false,`main lane blocked at ${along}`);
  }
  assert.equal(world.size,280);
});

test('static world remains batched and repeatable', () => {
  const inspect = group => {
    let meshes = 0,triangles = 0;
    const transforms = [];
    group.traverse(object => {
      assert.equal(object.matrixAutoUpdate,false);
      if (!object.isMesh) return;
      meshes++;
      triangles += (object.geometry.index?.count ?? object.geometry.attributes.position.count) / 3 * (object.count ?? 1);
      if (object.instanceMatrix) transforms.push(Array.from(object.instanceMatrix.array));
    });
    return { meshes,triangles,transforms };
  };
  const first = inspect(world.group), second = inspect(api.createRealismWorld().group);
  assert.ok(first.meshes <= 190,`${first.meshes} scene meshes exceed the batch budget`);
  assert.ok(first.triangles <= 310000,`${first.triangles} scene triangles exceed the geometry budget`);
  assert.deepEqual(second,first);
});
