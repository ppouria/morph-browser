const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  userAgentFor,
  uaMetadata,
  platformFor,
  resolveFingerprint,
  languageForCountry,
  buildInjectionScript,
  flagsFor,
  buildKernelFlags,
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
  assert.equal(resolved.language, 'de-DE');
  assert.deepEqual(resolved.location, { latitude: 52.52, longitude: 13.4 });
  assert.equal(resolved.displayLanguage, 'de-DE');
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

test('kernel flags carry the native spoofing settings', () => {
  const fingerprint = normalizeFingerprint({
    webRtc: 'proxy-udp',
    hardware: { cpu: 8, ram: 8 },
    timezone: { mode: 'custom', value: 'Europe/Berlin' },
    language: { mode: 'custom', value: 'de-DE' },
  });
  const resolved = resolveFingerprint(fingerprint, { os: 'windows', major: '150' });
  const args = buildKernelFlags({ fingerprint, resolved, os: 'windows', seed: 12345, major: '150' });

  assert.ok(args.includes('--fingerprint=12345'));
  assert.ok(args.includes('--fingerprint-platform=windows'));
  assert.ok(args.includes('--fingerprint-brand=Chrome'));
  assert.ok(args.includes('--fingerprint-brand-version=150.0.0.0'));
  assert.ok(args.includes('--fingerprint-hardware-concurrency=8'));
  assert.ok(args.includes('--timezone=Europe/Berlin'));
  assert.ok(args.includes('--accept-lang=de-DE,de,en-US,en'));
  assert.ok(args.includes('--disable-non-proxied-udp'));
});

test('a custom user-agent drops the brand flags and real WebRTC drops the UDP policy', () => {
  const fingerprint = normalizeFingerprint({ webRtc: 'real' });
  const resolved = resolveFingerprint(fingerprint, { os: 'macos' });
  const args = buildKernelFlags({ fingerprint, resolved, os: 'macos', seed: 7, customUserAgent: true });
  assert.ok(!args.some((arg) => arg.startsWith('--fingerprint-brand')));
  assert.ok(!args.includes('--disable-non-proxied-udp'));
});

test('the native kernel script leaves platform and language to the browser', () => {
  const fingerprint = normalizeFingerprint({});
  const resolved = resolveFingerprint(fingerprint, { os: 'windows', major: '150' });
  const script = buildInjectionScript({ fingerprint, resolved, seed: 3, native: true });
  assert.match(script, /"platform":null/);
  assert.match(script, /"language":null/);
  assert.match(script, /"fonts":null/);
  assert.match(script, /if \(C\.platform\)/);
});

test('android identities agree across the UA, Client Hints and display', () => {
  const ua = userAgentFor('android', '155');
  assert.match(ua, /Linux; Android 10; K/);
  assert.match(ua, /Chrome\/155\.0\.0\.0 Mobile Safari/);

  const meta = uaMetadata({ userAgent: ua, os: 'android' });
  assert.equal(meta.platform, 'Android');
  assert.equal(meta.mobile, true);
  assert.equal(meta.model, 'Pixel 8');
  assert.equal(meta.platformVersion, '14.0.0');
  assert.equal(meta.architecture, 'arm');
  assert.equal(meta.bitness, '64');

  const fingerprint = normalizeFingerprint({ android: { device: 'galaxy-s24' } });
  const resolved = resolveFingerprint(fingerprint, { os: 'android', major: '155' });
  assert.equal(resolved.platform, 'Linux armv8l');
  assert.deepEqual(resolved.screen, { width: 360, height: 780, dpr: 3 });
  assert.equal(resolved.mobile.model, 'SM-S921B');

  const script = buildInjectionScript({ fingerprint, resolved, seed: 9 });
  assert.match(script, /maxTouchPoints/);
  assert.match(script, /ontouchstart/);
  assert.match(script, /matchMedia/);
  assert.match(script, /Mali|Adreno/);
});

test('automatic geo alignment follows the proxy country for real fields', () => {
  const fingerprint = normalizeFingerprint({});
  const geo = { timezone: 'Europe/Berlin', countryCode: 'DE', latitude: 52.52, longitude: 13.4 };
  const aligned = resolveFingerprint(fingerprint, { os: 'windows', geo, autoGeo: true });
  assert.equal(aligned.timezone, 'Europe/Berlin');
  assert.equal(aligned.language, 'de-DE');
  assert.deepEqual(aligned.location, { latitude: 52.52, longitude: 13.4 });

  const real = resolveFingerprint(fingerprint, { os: 'windows', geo, autoGeo: false });
  assert.equal(real.timezone, null);
  assert.equal(real.language, 'en-US');
  assert.equal(real.location, null);

  const custom = normalizeFingerprint({
    timezone: { mode: 'custom', value: 'America/New_York' },
    language: { mode: 'custom', value: 'fr-FR' },
    location: { mode: 'block' },
  });
  const kept = resolveFingerprint(custom, { os: 'windows', geo, autoGeo: true });
  assert.equal(kept.timezone, 'America/New_York');
  assert.equal(kept.language, 'fr-FR');
  assert.equal(kept.location, null);
});

test('country codes map to real browser language tags', () => {
  assert.equal(languageForCountry('DE'), 'de-DE');
  assert.equal(languageForCountry('US'), 'en-US');
  assert.equal(languageForCountry('BR'), 'pt-BR');
  assert.equal(languageForCountry('ZZ'), 'en-US');
});
