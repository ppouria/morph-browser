const { test } = require('node:test');
const assert = require('node:assert/strict');
const { startCheckServer } = require('../src/check-server');

async function withServer(fn) {
  const server = await startCheckServer();
  try {
    return await fn(server);
  } finally {
    await server.close();
  }
}

test('serves the check page on localhost', async () => {
  await withServer(async (server) => {
    assert.match(server.url, /^http:\/\/127\.0\.0\.1:\d+\/$/);
    const res = await fetch(server.url);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /text\/html/);
    const html = await res.text();
    assert.match(html, /Connection check/);
    assert.match(html, /check\.js/);
  });
});

test('serves the page assets with the right type', async () => {
  await withServer(async (server) => {
    const res = await fetch(`${server.url}check.js`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /javascript/);
  });
});

test('refuses path traversal and unknown files', async () => {
  await withServer(async (server) => {
    const traversal = await fetch(`${server.url}..%2Fpackage.json`);
    assert.ok([400, 404].includes(traversal.status));

    const missing = await fetch(`${server.url}nope.html`);
    assert.equal(missing.status, 404);
  });
});
