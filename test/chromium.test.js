const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { findChromium, detectBrowserMajor, buildArgs } = require('../src/chromium');

test('uses the configured path when it exists', () => {
  const found = findChromium({
    configuredPath: '/opt/chrome',
    platform: 'linux',
    env: { PATH: '' },
    exists: (p) => p === '/opt/chrome',
  });
  assert.equal(found, '/opt/chrome');
});

test('uses the dev download pointed to by vendor executable.txt', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-vendor-'));
  const target = path.join(dir, 'chrome');
  fs.writeFileSync(target, '');
  fs.writeFileSync(path.join(dir, 'executable.txt'), target);
  assert.equal(findChromium({ vendorDir: dir, platform: 'linux', env: { PATH: '' } }), target);
});

test('linux looks for chromium names on PATH', () => {
  const found = findChromium({
    platform: 'linux',
    env: { PATH: '/bin:/usr/bin' },
    exists: (p) => p === '/usr/bin/google-chrome',
  });
  assert.equal(found, '/usr/bin/google-chrome');
});

test('windows checks the Program Files install', () => {
  const env = { PROGRAMFILES: 'C:\\Program Files' };
  const want = path.win32.join('C:\\Program Files', 'Google', 'Chrome', 'Application', 'chrome.exe');
  assert.equal(findChromium({ platform: 'win32', env, exists: (p) => p === want }), want);
});

test('returns null when no browser is installed', () => {
  assert.equal(findChromium({ platform: 'darwin', env: {}, exists: () => false }), null);
});

test('each profile gets its own user-data-dir, debug port and proxy', () => {
  const args = buildArgs({ profileDir: '/data/p_1', debugPort: 9222, proxyServer: 'http://127.0.0.1:5000' });
  assert.ok(args.includes('--user-data-dir=/data/p_1'));
  assert.ok(args.includes('--remote-debugging-port=9222'));
  assert.ok(args.includes('--proxy-server=http://127.0.0.1:5000'));
});

test('start URLs open as tabs after the flags', () => {
  const args = buildArgs({ profileDir: '/data/p_1', debugPort: 9222, proxyServer: null, startUrls: ['https://a.test', 'https://b.test'] });
  assert.deepEqual(args.slice(-2), ['https://a.test', 'https://b.test']);
});

test('no proxy flag when the profile has no proxy', () => {
  const args = buildArgs({ profileDir: '/data/p_1', debugPort: 9222, proxyServer: null });
  assert.ok(!args.some((a) => a.startsWith('--proxy-server')));
});

test('user-agent, languages, window size and WebRTC flags reach Chromium', () => {
  const args = buildArgs({
    profileDir: '/data/p_1',
    debugPort: 9300,
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/151.0.0.0',
    acceptLanguages: 'de-DE,de,en',
    windowSize: { width: 1280, height: 720 },
    webRtcFlags: ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp'],
  });
  assert.ok(args.includes('--user-agent=Mozilla/5.0 (X11; Linux x86_64) Chrome/151.0.0.0'));
  assert.ok(args.includes('--accept-lang=de-DE,de,en'));
  assert.ok(args.includes('--lang=de-DE'));
  assert.ok(args.includes('--window-size=1280,720'));
  assert.ok(args.includes('--force-webrtc-ip-handling-policy=disable_non_proxied_udp'));
});

test('nothing extra is added when the profile uses the system defaults', () => {
  const args = buildArgs({ profileDir: '/data/p_1', debugPort: 9222 });
  assert.ok(!args.some((a) => a.startsWith('--user-agent')));
  assert.ok(!args.some((a) => a.startsWith('--accept-lang')));
  assert.ok(!args.some((a) => a.startsWith('--window-size')));
});

test('detects the real major version from --version and caches it', async () => {
  let runs = 0;
  const run = async () => { runs += 1; return { stdout: 'Google Chrome 155.0.7229.65\n' }; };
  assert.equal(await detectBrowserMajor('/tmp/chrome-a', { run }), '155');
  assert.equal(await detectBrowserMajor('/tmp/chrome-a', { run }), '155');
  assert.equal(runs, 1);
});

test('a binary that will not report a version falls back to null', async () => {
  assert.equal(await detectBrowserMajor('/tmp/chrome-b', { run: async () => { throw new Error('nope'); } }), null);
  assert.equal(await detectBrowserMajor('/tmp/chrome-c', { run: async () => ({ stdout: 'no version here' }) }), null);
});
