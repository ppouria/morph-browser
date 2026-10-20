const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { startChain } = require('../src/chain');

function listen(server) {
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
}

function mockProxy(name, log) {
  const server = http.createServer((req, res) => {
    log.push(`${name}:${req.method}:${req.url}`);
    const url = new URL(req.url.startsWith('http') ? req.url : `http://${req.headers.host}${req.url}`);
    const upstream = http.request({
      host: url.hostname,
      port: Number(url.port) || 80,
      path: `${url.pathname}${url.search}`,
      method: req.method,
      headers: { ...req.headers, host: url.host },
    }, (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    req.pipe(upstream);
  });
  server.on('connect', (req, client, head) => {
    log.push(`${name}:CONNECT:${req.url}`);
    const index = req.url.lastIndexOf(':');
    const host = req.url.slice(0, index);
    const port = Number(req.url.slice(index + 1));
    const upstream = net.connect(port, host, () => {
      client.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);
      client.pipe(upstream);
      upstream.pipe(client);
    });
    upstream.on('error', () => client.destroy());
  });
  return { server, listening: listen(server) };
}

function getVia(proxy, url) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(proxy);
    const req = http.get({
      host: parsed.hostname,
      port: parsed.port,
      path: url,
      headers: { host: new URL(url).host },
    }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body }));
    });
    req.on('error', reject);
  });
}

test('a profile proxy is reached through the app proxy first', async (t) => {
  const log = [];
  const destination = http.createServer((req, res) => {
    log.push(`destination:${req.url}`);
    res.end('chain-ok');
  });
  const destPort = await listen(destination);
  const appProxy = mockProxy('app', log);
  const appPort = await appProxy.listening;
  const profileProxy = mockProxy('profile', log);
  const profilePort = await profileProxy.listening;

  const chain = await startChain(
    { type: 'http', host: '127.0.0.1', port: appPort, username: 'app', password: 'one' },
    { type: 'http', host: '127.0.0.1', port: profilePort, username: 'profile', password: 'two' },
  );
  t.after(async () => {
    await chain.close();
    appProxy.server.close();
    profileProxy.server.close();
    destination.close();
  });

  const answer = await getVia(chain.proxyServer, `http://127.0.0.1:${destPort}/hello`);
  assert.equal(answer.status, 200);
  assert.equal(answer.body, 'chain-ok');
  assert.match(log[0], new RegExp(`^app:CONNECT:127\\.0\\.0\\.1:${profilePort}$`));
  assert.match(log[1], /^profile:GET:http:\/\/127\.0\.0\.1:\d+\/hello$/);
  assert.match(log[2], /^destination:\/hello$/);
});

test('CONNECT tunnels chain both proxies', async (t) => {
  const log = [];
  const destination = http.createServer((req, res) => res.end('tunnel-ok'));
  const destPort = await listen(destination);
  const appProxy = mockProxy('app', log);
  const appPort = await appProxy.listening;
  const profileProxy = mockProxy('profile', log);
  const profilePort = await profileProxy.listening;

  const chain = await startChain(
    { type: 'http', host: '127.0.0.1', port: appPort },
    { type: 'http', host: '127.0.0.1', port: profilePort },
  );
  t.after(async () => {
    await chain.close();
    appProxy.server.close();
    profileProxy.server.close();
    destination.close();
  });

  const target = new URL(chain.proxyServer);
  const answer = await new Promise((resolve, reject) => {
    const socket = net.connect(Number(target.port), target.hostname, () => {
      socket.write(`CONNECT 127.0.0.1:${destPort} HTTP/1.1\r\nHost: 127.0.0.1:${destPort}\r\n\r\n`);
      let head = '';
      const onData = (chunk) => {
        head += chunk.toString();
        if (!head.includes('\r\n\r\n')) return;
        socket.off('data', onData);
        assert.match(head, /^HTTP\/1\.1 200/);
        socket.write(`GET /tunnel HTTP/1.1\r\nHost: 127.0.0.1:${destPort}\r\nConnection: close\r\n\r\n`);
        let body = '';
        socket.on('data', (data) => { body += data.toString(); });
        socket.on('end', () => resolve(body));
      };
      socket.on('data', onData);
    });
    socket.on('error', reject);
  });

  assert.match(answer, /tunnel-ok/);
  assert.match(log[0], new RegExp(`^app:CONNECT:127\\.0\\.0\\.1:${profilePort}$`));
  assert.match(log[1], new RegExp(`^profile:CONNECT:127\\.0\\.0\\.1:${destPort}$`));
});

function mockSocks(name, log, { respond = null } = {}) {
  const server = net.createServer((socket) => {
    socket.once('data', () => {
      log.push(`${name}:hello`);
      socket.write(Buffer.from([5, 0]));
      socket.once('data', (request) => {
        const atyp = request[3];
        let host;
        let offset;
        if (atyp === 1) {
          host = `${request[4]}.${request[5]}.${request[6]}.${request[7]}`;
          offset = 8;
        } else if (atyp === 3) {
          const length = request[4];
          host = request.subarray(5, 5 + length).toString();
          offset = 5 + length;
        } else {
          socket.destroy();
          return;
        }
        const port = request.readUInt16BE(offset);
        log.push(`${name}:CONNECT:${host}:${port}`);
        socket.write(Buffer.from([5, 0, 0, 1, 0, 0, 0, 0, 0, 0]));
        if (respond) {
          socket.once('data', () => { log.push(`${name}:REQUEST`); socket.end(respond); });
          return;
        }
        const upstream = net.connect(port, host, () => {
          socket.pipe(upstream);
          upstream.pipe(socket);
        });
        upstream.on('error', () => socket.destroy());
      });
    });
  });
  return { server, listening: listen(server) };
}

test('a SOCKS5 app proxy can reach an HTTP profile proxy', async (t) => {
  const log = [];
  const destination = http.createServer((req, res) => res.end('socks-chain'));
  const destPort = await listen(destination);
  const appSocks = mockSocks('app', log);
  const appPort = await appSocks.listening;
  const profileProxy = mockProxy('profile', log);
  const profilePort = await profileProxy.listening;

  const chain = await startChain(
    { type: 'socks5', host: '127.0.0.1', port: appPort },
    { type: 'http', host: '127.0.0.1', port: profilePort },
  );
  t.after(async () => {
    await chain.close();
    appSocks.server.close();
    profileProxy.server.close();
    destination.close();
  });

  const answer = await getVia(chain.proxyServer, `http://127.0.0.1:${destPort}/socks`);
  assert.equal(answer.body, 'socks-chain');
  assert.match(log[1], new RegExp(`^app:CONNECT:127\\.0\\.0\\.1:${profilePort}$`));
  assert.match(log[2], /^profile:GET:/);
});

test('an HTTP app proxy can reach a SOCKS5 profile proxy', async (t) => {
  const log = [];
  const destination = http.createServer((req, res) => res.end('socks-profile'));
  const destPort = await listen(destination);
  const appProxy = mockProxy('app', log);
  const appPort = await appProxy.listening;
  const profileSocks = mockSocks('profile', log);
  const profilePort = await profileSocks.listening;

  const chain = await startChain(
    { type: 'http', host: '127.0.0.1', port: appPort },
    { type: 'socks5', host: '127.0.0.1', port: profilePort },
  );
  t.after(async () => {
    await chain.close();
    appProxy.server.close();
    profileSocks.server.close();
    destination.close();
  });

  const answer = await getVia(chain.proxyServer, `http://127.0.0.1:${destPort}/socks`);
  assert.equal(answer.body, 'socks-profile');
  assert.match(log[0], new RegExp(`^app:CONNECT:127\\.0\\.0\\.1:${profilePort}$`));
  assert.match(log[1], /^profile:hello$/);
  assert.ok(log.some((line) => line === `profile:CONNECT:127.0.0.1:${destPort}`));
});

test('a profile without its own proxy uses only the app proxy', async (t) => {
  const log = [];
  const destination = http.createServer((req, res) => res.end('app-only'));
  const destPort = await listen(destination);
  const appProxy = mockProxy('app', log);
  const appPort = await appProxy.listening;

  const chain = await startChain({ type: 'http', host: '127.0.0.1', port: appPort }, null);
  t.after(async () => {
    await chain.close();
    appProxy.server.close();
    destination.close();
  });

  const answer = await getVia(chain.proxyServer, `http://127.0.0.1:${destPort}/only`);
  assert.equal(answer.body, 'app-only');
  assert.match(log[0], new RegExp(`^app:CONNECT:127\\.0\\.0\\.1:${destPort}$`));
});

test('plain HTTP is carried by the tunnel, not a direct socket', async (t) => {
  const log = [];
  const appSocks = mockSocks('app', log);
  const appPort = await appSocks.listening;
  const profileServer = http.createServer((req, res) => {
    log.push(`profile:GET:${req.url}`);
    res.end('tunneled-http');
  });
  const profilePort = await listen(profileServer);

  const chain = await startChain(
    { type: 'socks5', host: '127.0.0.1', port: appPort },
    { type: 'http', host: '127.0.0.1', port: profilePort },
  );
  t.after(async () => {
    await chain.close();
    appSocks.server.close();
    profileServer.close();
  });

  const answer = await getVia(chain.proxyServer, 'http://203.0.113.1/never-direct');
  assert.equal(answer.body, 'tunneled-http');
  assert.ok(log.some((line) => line === `app:CONNECT:127.0.0.1:${profilePort}`));
  assert.ok(log.some((line) => line.startsWith('profile:GET:http://203.0.113.1/never-direct')));
});

test('plain HTTP through a SOCKS profile proxy stays in the tunnel', async (t) => {
  const log = [];
  const appProxy = mockProxy('app', log);
  const appPort = await appProxy.listening;
  const profileSocks = mockSocks('profile', log, {
    respond: 'HTTP/1.1 200 OK\r\nContent-Length: 14\r\nConnection: close\r\n\r\nsocks-tunneled',
  });
  const profilePort = await profileSocks.listening;

  const chain = await startChain(
    { type: 'http', host: '127.0.0.1', port: appPort },
    { type: 'socks5', host: '127.0.0.1', port: profilePort },
  );
  t.after(async () => {
    await chain.close();
    appProxy.server.close();
    profileSocks.server.close();
  });

  const answer = await getVia(chain.proxyServer, 'http://203.0.113.1/never-direct');
  assert.equal(answer.body, 'socks-tunneled');
  assert.ok(log.some((line) => line === `app:CONNECT:127.0.0.1:${profilePort}`));
  assert.ok(log.some((line) => line === 'profile:CONNECT:203.0.113.1:80'));
});
