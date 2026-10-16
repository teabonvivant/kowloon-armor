import { build } from 'esbuild';
import { mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
const sample = process.argv.includes('--realism');
const result = await build({ entryPoints: ['src/main.ts'], bundle: true, minify: true,
  define: { __REALISM_SAMPLE__: String(sample) },
  format: 'iife', target: ['chrome110', 'edge110'], write: false, legalComments: 'eof' });
const script = result.outputFiles.find(file => file.path.endsWith('.js')) ?? result.outputFiles[0];
if (!script) throw new Error('Game bundle was not generated');
const css = (await Promise.all(['src/style.css', 'src/hud.css', 'src/mobile.css', ...(sample ? ['src/realism.css'] : [])].map(file => readFile(file, 'utf8')))).join('\n');
const template = await readFile('index.html', 'utf8');
const html = template.replace('<link rel="stylesheet" href="/src/style.css">', '')
  .replace('<link rel="stylesheet" href="/src/hud.css">', '')
  .replace('</head>', `<style>${css}</style></head>`)
  .replace('<script type="module" src="/src/main.ts"></script>', () => `<script>${script.text.replaceAll('</script', '<\\/script')}</script>`);
const artifact = sample ? '九龍裝甲行動-寫實樣板.html' : '九龍裝甲行動.html';
const output = sample ? 'dist/realism.html' : 'dist/index.html';
const finalHtml = sample ? html.replace('<title>九龍裝甲行動 | KOWLOON ARMOR</title>','<title>九龍裝甲行動 · 寫實樣板 / 街口接敵</title>') : html;
const privateOut = process.argv.find(arg => arg.startsWith('--out='))?.slice(6);
if (privateOut) { await writeFile(privateOut, finalHtml); console.log(`Private build: ${privateOut} (${(Buffer.byteLength(html)/1048576).toFixed(2)} MB)`); process.exit(0); }
await writeFile(output, finalHtml);
await copyFile(output, artifact);
console.log(`Offline game: ${artifact} (${(Buffer.byteLength(html)/1048576).toFixed(2)} MB)`);
