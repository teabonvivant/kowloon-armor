import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';

const source = '.omo/evidence', destination = 'docs/evidence/tactical';
const reports = ['browser-check', 'defeat-check', 'campaign-check', 'tactical-browser', 'artifact-check', 'benchmark-tactical-baseline', 'benchmark-tactical-final'];
const screenshots = ['release-garage-1440', 'release-garage-390', 'tactical-capture-1440', 'tactical-capture-390',
  'tactical-settings-390', 'tactical-supply-1440', 'tactical-supply-390', 'tactical-combat-measured', 'tactical-hotas-simulated', 'artifact-drive-390', 'artifact-settings-390'];
await mkdir(destination, { recursive: true });
await mkdir('docs/screenshots/tactical', { recursive: true });
const collected = {};
for (const name of reports) {
  const report = JSON.parse(await readFile(`${source}/${name}.json`, 'utf8'));
  if (report.errors) assert.deepEqual(report.errors, []);
  collected[name] = report;
  await copyFile(`${source}/${name}.json`, `${destination}/${name}.json`);
}
const artifact = await readFile('九龍裝甲行動.html');
assert.ok(artifact.equals(await readFile('dist/index.html')));
assert.ok(artifact.length < 1500000);
assert.equal(/window\.(qa|failureHarness)|tactical-harness|pilotInput/.test(artifact.toString()), false);
const artifactSha256 = createHash('sha256').update(artifact).digest('hex');
assert.equal(collected['benchmark-tactical-final'].artifactSha256, artifactSha256);
assert.equal(collected['artifact-check'].artifactSha256, artifactSha256);
assert.equal(collected['browser-check'].checks.length, 20);
assert.ok(collected['campaign-check'].results.every(result => result.phase === 'victory'));
assert.equal(collected['tactical-browser'].stress.fixedSteps, 72000);
assert.equal(collected['tactical-browser'].checks.length, 8);
assert.equal(collected['artifact-check'].checks.length, 3);
assert.equal(collected['artifact-check'].networkRequests.length, 0);
assert.equal(collected['tactical-browser'].networkRequests.length, 0);
const baseline = collected['benchmark-tactical-baseline'].samples;
const comparison = collected['benchmark-tactical-final'].samples.map(sample => {
  const previous = baseline.find(item => item.quality === sample.quality && item.surface === sample.surface);
  const callsChangePercent = (sample.meanCalls / previous.meanCalls - 1) * 100;
  assert.ok(callsChangePercent <= 25, 'Matched-scene submission budget is 25%');
  return { quality: sample.quality, surface: sample.surface, beforeCalls: previous.meanCalls, afterCalls: sample.meanCalls,
    callsChangePercent, beforeTriangles: previous.meanTriangles, afterTriangles: sample.meanTriangles,
    beforeMedianMs: previous.medianMs, afterMedianMs: sample.medianMs };
});
for (const name of screenshots) await copyFile(`${source}/${name}.png`, `docs/screenshots/tactical/${name}.png`);
const manifest = { generatedAt: new Date().toISOString(), artifactBytes: artifact.length, artifactSha256,
  distMatchesOfflineArtifact: true, productionTestHooks: false, offlineBrowserChecks: 20, finalArtifactChecks: 3,
  unitTests: { simulation: 9, upgrade: 10, tactical: 21 }, inputOnlyCampaignVictories: 6, tacticalIntegrationGroups: 8,
  comparison, reports, screenshots,
  limits: ['Linux headless Chromium and SwiftShader only; not Windows hardware FPS.', 'Synthetic HOTAS, not physical hardware.',
    '20 minutes of fixed-step simulation with sparse rendering, not 20 wall-clock minutes of continuous rendering.',
    'Matched baseline/final benchmarks cover garage and free drive. Combat samples are separate and have no matched pre-upgrade combat baseline.',
    'Combat renderTimesMs measure CPU submission and one requestAnimationFrame wait, not GPU completion or continuous combat FPS.',
    'Accelerated stability loop disables audio; it is not an audio-resource stress test.',
    'Heap and renderer counters are bounded observations, not proof of absence of all leaks.', 'No complete model-token usage telemetry available.'] };
await writeFile(`${destination}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
