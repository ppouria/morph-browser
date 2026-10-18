const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseProxyString } = require('../src/proxy-parse');

test('host:port uses the default type', () => {
  assert.deepEqual(parseProxyString('proxy.example.net:8080'), {
    type: 'http', host: 'proxy.example.net', port: 8080, username: '', password: '',
  });
  assert.equal(parseProxyString('proxy.example.net:1080', 'socks5').type, 'socks5');
});

test('host:port:user:pass, and the password may contain colons', () => {
  const p = parseProxyString('proxy.example.net:12321:alice:s3cret:with:colons');
  assert.deepEqual([p.host, p.port, p.username, p.password], ['proxy.example.net', 12321, 'alice', 's3cret:with:colons']);
});

test('provider line with a session-style password', () => {
  const p = parseProxyString('proxy.example.net:12321:alice:s3cret_country-de_session-abc_lifetime-168h');
  assert.equal(p.username, 'alice');
  assert.equal(p.password, 's3cret_country-de_session-abc_lifetime-168h');
});

test('user:pass:host:port', () => {
  const p = parseProxyString('alice:s3cret:proxy.example.net:8080');
  assert.deepEqual([p.host, p.port, p.username, p.password], ['proxy.example.net', 8080, 'alice', 's3cret']);
});

test('user:pass@host:port, with percent-encoded login', () => {
  const p = parseProxyString('alice%40corp:p%3Aw@proxy.example.net:1080', 'socks5');
  assert.deepEqual([p.username, p.password, p.host, p.port], ['alice@corp', 'p:w', 'proxy.example.net', 1080]);
});

test('host:port@user:pass', () => {
  const p = parseProxyString('proxy.example.net:8080@alice:s3cret');
  assert.deepEqual([p.host, p.port, p.username, p.password], ['proxy.example.net', 8080, 'alice', 's3cret']);
});

test('scheme sets the type, and socks5h and socks mean socks5', () => {
  assert.equal(parseProxyString('socks5h://alice:pw@h.example:1080').type, 'socks5');
  assert.equal(parseProxyString('socks://h.example:1080').type, 'socks5');
  assert.equal(parseProxyString('https://alice:pw@h.example:8443').type, 'https');
  assert.equal(parseProxyString('HTTP://h.example:3128').type, 'http');
});

test('scheme overrides the default type', () => {
  assert.equal(parseProxyString('socks5://h.example:1080', 'http').type, 'socks5');
});

test('rejects unknown schemes, bad ports and unreadable text', () => {
  assert.throws(() => parseProxyString('ftp://h.example:21'), /unsupported proxy scheme/);
  assert.throws(() => parseProxyString('h.example:70000'), /port/);
  assert.throws(() => parseProxyString('h.example:abc'), /port/);
  assert.throws(() => parseProxyString('just-a-word'), /expected/);
  assert.throws(() => parseProxyString(''), /empty/);
});

test('the provider line from the field notes pastes as host:port:user:pass', () => {
  const p = parseProxyString('geo.iproyal.com:12321:aav1m17yWAzGaBRr:ADkHh3N52p2MMoa9_country-de_session-KFqD8wso_lifetime-168h');
  assert.deepEqual(p, {
    type: 'http',
    host: 'geo.iproyal.com',
    port: 12321,
    username: 'aav1m17yWAzGaBRr',
    password: 'ADkHh3N52p2MMoa9_country-de_session-KFqD8wso_lifetime-168h',
  });
});

test('a scheme in front of the four-field line still sets the type', () => {
  const p = parseProxyString('socks5://geo.iproyal.com:12321:alice:pw');
  assert.equal(p.type, 'socks5');
  assert.equal(p.port, 12321);
  assert.equal(p.username, 'alice');
});

test('space separated lines read as host and credentials', () => {
  assert.deepEqual(
    parseProxyString('proxy.example.net:8080 alice:s3cret'),
    { type: 'http', host: 'proxy.example.net', port: 8080, username: 'alice', password: 's3cret' },
  );
  const four = parseProxyString('proxy.example.net 8080 alice s3cret');
  assert.deepEqual([four.host, four.port, four.username, four.password], ['proxy.example.net', 8080, 'alice', 's3cret']);
});

test('pipe and semicolon separated lines work too', () => {
  const piped = parseProxyString('proxy.example.net:8080|alice:s3cret');
  assert.deepEqual([piped.host, piped.port, piped.username, piped.password], ['proxy.example.net', 8080, 'alice', 's3cret']);

  const semis = parseProxyString('proxy.example.net;8080;alice;s3cret');
  assert.deepEqual([semis.host, semis.port, semis.username, semis.password], ['proxy.example.net', 8080, 'alice', 's3cret']);
});

test('host:port:user works when the provider leaves the password out', () => {
  const p = parseProxyString('proxy.example.net:8080:alice');
  assert.deepEqual([p.host, p.port, p.username, p.password], ['proxy.example.net', 8080, 'alice', '']);
});

test('IPv6 hosts and quotes around the line are tolerated', () => {
  const p = parseProxyString('"socks5://[2001:db8::1]:1080"');
  assert.deepEqual([p.host, p.port, p.type], ['2001:db8::1', 1080, 'socks5']);
});
