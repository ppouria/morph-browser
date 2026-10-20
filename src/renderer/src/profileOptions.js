// Option lists and draft builders shared by the profile dialog.

export const KERNEL_OPTIONS = [
  { value: 'chrome', label: 'Google Chrome', note: 'official build' },
  { value: 'fingerprint', label: 'Fingerprint Chromium', note: 'native spoofing' },
];

export const KERNEL_LABELS = { chrome: 'Google Chrome', fingerprint: 'Fingerprint Chromium' };

export const OS_OPTIONS = [
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'android', label: 'Android (emulated)' },
];

export const OS_LABELS = { windows: 'Windows', macos: 'macOS', linux: 'Linux', android: 'Android (emulated)' };

// Kept in sync with src/android.js. The full device values are stored in the profile, so the
// launch path only needs the stored object.
export const ANDROID_DEVICES = [
  {
    id: 'pixel-8', label: 'Pixel 8 · Android 14', model: 'Pixel 8', androidVersion: '14', platformVersion: '14.0.0',
    width: 412, height: 915, dpr: 2.625, gpuVendor: 'ARM', gpuRenderer: 'Mali-G715', cpu: 9, ram: 8,
  },
  {
    id: 'pixel-8-pro', label: 'Pixel 8 Pro · Android 14', model: 'Pixel 8 Pro', androidVersion: '14', platformVersion: '14.0.0',
    width: 448, height: 998, dpr: 2.625, gpuVendor: 'ARM', gpuRenderer: 'Mali-G715', cpu: 9, ram: 12,
  },
  {
    id: 'pixel-7', label: 'Pixel 7 · Android 14', model: 'Pixel 7', androidVersion: '14', platformVersion: '14.0.0',
    width: 412, height: 915, dpr: 2.625, gpuVendor: 'ARM', gpuRenderer: 'Mali-G710', cpu: 8, ram: 8,
  },
  {
    id: 'galaxy-s24', label: 'Galaxy S24 · Android 14', model: 'SM-S921B', androidVersion: '14', platformVersion: '14.0.0',
    width: 360, height: 780, dpr: 3, gpuVendor: 'Qualcomm', gpuRenderer: 'Adreno (TM) 750', cpu: 8, ram: 8,
  },
  {
    id: 'galaxy-s23', label: 'Galaxy S23 · Android 13', model: 'SM-S911B', androidVersion: '13', platformVersion: '13.0.0',
    width: 360, height: 780, dpr: 3, gpuVendor: 'Qualcomm', gpuRenderer: 'Adreno (TM) 740', cpu: 8, ram: 8,
  },
  {
    id: 'xiaomi-13', label: 'Xiaomi 13 · Android 13', model: '2211133G', androidVersion: '13', platformVersion: '13.0.0',
    width: 393, height: 873, dpr: 2.75, gpuVendor: 'Qualcomm', gpuRenderer: 'Adreno (TM) 740', cpu: 8, ram: 8,
  },
];

export const DEFAULT_ANDROID = { ...ANDROID_DEVICES[0] };

export const WEBRTC_OPTIONS = [
  { value: 'forward', label: 'Forward' },
  { value: 'replace', label: 'Replace' },
  { value: 'real', label: 'Real' },
  { value: 'disabled', label: 'Disabled' },
  { value: 'proxy-udp', label: 'Proxy UDP' },
];

export const TZ_OPTIONS = [
  { value: 'real', label: 'Real' },
  { value: 'ip', label: 'Based on IP' },
  { value: 'custom', label: 'Custom' },
];

export const LOCATION_OPTIONS = [
  { value: 'real', label: 'Real' },
  { value: 'ip', label: 'Based on IP' },
  { value: 'custom', label: 'Custom' },
  { value: 'block', label: 'Block' },
];

export const LANGUAGE_OPTIONS = [
  { value: 'real', label: 'Real' },
  { value: 'ip', label: 'Based on IP' },
  { value: 'custom', label: 'Custom' },
];

export const DISPLAY_OPTIONS = [
  { value: 'language', label: 'Based on language' },
  { value: 'real', label: 'Real' },
  { value: 'custom', label: 'Custom' },
];

export const SCREEN_OPTIONS = [
  { value: 'auto', label: 'Default' },
  { value: 'preset', label: 'Predefined' },
  { value: 'custom', label: 'Custom' },
];

export const SCREEN_PRESETS = ['1280x720', '1366x768', '1440x900', '1536x864', '1600x900', '1920x1080', '2560x1440', '3840x2160']
  .map((value) => ({ value, label: value.replace('x', ' × ') }));

export const FONT_OPTIONS = [
  { value: 'default', label: 'Default' },
  { value: 'windows', label: 'Windows' },
  { value: 'macos', label: 'macOS' },
  { value: 'linux', label: 'Linux' },
  { value: 'android', label: 'Android' },
];

export const CPU_OPTIONS = [
  { value: '', label: 'Real' },
  ...[2, 4, 6, 8, 12, 16, 24, 32].map((n) => ({ value: String(n), label: `${n} cores` })),
];

export const RAM_OPTIONS = [
  { value: '', label: 'Real' },
  ...[2, 4, 8].map((n) => ({ value: String(n), label: `${n} GB` })),
];

export const WEBGL_OPTIONS = [
  { value: 'real', label: 'Real' },
  { value: 'custom', label: 'Custom' },
];

export const WEBGPU_OPTIONS = [
  { value: 'webgl', label: 'Based on WebGL' },
  { value: 'real', label: 'Real' },
  { value: 'disabled', label: 'Disabled' },
];

export const NOISE_OPTIONS = [
  { value: 'canvas', label: 'Canvas' },
  { value: 'webglImage', label: 'WebGL image' },
  { value: 'audioContext', label: 'AudioContext' },
  { value: 'mediaDevice', label: 'Media devices' },
  { value: 'clientRects', label: 'Client rects' },
  { value: 'speechVoices', label: 'Speech voices' },
];

export const VENDORS = [
  'Google Inc. (AMD)',
  'Google Inc. (Intel)',
  'Google Inc. (NVIDIA)',
  'Apple Inc.',
  'Qualcomm',
  'ARM',
];

export const RENDERERS = [
  'ANGLE (AMD, RENOIR (renoir LLVM 15.0.7), OpenGL 4.6)',
  'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
  'ANGLE (AMD, AMD Radeon RX 6600 (radeonsi, navi23), OpenGL 4.6)',
  'Apple M1 (8 cores)',
  'Mali-G78 MP14',
];

export const GPU_PAIRS = [
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, RENOIR (renoir LLVM 15.0.7), OpenGL 4.6)' },
  { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6600 (radeonsi, navi23), OpenGL 4.6)' },
  { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  { vendor: 'Apple Inc.', renderer: 'Apple M1 (8 cores)' },
  { vendor: 'Qualcomm', renderer: 'Adreno (TM) 730' },
  { vendor: 'ARM', renderer: 'Mali-G78 MP14' },
];

// A macOS profile with an NVIDIA desktop GPU is an instant inconsistency, so random values are
// drawn from a platform-appropriate set.
export const GPU_BY_OS = {
  windows: [
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6600 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Intel(R) UHD Graphics 620 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce GTX 1660 SUPER Direct3D11 vs_5_0 ps_5_0, D3D11)' },
  ],
  macos: [
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1, Unspecified Version)' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M2, Unspecified Version)' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M3, Unspecified Version)' },
    { vendor: 'Google Inc. (Apple)', renderer: 'ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version)' },
  ],
  linux: [
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 6600 (radeonsi, navi23), OpenGL 4.6)' },
    { vendor: 'Google Inc. (Intel)', renderer: 'ANGLE (Intel, Mesa Intel(R) UHD Graphics 620 (KBL GT2), OpenGL 4.6)' },
    { vendor: 'Google Inc. (NVIDIA)', renderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 (nouveau), OpenGL 4.6)' },
    { vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, AMD Radeon RX 580 (polaris10), OpenGL 4.6)' },
  ],
};

export function randomizeFingerprint(fingerprint, os) {
  const pick = (list) => list[Math.floor(Math.random() * list.length)];
  const gpu = pick(GPU_BY_OS[os] || GPU_BY_OS.windows);
  const screen = pick(SCREEN_PRESETS).value;
  return {
    ...fingerprint,
    webgl: { mode: 'custom', vendor: gpu.vendor, renderer: gpu.renderer },
    screen: { ...fingerprint.screen, mode: 'preset', preset: screen },
    hardware: { cpu: pick([4, 6, 8, 12, 16]), ram: pick([4, 8]) },
    fonts: { mode: os },
    noise: { canvas: true, webglImage: true, audioContext: true, mediaDevice: true, clientRects: true, speechVoices: true },
  };
}

export function blankFingerprint() {
  return {
    webRtc: 'proxy-udp',
    timezone: { mode: 'real', value: 'UTC' },
    location: { mode: 'real', prompt: 'ask', latitude: null, longitude: null, accuracy: 100 },
    language: { mode: 'real', value: 'en-US' },
    displayLanguage: { mode: 'language', value: 'en-US' },
    screen: { mode: 'auto', preset: '1920x1080', width: 1920, height: 1080 },
    webgl: { mode: 'real', vendor: VENDORS[0], renderer: RENDERERS[0] },
    webgpu: 'webgl',
    hardware: { cpu: null, ram: null },
    fonts: { mode: 'default' },
    noise: { canvas: false, webglImage: false, audioContext: false, mediaDevice: true, clientRects: true, speechVoices: true },
    android: DEFAULT_ANDROID,
    randomFingerprint: false,
  };
}

export function blankDraft() {
  return {
    name: '',
    number: null,
    group: '',
    tags: '',
    notes: '',
    kernel: 'chrome',
    os: 'windows',
    uaValue: '',
    browserVersion: '',
    startUrls: '',
    cookies: '',
    changeIpUrl: '',
    fallbackMode: 'none',
    fallbackSaved: '',
    fallbackType: 'http',
    fallbackHostPort: '',
    fallbackUser: '',
    fallbackPass: '',
    executablePath: '',
    launchArgs: '',
    prefs: { blockImages: false, restorePages: true, savePasswords: true },
    totpSecret: '',
    proxyMode: 'custom',
    savedProxy: '',
    proxyType: 'http',
    hostPort: '',
    proxyUser: '',
    proxyPass: '',
    fingerprint: blankFingerprint(),
  };
}

export function draftFromProfile(profile) {
  if (!profile) return blankDraft();
  const base = blankFingerprint();
  const fp = profile.fingerprint || {};
  return {
    name: profile.name,
    number: profile.number || null,
    group: profile.group || '',
    tags: (profile.tags || []).join(', '),
    notes: profile.notes || '',
    kernel: profile.kernel || 'chrome',
    os: profile.os || 'windows',
    uaValue: profile.userAgent && profile.userAgent.mode === 'custom' ? profile.userAgent.value : '',
    browserVersion: profile.browserVersion || '',
    startUrls: (profile.startUrls || []).join('\n'),
    cookies: profile.cookies && profile.cookies.length ? JSON.stringify(profile.cookies, null, 2) : '',
    changeIpUrl: profile.changeIpUrl || '',
    fallbackMode: profile.fallback && profile.fallback.mode === 'proxy' ? 'custom' : 'none',
    fallbackSaved: '',
    fallbackType: (profile.fallback && profile.fallback.proxy && profile.fallback.proxy.type) || 'http',
    fallbackHostPort: profile.fallback && profile.fallback.proxy ? `${profile.fallback.proxy.host}:${profile.fallback.proxy.port}` : '',
    fallbackUser: (profile.fallback && profile.fallback.proxy && profile.fallback.proxy.username) || '',
    fallbackPass: (profile.fallback && profile.fallback.proxy && profile.fallback.proxy.password) || '',
    executablePath: profile.executablePath || '',
    launchArgs: profile.launchArgs || '',
    prefs: { ...blankDraft().prefs, ...(profile.prefs || {}) },
    totpSecret: profile.totp ? profile.totp.secret : '',
    proxyMode: 'custom',
    savedProxy: '',
    proxyType: profile.proxy ? profile.proxy.type : 'http',
    hostPort: profile.proxy ? `${profile.proxy.host}:${profile.proxy.port}` : '',
    proxyUser: profile.proxy ? profile.proxy.username : '',
    proxyPass: profile.proxy ? profile.proxy.password : '',
    fingerprint: {
      ...base,
      ...fp,
      timezone: { ...base.timezone, ...(fp.timezone || {}) },
      location: { ...base.location, ...(fp.location || {}) },
      language: { ...base.language, ...(fp.language || {}) },
      displayLanguage: { ...base.displayLanguage, ...(fp.displayLanguage || {}) },
      screen: { ...base.screen, ...(fp.screen || {}) },
      webgl: { ...base.webgl, ...(fp.webgl || {}) },
      hardware: { ...base.hardware, ...(fp.hardware || {}) },
      fonts: { ...base.fonts, ...(fp.fonts || {}) },
      noise: { ...base.noise, ...(fp.noise || {}) },
      android: { ...base.android, ...(fp.android || {}) },
    },
  };
}

export function userAgentFor(os, major, android = DEFAULT_ANDROID) {
  const chrome = `${major || '151'}.0.0.0`;
  if (os === 'android') {
    return `Mozilla/5.0 (Linux; Android ${android.androidVersion}; ${android.model}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Mobile Safari/537.36`;
  }
  if (os === 'macos') return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
  if (os === 'linux') return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}
