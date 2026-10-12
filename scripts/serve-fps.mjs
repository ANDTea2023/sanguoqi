import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const buildRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist-fps');
const host = '127.0.0.1';
const port = 5189;
const address = `http://${host}:${port}/`;
const noOpen = process.argv.includes('--no-open');
const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

let root;
try {
  root = await realpath(buildRoot);
  const entry = await stat(resolve(root, 'fps.html'));
  if (!entry.isFile()) throw new Error('Missing FPS entry.');
} catch {
  console.error('Built shooter is missing. Run the Windows shooter launcher to build it first.');
  process.exit(1);
}

function openGame() {
  if (noOpen || process.platform !== 'win32') return;
  const browser = spawn('powershell.exe', [
    '-NoLogo', '-NoProfile', '-Command', `Start-Process '${address}'`,
  ], { windowsHide: true, stdio: 'ignore' });
  browser.on('error', () => console.log(`Open ${address} in your browser.`));
  browser.unref();
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Game-Server', 'nightfall-fps');

  function sendText(status, content, headers = {}) {
    response.writeHead(status, {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Length': Buffer.byteLength(content),
      ...headers,
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  }

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(405, 'Method not allowed', { Allow: 'GET, HEAD' });
    return;
  }

  try {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', address).pathname);
    if (pathname.includes('\0')) {
      sendText(400, 'Invalid path');
      return;
    }

    if (pathname === '/__fps_health') {
      const content = JSON.stringify({ app: 'nightfall-fps', port });
      response.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Length': Buffer.byteLength(content),
      });
      response.end(request.method === 'HEAD' ? undefined : content);
      return;
    }

    const requestedFile = resolve(root, `.${pathname === '/' ? '/fps.html' : pathname}`);
    if (!requestedFile.startsWith(`${root}${sep}`)) {
      sendText(403, 'Forbidden');
      return;
    }
    const file = await realpath(requestedFile);
    if (!file.startsWith(`${root}${sep}`)) {
      sendText(403, 'Forbidden');
      return;
    }
    const metadata = await stat(file);
    if (!metadata.isFile()) {
      sendText(404, 'Not found');
      return;
    }
    response.writeHead(200, {
      'Content-Type': mimeTypes[extname(file).toLowerCase()] ?? 'application/octet-stream',
      'Content-Length': metadata.size,
    });
    if (request.method === 'HEAD') response.end();
    else createReadStream(file).on('error', () => response.destroy()).pipe(response);
  } catch (error) {
    sendText(error instanceof URIError || error instanceof TypeError ? 400 : 404,
      error instanceof URIError || error instanceof TypeError ? 'Invalid request' : 'Not found');
  }
});

server.on('error', async (error) => {
  if (error.code === 'EADDRINUSE') {
    try {
      const response = await fetch(`${address}__fps_health`, { signal: AbortSignal.timeout(1500) });
      const health = await response.json();
      if (response.ok && response.headers.get('X-Game-Server') === 'nightfall-fps' && health.app === 'nightfall-fps' && health.port === port) {
        console.log(`Shooter is already running: ${address}\nKeep the original server window open.`);
        openGame();
        return;
      }
    } catch { /* Another application may be using this port. */ }
    console.error(`Port ${port} is in use by another application. Stop it or free this port, then start the shooter again.`);
  } else {
    console.error(`Unable to start the shooter server: ${error.message}`);
  }
  process.exitCode = 1;
});

server.listen(port, host, () => {
  console.log(`\nShooter ready: ${address}\nKeep this window open. Press Ctrl+C to stop.\n`);
  openGame();
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
