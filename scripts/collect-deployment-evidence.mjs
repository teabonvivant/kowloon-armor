import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { build } from 'esbuild';

const source = '.omo/evidence', destination = 'docs/evidence/deployment';
const reports = ['deployment-browser', 'browser-check', 'defeat-check', 'campaign-check', 'tactical-browser', 'artifact-check', 'benchmark-deployment-final'];
const screenshots = ['deployment-garage-1440', 'deployment-garage-1280', 'deployment-garage-390', 'deployment-briefing',
  'deployment-records', 'deployment-settings-390', 'deployment-training-complete', 'deployment-training-1280', 'deployment-training-320', 'artifact-garage-reselect-390', 'release-victory', 'release-defeat'];
const artifact = await readFile('九龍裝甲行動.html');
const artifactSha256 = createHash('sha256').update(artifact).digest('hex');
assert.ok(artifact.equals(await readFile('dist/index.html')));
assert.ok(artifact.length < 1500000);
assert.equal(/window\.(qa|failureHarness)|tactical-harness|pilotInput/.test(artifact.toString()), false);
const collected = {};
for (const name of reports) {
  const report = JSON.parse(await readFile(`${source}/${name}.json`, 'utf8'));
  if (report.errors) assert.deepEqual(report.errors, [], name);
  collected[name] = report;
}
const fullBrowserArtifactSha256 = collected['deployment-browser'].sha256;
let finalSourceChange = null;
if (fullBrowserArtifactSha256 !== artifactSha256) {
  const replacement = 'stage.top + window.scrollY + stage.height / 2', original = 'stage.top + stage.height / 2';
  const bundle = await build({ entryPoints: ['src/main.ts'], bundle: true, minify: true,
    format: 'iife', target: ['chrome110', 'edge110'], write: false, legalComments: 'eof',
    plugins: [{ name: 'verify-framing-only-delta', setup(builder) {
      builder.onLoad({ filter: /src\/view\.ts$/ }, async ({ path }) => {
        const contents = await readFile(path, 'utf8');
        assert.ok(contents.includes(replacement));
        return { contents: contents.replace(replacement, original), loader: 'ts' };
      });
    } }] });
  const css = (await Promise.all(['src/style.css', 'src/hud.css', 'src/mobile.css'].map(path => readFile(path, 'utf8')))).join('\n');
  const template = await readFile('index.html', 'utf8');
  const reconstructed = template.replace('<link rel="stylesheet" href="/src/style.css">', '')
    .replace('<link rel="stylesheet" href="/src/hud.css">', '').replace('</head>', `<style>${css}</style></head>`)
    .replace('<script type="module" src="/src/main.ts"></script>', () => `<script>${bundle.outputFiles[0].text.replaceAll('</script', '<\\/script')}</script>`);
  assert.equal(createHash('sha256').update(reconstructed).digest('hex'), fullBrowserArtifactSha256,
    'Release differs from the full-browser build only by the declared camera Y calculation');
  finalSourceChange = { file: 'src/view.ts', original, replacement, reconstructedFullBrowserArtifactMatches: true };
}
assert.equal(collected['artifact-check'].artifactSha256, artifactSha256);
const benchmarkArtifactSha256 = collected['benchmark-deployment-final'].artifactSha256;
assert.ok([artifactSha256, fullBrowserArtifactSha256].includes(benchmarkArtifactSha256));
assert.equal(collected['deployment-browser'].checks.length, 14);
assert.deepEqual(collected['deployment-browser'].network, []);
assert.equal(collected['browser-check'].checks.length, 20);
assert.equal(collected['browser-check'].requests.filter(url => /^https?:/.test(url)).length, 0);
assert.equal(collected['campaign-check'].results.length, 6);
assert.ok(collected['campaign-check'].results.every(result => result.phase === 'victory'));
assert.equal(collected['tactical-browser'].stress.fixedSteps, 72000);
assert.equal(collected['tactical-browser'].checks.length, 8);
assert.deepEqual(collected['tactical-browser'].networkRequests, []);
assert.equal(collected['artifact-check'].checks.length, 4);
assert.deepEqual(collected['artifact-check'].networkRequests, []);
assert.deepEqual(collected['defeat-check'].resultSettingsNavigation,
  { backReachable: true, headerReturnsGarage: true, escapeReturnsGarage: true });
await mkdir(destination, { recursive: true });
await mkdir('docs/screenshots/deployment', { recursive: true });
for (const name of reports) await copyFile(`${source}/${name}.json`, `${destination}/${name}.json`);
for (const name of screenshots) await copyFile(`${source}/${name}.png`, `docs/screenshots/deployment/${name}.png`);
const manifest = { generatedAt: new Date().toISOString(), artifactBytes: artifact.length, artifactSha256,
  fullBrowserArtifactSha256, benchmarkArtifactSha256, finalSourceChange,
  distMatchesOfflineArtifact: true, productionTestHooks: false,
  unitTests: { simulation: 9, upgrade: 10, tactical: 21, deployment: 7 }, inputOnlyCampaignVictories: 6,
  deploymentBrowserChecks: 14, legacyBrowserChecks: 20, tacticalIntegrationGroups: 8, finalArtifactChecks: 4,
  resultSettingsNavigation: collected['defeat-check'].resultSettingsNavigation,
  reports, screenshots,
  limits: ['Linux headless Chromium and SwiftShader; not Windows or hardware FPS.',
    'Synthetic HOTAS only; no physical device acceptance.', 'Mobile browsing/settings, not touch-driving controls.',
    '20 minutes of fixed-step simulation with sparse rendering, not continuous real-time rendering.',
    'Garage framing changed; the current benchmark is not a matched before/after performance claim.',
    'Combat renderTimesMs do not wait for GPU completion; they are not combat FPS.',
    'Accelerated stability loop disables audio; bounded resource observations do not prove absence of all leaks.',
    'No complete model-token usage telemetry available.'] };
await writeFile(`${destination}/manifest.json`, JSON.stringify(manifest, null, 2));
console.log(JSON.stringify(manifest, null, 2));
