import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const host = '127.0.0.1';
const port = 5188;
const address = `http://${host}:${port}/`;
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

try {
  await stat(resolve(root, 'index.html'));
} catch {
  console.error('Built game is missing. Run the Windows launcher to build it first.');
  process.exit(1);
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' }).end();
    return;
  }

  try {
    const pathname = decodeURIComponent(new URL(request.url, address).pathname);
    const file = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${sep}`)) {
      response.writeHead(403).end('Forbidden');
      return;
    }
    const metadata = await stat(file);
    if (!metadata.isFile()) {
      response.writeHead(404).end('Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(file)] ?? 'application/octet-stream',
      'Content-Length': metadata.size,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    response.writeHead(error instanceof URIError ? 400 : 404).end('Not found');
  }
});

server.on('error', (error) => {
  console.error(error.code === 'EADDRINUSE'
    ? `Port ${port} is already in use. Stop the previous game server with Ctrl+C, then start again.`
    : `Unable to start the local server: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`\nGame ready: ${address}\nKeep this window open. Press Ctrl+C to stop.\n`);
  if (process.platform === 'win32' && !process.argv.includes('--no-open')) {
    const browser = spawn('powershell.exe', [
      '-NoLogo', '-NoProfile', '-Command', `Start-Process '${address}'`,
    ], { windowsHide: true, stdio: 'ignore' });
    browser.on('error', () => console.log(`Open ${address} in your browser.`));
    browser.unref();
  }
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
