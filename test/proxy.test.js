const { test } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { startRelay, upstreamUrl, checkProxy } = require('../src/proxy');

test('encodes proxy login characters in the upstream url', () => {
  const url = upstreamUrl({ type: 'socks5', host: 'h', port: 1080, username: 'a@b', password: 'p:w' });
  assert.equal(url, 'socks5://a%40b:p%3Aw@h:1080');
});

// Stands in for a proxy that requires a login. It only answers if the relay added the header.
function fakeLoginProxy(body) {
  const expected = `Basic ${Buffer.from('alice:s3cret').toString('base64')}`;
  return http.createServer((req, res) => {
    if (req.headers['proxy-authorization'] !== expected) {
      res.writeHead(407, { 'Proxy-Authenticate': 'Basic' }).end('auth required');
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' }).end(body);
  });
}

const LOGIN = { username: 'alice', password: 's3cret' };

test('relay adds the proxy login when it forwards to an upstream proxy', async () => {
  const upstream = fakeLoginProxy('via upstream');
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));

  const relay = await startRelay({ type: 'http', host: '127.0.0.1', port: upstream.address().port, ...LOGIN });

  try {
    const { hostname, port } = new URL(relay.proxyServer);
    const result = await new Promise((resolve, reject) => {
      const req = http.request(
        { host: hostname, port, path: 'http://example.test/', headers: { Host: 'example.test' } },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => resolve({ status: res.statusCode, data }));
        },
      );
      req.on('error', reject);
      req.end();
    });
    assert.equal(result.status, 200);
    assert.equal(result.data, 'via upstream');
  } finally {
    await relay.close();
    upstream.closeAllConnections();
    upstream.close();
  }
});

test('checkProxy returns the parsed answer from the proxy', async () => {
  const upstream = fakeLoginProxy('{"ip":"203.0.113.7"}');
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));

  try {
    const result = await checkProxy(
      { type: 'http', host: '127.0.0.1', port: upstream.address().port, ...LOGIN },
      'http://example.test/ip',
    );
    assert.deepEqual(result, { ip: '203.0.113.7' });
  } finally {
    upstream.closeAllConnections();
    upstream.close();
  }
});

test('checkProxy reports a rejected login', async () => {
  const upstream = fakeLoginProxy('{"ip":"203.0.113.7"}');
  await new Promise((resolve) => upstream.listen(0, '127.0.0.1', resolve));

  try {
    await assert.rejects(
      checkProxy({ type: 'http', host: '127.0.0.1', port: upstream.address().port, username: 'bob', password: 'wrong' }, 'http://example.test/ip'),
      /rejected the username or password/,
    );
  } finally {
    upstream.closeAllConnections();
    upstream.close();
  }
});
