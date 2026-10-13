import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const result = await build({ entryPoints: ['src/main.ts'], bundle: true, minify: true,
  format: 'iife', target: ['chrome110', 'edge110'], write: false, legalComments: 'eof' });
const script = result.outputFiles.find(file => file.path.endsWith('.js')) ?? result.outputFiles[0];
if (!script) throw new Error('Game bundle was not generated');
const css = (await Promise.all(['src/style.css', 'src/hud.css', 'src/mobile.css'].map(file => readFile(file, 'utf8')))).join('\n');
const template = await readFile('index.html', 'utf8');
const html = template.replace('<link rel="stylesheet" href="/src/style.css">', '')
  .replace('<link rel="stylesheet" href="/src/hud.css">', '')
  .replace('</head>', `<style>${css}</style></head>`)
  .replace('<script type="module" src="/src/main.ts"></script>', () => `<script>${script.text.replaceAll('</script', '<\\/script')}</script>`);
await writeFile('dist/index.html', html);
await copyFile('dist/index.html', '九龍裝甲行動.html');
console.log(`Offline game: 九龍裝甲行動.html (${(Buffer.byteLength(html)/1048576).toFixed(2)} MB)`);
