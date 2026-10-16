import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile,writeFile } from 'node:fs/promises';

const folder = 'docs/evidence/finish-pass';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const artifact = await readFile('九龍裝甲行動-寫實樣板.html');
const artifactSha256 = digest(artifact);
assert.deepEqual(artifact,await readFile('dist/realism.html'));
assert.equal(digest(await readFile('九龍裝甲行動.html')),'25a0c1503e7ce7ac22c7231c0ca6291f0855dc1bf13c468edaafee6aa364f6b9');
const browser = [];
for (const suffix of ['1440','1280','390','844','820','encounter']) {
  const result = JSON.parse(await readFile(`${folder}/browser-${suffix}.json`,'utf8'));
  assert.equal(result.artifactSha256,artifactSha256);
  assert.deepEqual(result.errors,[]); assert.deepEqual(result.requests,[]);
  browser.push(result);
}
assert.equal(browser.flatMap(result => result.layouts).length,5);
assert.equal(browser.flatMap(result => result.checks).length,8);
const visual = [];
for (const suffix of ['camera','muzzle']) {
  const result = JSON.parse(await readFile(`${folder}/visual-details-${suffix}.json`,'utf8'));
  assert.equal(result.passed,true); assert.deepEqual(result.errors,[]);
  for (const file of result.files) assert.equal(digest(await readFile(file.path)),file.sha256);
  visual.push({ part: suffix,passed: result.passed });
}
await writeFile(`${folder}/release.json`,JSON.stringify({ artifactSha256,bytes: artifact.length,formalArtifactUnchanged: true,browserChecks: browser.flatMap(result => result.checks),layouts: browser.flatMap(result => result.layouts),visual,performance: 'Full timing comparison interrupted by SIGTERM under shared-host contention; no performance improvement claim. Browser input batches use a controlled clock; this is not real-device FPS evidence.' },null,2));
console.log(`Verified frozen artifact ${artifactSha256}: 5 layouts, 8 browser checks, camera and muzzle details; formal artifact unchanged.`);
