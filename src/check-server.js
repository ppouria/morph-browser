const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const CHECK_DIR = path.join(__dirname, 'check');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
};

// A tiny static server for the local connection-check page. It runs on 127.0.0.1 with a random
// port and serves one directory, so a profile can open it as a normal http page (and therefore
// run its own fetches through that profile's proxy).
function startCheckServer() {
  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end('bad request');
      return;
    }

    const file = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
    if (!/^[\w.-]+$/.test(file)) {
      response.writeHead(400).end('bad request');
      return;
    }

    const full = path.join(CHECK_DIR, file);
    if (!full.startsWith(CHECK_DIR + path.sep)) {
      response.writeHead(400).end('bad request');
      return;
    }

    fs.readFile(full, (err, data) => {
      if (err) {
        response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('not found');
        return;
      }
      response.writeHead(200, {
        'Content-Type': TYPES[path.extname(full)] || 'application/octet-stream',
        'Cache-Control': 'no-store',
      });
      response.end(data);
    });
  });

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/`,
        port,
        close: () => new Promise((done) => server.close(() => done())),
      });
    });
  });
}

module.exports = { startCheckServer, CHECK_DIR };
