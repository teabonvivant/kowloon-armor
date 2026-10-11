import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
createServer(async (request, response) => {
  if (request.url === '/favicon.ico') { response.writeHead(204); response.end(); return; }
  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  response.end(await readFile('dist/index.html'));
}).listen(4187, '127.0.0.1', () => console.log('Kowloon Armor http://127.0.0.1:4187'));
