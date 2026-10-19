const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
  createStore, normalizeProxy, normalizeBrowserVersion, normalizeStartUrls, normalizeCookies, normalizeChangeIpUrl,
} = require('../src/store');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pb-store-'));
}

test('saves, updates and deletes a profile', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({ name: 'Account 1', group: 'shop', proxy: null });
  assert.match(p.id, /^p_[0-9a-f]{8}$/);

  const updated = store.saveProfile({ ...p, name: 'Account 1b' });
  assert.equal(updated.id, p.id);
  assert.equal(updated.createdAt, p.createdAt);
  assert.equal(store.listProfiles().length, 1);

  store.trashProfile(p.id);
  assert.equal(store.listProfiles().some((item) => item.id === p.id), false);
  assert.equal(store.listTrash().length, 1);
  store.restoreProfile(p.id);
  assert.equal(store.getProfile(p.id).id, p.id);
  store.trashProfile(p.id);
  store.purgeProfile(p.id);
  assert.equal(store.getProfile(p.id), null);
});

test('data survives a new store instance', () => {
  const dir = tmpDir();
  const saved = createStore(dir).saveProfile({ name: 'Persisted' });
  assert.equal(createStore(dir).getProfile(saved.id).name, 'Persisted');
});

test('requires a profile name', () => {
  const store = createStore(tmpDir());
  assert.throws(() => store.saveProfile({ name: '   ' }), /name is required/);
});

test('empty proxy host means no proxy', () => {
  assert.equal(normalizeProxy({ type: 'http', host: '', port: 8080 }), null);
  assert.equal(normalizeProxy(null), null);
});

test('rejects unknown proxy type and bad port', () => {
  assert.throws(() => normalizeProxy({ type: 'ftp', host: 'h', port: 21 }), /proxy type/);
  assert.throws(() => normalizeProxy({ type: 'http', host: 'h', port: 70000 }), /port/);
  assert.throws(() => normalizeProxy({ type: 'http', host: 'h', port: 'abc' }), /port/);
});

test('browser version is validated and trimmed', () => {
  assert.equal(normalizeBrowserVersion(''), null);
  assert.equal(normalizeBrowserVersion(' 151 '), '151');
  assert.equal(normalizeBrowserVersion('151.0.7922.173'), '151.0.7922.173');
  assert.throws(() => normalizeBrowserVersion('../151'), /invalid browser version/);
});

test('start URLs: one per line, http or https only, at most ten', () => {
  assert.deepEqual(normalizeStartUrls('https://a.test\n\n  http://b.test/x  \n'), ['https://a.test', 'http://b.test/x']);
  assert.deepEqual(normalizeStartUrls(''), []);
  assert.throws(() => normalizeStartUrls('javascript:alert(1)'), /http or https/);
  assert.throws(() => normalizeStartUrls('not a url'), /not a valid URL/);
  assert.throws(() => normalizeStartUrls(Array.from({ length: 11 }, (_, i) => `https://x${i}.test`)), /at most 10/);
});

test('a saved profile keeps its Chromium major, start URLs and proxy', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({
    name: 'Pinned',
    browserVersion: '147',
    startUrls: 'https://example.test',
    proxy: { type: 'socks5', host: 'h.example', port: 1080, username: 'u', password: 'p' },
  });
  const stored = store.getProfile(p.id);
  assert.equal(stored.browserVersion, '147');
  assert.deepEqual(stored.startUrls, ['https://example.test']);
  assert.equal(stored.proxy.type, 'socks5');
});

test('cookies accept the exported JSON shape and reject bad input', () => {
  const [c] = normalizeCookies('[{"name":"sid","value":"abc","domain":".example.test","path":"/","secure":true,"expirationDate":1900000000,"sameSite":"lax"}]');
  assert.deepEqual(c, { name: 'sid', value: 'abc', domain: '.example.test', path: '/', secure: true, expires: 1900000000, sameSite: 'Lax' });
  assert.deepEqual(normalizeCookies(''), []);
  assert.throws(() => normalizeCookies('not json'), /JSON array/);
  assert.throws(() => normalizeCookies('{"name":"x"}'), /JSON array/);
  assert.throws(() => normalizeCookies('[{"name":"x"}]'), /needs a name and a domain/);
});

test('change IP URL must be http or https', () => {
  assert.equal(normalizeChangeIpUrl(''), null);
  assert.equal(normalizeChangeIpUrl(' https://rotate.test/x '), 'https://rotate.test/x');
  assert.throws(() => normalizeChangeIpUrl('file:///etc/passwd'), /http or https/);
  assert.throws(() => normalizeChangeIpUrl('not a url'), /not a valid URL/);
});

test('saved proxies keep a name and the proxy fields', () => {
  const store = createStore(tmpDir());
  const saved = store.saveProxy({ name: 'Frankfurt', type: 'socks5', host: 'h.test', port: 1080, username: 'u', password: 'p' });
  assert.match(saved.id, /^x_[0-9a-f]{8}$/);
  assert.deepEqual(store.listProxies().map((p) => p.name), ['Frankfurt']);

  const edited = store.saveProxy({ id: saved.id, name: 'Frankfurt 2', type: 'http', host: 'h.test', port: 8080 });
  assert.equal(edited.id, saved.id);
  assert.equal(store.listProxies()[0].name, 'Frankfurt 2');

  store.deleteProxy(saved.id);
  assert.deepEqual(store.listProxies(), []);
  assert.throws(() => store.saveProxy({ name: 'no host', type: 'http', host: '', port: 80 }), /host is required/);
});

test('a profile keeps its cookies and change-IP URL', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({ name: 'Cookies', cookies: '[{"name":"a","value":"1","domain":"x.test"}]', changeIpUrl: 'https://rotate.test' });
  const stored = store.getProfile(p.id);
  assert.equal(stored.cookies[0].name, 'a');
  assert.equal(stored.changeIpUrl, 'https://rotate.test');
});

test('settings: chromium path and theme change independently', () => {
  const store = createStore(tmpDir());
  const initial = store.getSettings();
  assert.equal(initial.chromiumPath, null);
  assert.equal(initial.theme, 'system');
  assert.equal(initial.openCheckPage, true);
  assert.equal(initial.density, 'middle');
  assert.equal(initial.rememberWindow, true);

  store.setSettings({ chromiumPath: '/usr/bin/chromium' });
  store.setSettings({ theme: 'dark' });
  const changed = store.getSettings();
  assert.equal(changed.chromiumPath, '/usr/bin/chromium');
  assert.equal(changed.theme, 'dark');
  assert.equal(changed.openCheckPage, true);

  assert.throws(() => store.setSettings({ theme: 'neon' }), /theme must be/);
});

test('settings: density, window bounds, defaults and reset', () => {
  const store = createStore(tmpDir());
  store.setSettings({ density: 'small' });
  assert.equal(store.getSettings().density, 'small');
  assert.throws(() => store.setSettings({ density: 'huge' }), /density/);

  store.setSettings({ rememberWindow: false });
  assert.equal(store.getSettings().rememberWindow, false);

  store.setSettings({ window: { x: 10, y: 20, width: 1000, height: 700, maximized: true } });
  assert.deepEqual(store.getSettings().window, { x: 10, y: 20, width: 1000, height: 700, maximized: true });
  assert.throws(() => store.setSettings({ window: { x: 'a', y: 0, width: 1, height: 1 } }), /window bounds/);

  store.setSettings({ defaults: { kernel: 'firefox', os: 'macos', screen: '1366x768', timezone: 'ip', language: 'ip', randomFingerprint: true } });
  assert.deepEqual(store.getSettings().defaults, {
    kernel: 'firefox', os: 'macos', screen: '1366x768', timezone: 'ip', language: 'ip', randomFingerprint: true,
  });
  assert.throws(() => store.setSettings({ defaults: { kernel: 'nope' } }), /default kernel/);

  const reset = store.resetSettings();
  assert.equal(reset.density, 'middle');
  assert.equal(reset.rememberWindow, true);
  assert.deepEqual(reset.window, null);
  assert.equal(reset.defaults.kernel, 'chrome');
});

test('a new profile gets the default OS, user-agent and fingerprint', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({ name: 'Defaults' });
  assert.equal(p.os, 'windows');
  assert.deepEqual(p.userAgent, { mode: 'auto', value: '' });
  assert.equal(p.fingerprint.webRtc, 'proxy-udp');
  assert.equal(p.fingerprint.timezone.mode, 'real');
  assert.equal(p.fingerprint.screen.mode, 'auto');
  assert.deepEqual(Object.keys(p.fingerprint.noise).sort(), ['audioContext', 'canvas', 'clientRects', 'mediaDevice', 'speechVoices', 'webglImage']);
});

test('the OS, a custom user-agent and custom fingerprint values are stored', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({
    name: 'Custom',
    os: 'macos',
    userAgent: { mode: 'custom', value: 'Mozilla/5.0 (Macintosh) Chrome/151.0.0.0' },
    fingerprint: {
      webRtc: 'disabled',
      timezone: { mode: 'custom', value: 'Asia/Tehran' },
      language: { mode: 'custom', value: 'fa-IR' },
      displayLanguage: { mode: 'custom', value: 'fa-IR' },
      location: { mode: 'custom', latitude: 35.7, longitude: 51.4, prompt: 'allow' },
      screen: { mode: 'custom', width: 1600, height: 900 },
      webgl: { mode: 'custom', vendor: 'Apple Inc.', renderer: 'Apple M1' },
      webgpu: 'disabled',
      noise: { canvas: true, webglImage: true, audioContext: true, mediaDevice: false, clientRects: false, speechVoices: false },
      randomFingerprint: true,
    },
  });
  const stored = store.getProfile(p.id);
  assert.equal(stored.os, 'macos');
  assert.equal(stored.userAgent.mode, 'custom');
  assert.equal(stored.fingerprint.timezone.value, 'Asia/Tehran');
  assert.equal(stored.fingerprint.location.latitude, 35.7);
  assert.equal(stored.fingerprint.screen.width, 1600);
  assert.equal(stored.fingerprint.webgl.vendor, 'Apple Inc.');
  assert.equal(stored.fingerprint.noise.canvas, true);
  assert.equal(stored.fingerprint.randomFingerprint, true);
});

test('invalid OS, fingerprint and user-agent values are rejected', () => {
  const store = createStore(tmpDir());
  assert.throws(() => store.saveProfile({ name: 'x', os: 'beos' }), /OS must be one of/);
  assert.throws(() => store.saveProfile({ name: 'x', userAgent: { mode: 'custom', value: '  ' } }), /user-agent/);
  assert.throws(() => store.saveProfile({ name: 'x', fingerprint: { timezone: { mode: 'custom', value: 'Mars/Olympus' } } }), /unknown time zone/);
  assert.throws(() => store.saveProfile({ name: 'x', fingerprint: { webRtc: 'teleport' } }), /WebRTC mode/);
  assert.throws(() => store.saveProfile({ name: 'x', fingerprint: { location: { mode: 'custom' } } }), /latitude/);
  assert.throws(() => store.saveProfile({ name: 'x', fingerprint: { webgpu: 'quantum' } }), /WebGPU mode/);
});

test('an older store file without fingerprint fields still loads', () => {
  const dir = tmpDir();
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'store.json'), JSON.stringify({
    profiles: [{ id: 'p_old00001', name: 'Legacy', group: 'shop', proxy: null, startUrls: [], cookies: [], createdAt: 'x', updatedAt: 'x' }],
    proxies: [],
    settings: {},
  }));

  const store = createStore(dir);
  const [profile] = store.listProfiles();
  assert.equal(profile.name, 'Legacy');
  assert.equal(profile.os, 'windows');
  assert.deepEqual(profile.userAgent, { mode: 'auto', value: '' });
  assert.equal(profile.fingerprint.webRtc, 'proxy-udp');
  assert.equal(profile.notes, '');
});

test('saving a legacy profile through the new schema keeps working', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({
    name: 'Legacy edit',
    remark: 'from an old file',
    fingerprint: { timezone: { mode: 'ip' }, location: { mode: 'ip' }, language: { mode: 'ip' } },
  });
  const stored = store.getProfile(p.id);
  assert.equal(stored.fingerprint.timezone.mode, 'ip');
  assert.equal(stored.fingerprint.location.mode, 'ip');
});

test('hardware and font overrides are stored, clamped and validated', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({ name: 'Hardware', fingerprint: { hardware: { cpu: 8, ram: 16 }, fonts: { mode: 'macos' } } });
  const stored = store.getProfile(p.id);
  assert.deepEqual(stored.fingerprint.hardware, { cpu: 8, ram: 16 });
  assert.equal(stored.fingerprint.fonts.mode, 'macos');

  const clamped = store.saveProfile({ name: 'Clamped', fingerprint: { hardware: { cpu: 999, ram: -3 } } });
  assert.deepEqual(store.getProfile(clamped.id).fingerprint.hardware, { cpu: 64, ram: 1 });

  assert.throws(() => store.saveProfile({ name: 'Fonts', fingerprint: { fonts: { mode: 'amiga' } } }), /fonts mode/);
});

test('the check-page toggle can be turned off', () => {
  const store = createStore(tmpDir());
  assert.equal(store.getSettings().openCheckPage, true);
  store.setSettings({ openCheckPage: false });
  assert.equal(store.getSettings().openCheckPage, false);
});

test('kernel versions accept majors, semver and the snapshot marker', () => {
  assert.equal(normalizeBrowserVersion('latest'), 'latest');
  assert.equal(normalizeBrowserVersion('151'), '151');
  assert.equal(normalizeBrowserVersion('1.97.59'), '1.97.59');
  assert.equal(normalizeBrowserVersion('158.0.1'), '158.0.1');
  assert.equal(normalizeBrowserVersion('153.5.0esr'), '153.5.0esr');
  assert.throws(() => normalizeBrowserVersion('nightly'), /invalid browser version/);
});

test('a custom binary path is stored per profile', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({ name: 'Custom', executablePath: '/usr/bin/brave-browser' });
  assert.equal(store.getProfile(p.id).executablePath, '/usr/bin/brave-browser');
});

test('tags, preferences, 2FA and launch arguments are stored', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({
    name: 'Tagged',
    tags: ['shop', 'warmup', 'shop'],
    launchArgs: '--disable-gpu --lang=en-US',
    prefs: { blockImages: true, restorePages: false, savePasswords: false },
    totp: { secret: 'JBSWY3DPEHPK3PXP' },
  });
  const stored = store.getProfile(p.id);
  assert.deepEqual(stored.tags, ['shop', 'warmup']);
  assert.equal(stored.prefs.blockImages, true);
  assert.equal(stored.prefs.restorePages, false);
  assert.equal(stored.totp.secret, 'JBSWY3DPEHPK3PXP');
  assert.match(stored.launchArgs, /--disable-gpu/);

  assert.throws(() => store.saveProfile({ name: 'x', tags: Array.from({ length: 13 }, (_, i) => `t${i}`) }), /at most 12 tags/);
  assert.throws(() => store.saveProfile({ name: 'x', totp: { secret: 'not-base32!' } }), /base32/);
});

test('a profile can be duplicated and batch updated', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({ name: 'Original', group: 'a' });
  const copy = store.duplicateProfile(p.id);
  assert.notEqual(copy.id, p.id);
  assert.match(copy.name, /copy$/);
  assert.equal(store.listProfiles().length, 2);

  const changed = store.updateProfiles([p.id, copy.id], { group: 'b', tags: ['x'] });
  assert.equal(changed, 2);
  assert.equal(store.getProfile(p.id).group, 'b');
  assert.deepEqual(store.getProfile(copy.id).tags, ['x']);
});

test('profiles export and import round-trip', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({ name: 'Exported', group: 'g', tags: ['t'] });
  const payload = store.exportProfiles([p.id]);
  assert.equal(payload.profiles.length, 1);
  assert.equal(payload.profiles[0].deletedAt, undefined);

  const target = createStore(tmpDir());
  const imported = target.importProfiles(payload);
  assert.equal(imported.length, 1);
  assert.equal(target.listProfiles()[0].name, 'Exported');
  assert.throws(() => target.importProfiles({}), /not a profile export/);
});

test('opening a profile records the last opened time', () => {
  const store = createStore(tmpDir());
  const p = store.saveProfile({ name: 'Opened' });
  assert.equal(store.getProfile(p.id).lastOpenedAt, null);
  store.markOpened(p.id);
  assert.ok(store.getProfile(p.id).lastOpenedAt);
});

test('profiles get sequential numbers and keep them', () => {
  const store = createStore(tmpDir());
  const a = store.saveProfile({ name: 'A' });
  const b = store.saveProfile({ name: 'B' });
  const c = store.saveProfile({ name: 'C' });
  assert.deepEqual([a.number, b.number, c.number], [1, 2, 3]);

  const copy = store.duplicateProfile(b.id);
  assert.equal(copy.number, 4);

  store.trashProfile(c.id);
  store.purgeProfile(c.id);
  const d = store.saveProfile({ name: 'D' });
  assert.equal(d.number, 5, 'numbers are not reused after a purge');
});

test('older profiles are numbered on load', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'store.json');
  fs.writeFileSync(file, JSON.stringify({
    profiles: [
      { id: 'p_one', name: 'Old one' },
      { id: 'p_two', name: 'Old two' },
    ],
    proxies: [],
    settings: {},
  }));
  const store = createStore(dir);
  const profiles = store.listProfiles();
  assert.deepEqual(profiles.map((p) => p.number), [1, 2]);
  const next = store.saveProfile({ name: 'New' });
  assert.equal(next.number, 3);
});

test('update and autostart settings are stored', () => {
  const store = createStore(tmpDir());
  const initial = store.getSettings();
  assert.equal(initial.launchOnBoot, false);
  assert.deepEqual(initial.updates, { checkOnLaunch: true, autoDownload: true, installOnQuit: false });

  store.setSettings({ launchOnBoot: true });
  store.setSettings({ updates: { autoDownload: false, installOnQuit: true } });
  const changed = store.getSettings();
  assert.equal(changed.launchOnBoot, true);
  assert.deepEqual(changed.updates, { checkOnLaunch: true, autoDownload: false, installOnQuit: true });
});

test('saved proxies keep the checked location', () => {
  const store = createStore(tmpDir());
  const proxy = store.saveProxy({
    name: 'DE residential',
    type: 'http',
    host: 'de.example',
    port: 8000,
    location: { ip: '1.2.3.4', country: 'Germany', countryCode: 'de', city: 'Berlin' },
  });
  assert.deepEqual(proxy.location, {
    ip: '1.2.3.4', country: 'Germany', countryCode: 'DE', city: 'Berlin', checkedAt: proxy.location.checkedAt,
  });
  assert.equal(store.listProxies()[0].location.countryCode, 'DE');

  const unknown = store.saveProxy({ name: 'Unknown', type: 'http', host: 'x.example', port: 1, location: { countryCode: '??' } });
  assert.equal(unknown.location, null);

  const bulk = store.saveProxies([
    { name: 'A', type: 'http', host: 'a.example', port: 1 },
    { name: 'B', type: 'http', host: 'b.example', port: 2, location: { countryCode: 'NL', country: 'Netherlands', ip: '5.6.7.8' } },
  ]);
  assert.equal(bulk.length, 2);
  assert.equal(store.listProxies().length, 4);
});
