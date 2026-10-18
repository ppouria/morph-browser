const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  userAgentFor,
  uaMetadata,
  platformFor,
  resolveFingerprint,
  buildInjectionScript,
  flagsFor,
  MAJOR_OPTIONS,
} = require('../src/fingerprint');
const { normalizeFingerprint, DEFAULT_FINGERPRINT } = require('../src/store');

test('user agents match the platform and Chrome major', () => {
  assert.match(userAgentFor('windows', '151'), /Windows NT 10\.0; Win64; x64.*Chrome\/151\.0\.0\.0/);
  assert.match(userAgentFor('macos', '147'), /Macintosh; Intel Mac OS X.*Chrome\/147\.0\.0\.0/);
  assert.match(userAgentFor('linux', '141'), /X11; Linux x86_64.*Chrome\/141\.0\.0\.0/);
});

test('platform strings follow the OS', () => {
  assert.equal(platformFor('windows'), 'Win32');
  assert.equal(platformFor('macos'), 'MacIntel');
  assert.equal(platformFor('linux'), 'Linux x86_64');
});

test('real modes leave the timezone and location to the system', () => {
  const resolved = resolveFingerprint(normalizeFingerprint({}), { os: 'windows', major: '151' });
  assert.equal(resolved.timezone, null);
  assert.equal(resolved.location, null);
  assert.equal(resolved.screen, null);
  assert.equal(resolved.language, 'en-US');
  assert.equal(resolved.platform, 'Win32');
});

test('IP modes read the geo lookup result', () => {
  const fingerprint = normalizeFingerprint({
    timezone: { mode: 'ip' },
    language: { mode: 'ip' },
    location: { mode: 'ip' },
  });
  const resolved = resolveFingerprint(fingerprint, {
    os: 'linux',
    geo: { timezone: 'Europe/Berlin', countryCode: 'DE', latitude: 52.52, longitude: 13.4 },
  });
  assert.equal(resolved.timezone, 'Europe/Berlin');
  assert.equal(resolved.language, 'de');
  assert.deepEqual(resolved.location, { latitude: 52.52, longitude: 13.4 });
  assert.equal(resolved.displayLanguage, 'de');
});

test('custom timezone, screen and location win over the rest', () => {
  const fingerprint = normalizeFingerprint({
    timezone: { mode: 'custom', value: 'Asia/Tehran' },
    screen: { mode: 'custom', width: 1280, height: 720 },
    location: { mode: 'custom', latitude: 35.7, longitude: 51.4 },
  });
  const resolved = resolveFingerprint(fingerprint, { os: 'windows', geo: { timezone: 'UTC' } });
  assert.equal(resolved.timezone, 'Asia/Tehran');
  assert.deepEqual(resolved.screen, { width: 1280, height: 720 });
  assert.deepEqual(resolved.location, { latitude: 35.7, longitude: 51.4 });
});

test('the injected script carries the values the page can read', () => {
  const fingerprint = normalizeFingerprint({
    webgl: { mode: 'custom', vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, RTX 3060, D3D11)' },
    webRtc: 'disabled',
    webgpu: 'disabled',
    noise: { ...DEFAULT_FINGERPRINT.noise, canvas: true },
  });
  const resolved = resolveFingerprint(fingerprint, { os: 'macos', major: '151' });
  const script = buildInjectionScript({ fingerprint, resolved, seed: 42 });

  assert.match(script, /MacIntel/);
  assert.match(script, /Google Inc\. \(NVIDIA\)/);
  assert.match(script, /RTX 3060/);
  assert.match(script, /RTCPeerConnection/);
  assert.match(script, /toDataURL/);
  assert.match(script, /"seed":42/);
});

test('a script is generated even with every override off', () => {
  const fingerprint = normalizeFingerprint({});
  const resolved = resolveFingerprint(fingerprint, { os: 'windows' });
  const script = buildInjectionScript({ fingerprint, resolved, seed: 1 });
  assert.match(script, /navigator/);
  assert.match(script, /Win32/);
});

test('WebRTC modes map to the Chromium policy flags', () => {
  assert.deepEqual(flagsFor({ webRtc: 'real' }), []);
  assert.deepEqual(flagsFor({ webRtc: 'forward' }), []);
  assert.deepEqual(flagsFor({ webRtc: 'proxy-udp' }), ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp']);
  assert.deepEqual(flagsFor({ webRtc: 'disabled' }), ['--force-webrtc-ip-handling-policy=disable_non_proxied_udp']);
  assert.deepEqual(flagsFor({ webRtc: 'replace' }), ['--force-webrtc-ip-handling-policy=default_public_interface_only']);
});

test('the script is valid JavaScript for every combination of modes', () => {
  const vm = require('node:vm');
  for (const webRtc of ['forward', 'replace', 'real', 'disabled', 'proxy-udp']) {
    for (const location of ['real', 'ip', 'custom', 'block']) {
      const fingerprint = normalizeFingerprint({
        webRtc,
        location: location === 'custom' ? { mode: 'custom', latitude: 1, longitude: 2 } : { mode: location },
      });
      const resolved = resolveFingerprint(fingerprint, { os: 'linux', major: '151' });
      const script = buildInjectionScript({ fingerprint, resolved, seed: 7 });
      assert.doesNotThrow(() => new vm.Script(script), `webRtc=${webRtc} location=${location}`);
    }
  }
});

test('replace filters ICE candidates and block denies geolocation', () => {
  const fingerprint = normalizeFingerprint({ webRtc: 'replace', location: { mode: 'block' } });
  const resolved = resolveFingerprint(fingerprint, { os: 'windows' });
  const script = buildInjectionScript({ fingerprint, resolved, seed: 3 });
  assert.match(script, /icecandidate/);
  assert.match(script, /getCurrentPosition/);
  assert.match(script, /"locationBlock":true/);
});

test('the version list is fixed and newest first', () => {
  assert.ok(MAJOR_OPTIONS.length >= 10);
  assert.equal(MAJOR_OPTIONS[0], '155');
  const sorted = [...MAJOR_OPTIONS].sort((a, b) => Number(b) - Number(a));
  assert.deepEqual(MAJOR_OPTIONS, sorted);
  assert.ok(MAJOR_OPTIONS.every((major) => /^\d{2,3}$/.test(major)));
});

test('hardware and font overrides reach the injected script', () => {
  const fingerprint = normalizeFingerprint({ hardware: { cpu: 8, ram: 16 }, fonts: { mode: 'macos' } });
  const resolved = resolveFingerprint(fingerprint, { os: 'macos' });
  const script = buildInjectionScript({ fingerprint, resolved, seed: 5 });
  assert.match(script, /hardwareConcurrency/);
  assert.match(script, /deviceMemory/);
  assert.match(script, /document\.fonts/);
  assert.match(script, /Helvetica Neue/);
  assert.match(script, /"cpu":8/);
});

test('the default font mode injects no font list', () => {
  const fingerprint = normalizeFingerprint({});
  const resolved = resolveFingerprint(fingerprint, { os: 'windows' });
  const script = buildInjectionScript({ fingerprint, resolved, seed: 5 });
  assert.match(script, /"fonts":null/);
});

test('Client Hints metadata follows the spoofed user-agent', () => {
  const meta = uaMetadata({ userAgent: 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/147.0.7000.10 Safari/537.36', os: 'macos' });
  assert.equal(meta.platform, 'macOS');
  assert.equal(meta.fullVersion, '147.0.7000.10');
  assert.equal(meta.brands.find((brand) => brand.brand === 'Google Chrome').version, '147');
  assert.equal(meta.mobile, false);
});

test('the CDP overrides enable Page before registering the script', async () => {
  const { applyOverrides } = require('../src/cdp');
  const calls = [];
  const conn = { send: async (method) => { calls.push(method); return {}; } };
  await applyOverrides(conn, 'session-1', {
    script: 'window.__x = 1;',
    emulation: { timezone: 'Europe/Berlin', locale: 'de-DE', userAgent: 'UA', userAgentMetadata: {} },
  });
  const enableIndex = calls.indexOf('Page.enable');
  const addIndex = calls.indexOf('Page.addScriptToEvaluateOnNewDocument');
  assert.ok(enableIndex >= 0, 'Page.enable is sent');
  assert.ok(addIndex > enableIndex, 'the script is registered after Page.enable');
  assert.ok(calls.includes('Emulation.setUserAgentOverride'));
});
