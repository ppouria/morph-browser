const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { MAJOR_RE } = require('./browsers');

const PROXY_TYPES = ['http', 'https', 'socks5'];
const THEMES = ['system', 'light', 'dark'];
const OS_LIST = ['windows', 'macos', 'linux'];
const UA_MODES = ['auto', 'custom'];
const WEBRTC_MODES = ['forward', 'replace', 'real', 'disabled', 'proxy-udp'];
const TZ_MODES = ['real', 'ip', 'custom'];
const LOCATION_MODES = ['real', 'ip', 'custom', 'block'];
const LANGUAGE_MODES = ['real', 'ip', 'custom'];
const DISPLAY_MODES = ['language', 'real', 'custom'];
const SCREEN_MODES = ['auto', 'preset', 'custom'];
const WEBGL_MODES = ['real', 'custom'];
const WEBGPU_MODES = ['webgl', 'real', 'disabled'];
const FONT_MODES = ['default', 'windows', 'macos', 'linux'];
const MAX_START_URLS = 10;
const MAX_COOKIES = 500;
const SAME_SITE = { strict: 'Strict', lax: 'Lax', none: 'None', no_restriction: 'None' };
const DEFAULT_SETTINGS = { chromiumPath: null, theme: 'system', openCheckPage: true };

// Every profile carries a fingerprint block. The values decided here are applied at launch by
// chromium.js (command line flags) and cdp.js (DevTools emulation and the injected script).
const DEFAULT_FINGERPRINT = {
  webRtc: 'proxy-udp',
  timezone: { mode: 'real', value: 'UTC' },
  location: { mode: 'real', prompt: 'ask', latitude: null, longitude: null, accuracy: 100 },
  language: { mode: 'real', value: 'en-US' },
  displayLanguage: { mode: 'language', value: 'en-US' },
  screen: { mode: 'auto', preset: '1920x1080', width: 1920, height: 1080 },
  webgl: { mode: 'real', vendor: 'Google Inc. (AMD)', renderer: 'ANGLE (AMD, RENOIR (renoir LLVM 15.0.7), OpenGL 4.6)' },
  webgpu: 'webgl',
  hardware: { cpu: null, ram: null },
  fonts: { mode: 'default' },
  noise: { canvas: false, webglImage: false, audioContext: false, mediaDevice: true, clientRects: true, speechVoices: true },
  randomFingerprint: false,
};

function pickEnum(value, allowed, fallback, label) {
  const text = String(value ?? '').trim();
  if (!text) return fallback;
  if (!allowed.includes(text)) throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
  return text;
}

function clampNumber(value, min, max, fallback, round = true) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return round ? Math.round(clamped) : clamped;
}

// Input from the renderer is untrusted, so everything is validated here before it is stored.
function normalizeProxy(proxy) {
  if (!proxy || !proxy.host) return null;
  const port = Number(proxy.port);
  if (!PROXY_TYPES.includes(proxy.type)) throw new Error('proxy type must be http, https or socks5');
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('proxy port must be 1-65535');
  return {
    type: proxy.type,
    host: String(proxy.host).trim(),
    port,
    username: String(proxy.username || ''),
    password: String(proxy.password || ''),
  };
}

// The version is a major number, like 151. The full build is picked when the profile launches.
function normalizeBrowserVersion(version) {
  const text = String(version || '').trim();
  if (!text) return null;
  if (!MAJOR_RE.test(text)) throw new Error('Chromium version must be a major number, like 151');
  return text;
}

function normalizeStartUrls(input) {
  const lines = Array.isArray(input) ? input : String(input || '').split(/\r?\n/);
  const urls = lines.map((u) => String(u).trim()).filter(Boolean);
  if (urls.length > MAX_START_URLS) throw new Error(`at most ${MAX_START_URLS} start URLs`);
  for (const u of urls) {
    let parsed;
    try {
      parsed = new URL(u);
    } catch {
      throw new Error(`not a valid URL: ${u}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`start URLs must be http or https: ${u}`);
    }
  }
  return urls;
}

// Called before each launch. Only http or https is accepted, since the app makes the request itself.
function normalizeChangeIpUrl(value) {
  const text = String(value || '').trim();
  if (!text) return null;
  let parsed;
  try {
    parsed = new URL(text);
  } catch {
    throw new Error('Change IP URL is not a valid URL');
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') throw new Error('Change IP URL must be http or https');
  return text;
}

// Cookies are a JSON array, the shape browser cookie extensions export (expirationDate, sameSite and so on).
function normalizeCookies(input) {
  if (input === undefined || input === null || input === '') return [];
  let list = input;
  if (typeof input === 'string') {
    try {
      list = JSON.parse(input);
    } catch {
      throw new Error('cookies must be a JSON array');
    }
  }
  if (!Array.isArray(list)) throw new Error('cookies must be a JSON array');
  if (list.length > MAX_COOKIES) throw new Error(`at most ${MAX_COOKIES} cookies`);

  return list.map((c, i) => {
    if (!c || typeof c !== 'object') throw new Error(`cookie ${i + 1} is not an object`);
    const name = String(c.name || '');
    const domain = String(c.domain || '');
    if (!name || !domain) throw new Error(`cookie ${i + 1} needs a name and a domain`);
    const cookie = { name, value: String(c.value ?? ''), domain, path: String(c.path || '/') };
    if (c.secure) cookie.secure = true;
    if (c.httpOnly) cookie.httpOnly = true;
    const expires = typeof c.expirationDate === 'number' ? c.expirationDate : c.expires;
    if (typeof expires === 'number') cookie.expires = expires;
    const sameSite = SAME_SITE[String(c.sameSite || '').toLowerCase()];
    if (sameSite) cookie.sameSite = sameSite;
    return cookie;
  });
}

function normalizeUserAgent(input) {
  const mode = pickEnum(input && input.mode, UA_MODES, 'auto', 'user-agent mode');
  const value = mode === 'custom' ? String((input && input.value) || '').trim() : '';
  if (mode === 'custom' && !value) throw new Error('a custom user-agent cannot be empty');
  if (value.length > 400) throw new Error('user-agent is too long');
  return { mode, value };
}

function normalizeTimezone(input, fallback) {
  const source = input || {};
  const mode = pickEnum(source.mode, TZ_MODES, fallback.timezone.mode, 'timezone mode');
  const value = String(source.value || fallback.timezone.value).trim();
  if (mode === 'custom') {
    // Intl validates the zone name; an invalid one would only fail later, inside Chromium.
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: value });
    } catch {
      throw new Error(`unknown time zone: ${value}`);
    }
  }
  return { mode, value };
}

function normalizeLocation(input, fallback) {
  const source = input || {};
  const mode = pickEnum(source.mode, LOCATION_MODES, fallback.location.mode, 'location mode');
  const prompt = pickEnum(source.prompt, ['ask', 'allow'], fallback.location.prompt, 'location prompt');
  const latitude = source.latitude === null || source.latitude === undefined || source.latitude === ''
    ? null
    : clampNumber(source.latitude, -90, 90, null, false);
  const longitude = source.longitude === null || source.longitude === undefined || source.longitude === ''
    ? null
    : clampNumber(source.longitude, -180, 180, null, false);
  const accuracy = clampNumber(source.accuracy, 1, 100000, fallback.location.accuracy);
  if (mode === 'custom' && (latitude === null || longitude === null)) {
    throw new Error('custom location needs a latitude and a longitude');
  }
  return { mode, prompt, latitude, longitude, accuracy };
}

function normalizeScreen(input, fallback) {
  const source = input || {};
  const mode = pickEnum(source.mode, SCREEN_MODES, fallback.screen.mode, 'screen mode');
  const preset = /^\d{3,4}x\d{3,4}$/.test(String(source.preset || ''))
    ? String(source.preset)
    : fallback.screen.preset;
  const width = clampNumber(source.width, 320, 7680, fallback.screen.width);
  const height = clampNumber(source.height, 240, 4320, fallback.screen.height);
  return { mode, preset, width, height };
}

function normalizeWebgl(input, fallback) {
  const source = input || {};
  const mode = pickEnum(source.mode, WEBGL_MODES, fallback.webgl.mode, 'WebGL mode');
  const vendor = String(source.vendor || fallback.webgl.vendor).slice(0, 200);
  const renderer = String(source.renderer || fallback.webgl.renderer).slice(0, 300);
  return { mode, vendor, renderer };
}

function normalizeHardware(input) {
  const source = input || {};
  const cpu = source.cpu === null || source.cpu === undefined || source.cpu === '' ? null : clampNumber(source.cpu, 1, 64, null);
  const ram = source.ram === null || source.ram === undefined || source.ram === '' ? null : clampNumber(source.ram, 1, 64, null);
  return { cpu, ram };
}

function normalizeFonts(input) {
  const source = input || {};
  return { mode: pickEnum(source.mode, FONT_MODES, 'default', 'fonts mode') };
}

function normalizeNoise(input, fallback) {
  const source = input || {};
  const noise = {};
  for (const key of Object.keys(fallback.noise)) {
    noise[key] = typeof source[key] === 'boolean' ? source[key] : fallback.noise[key];
  }
  return noise;
}

function normalizeFingerprint(input) {
  const source = input || {};
  return {
    webRtc: pickEnum(source.webRtc, WEBRTC_MODES, DEFAULT_FINGERPRINT.webRtc, 'WebRTC mode'),
    timezone: normalizeTimezone(source.timezone, DEFAULT_FINGERPRINT),
    location: normalizeLocation(source.location, DEFAULT_FINGERPRINT),
    language: {
      mode: pickEnum(source.language && source.language.mode, LANGUAGE_MODES, DEFAULT_FINGERPRINT.language.mode, 'language mode'),
      value: String((source.language && source.language.value) || DEFAULT_FINGERPRINT.language.value).trim(),
    },
    displayLanguage: {
      mode: pickEnum(source.displayLanguage && source.displayLanguage.mode, DISPLAY_MODES, DEFAULT_FINGERPRINT.displayLanguage.mode, 'display language mode'),
      value: String((source.displayLanguage && source.displayLanguage.value) || DEFAULT_FINGERPRINT.displayLanguage.value).trim(),
    },
    screen: normalizeScreen(source.screen, DEFAULT_FINGERPRINT),
    webgl: normalizeWebgl(source.webgl, DEFAULT_FINGERPRINT),
    webgpu: pickEnum(source.webgpu, WEBGPU_MODES, DEFAULT_FINGERPRINT.webgpu, 'WebGPU mode'),
    hardware: normalizeHardware(source.hardware),
    fonts: normalizeFonts(source.fonts),
    noise: normalizeNoise(source.noise, DEFAULT_FINGERPRINT),
    randomFingerprint: typeof source.randomFingerprint === 'boolean'
      ? source.randomFingerprint
      : DEFAULT_FINGERPRINT.randomFingerprint,
  };
}

function requireText(value, label, max) {
  const text = String(value || '').trim();
  if (!text) throw new Error(`${label} is required`);
  if (text.length > max) throw new Error(`${label} is too long`);
  return text;
}

// Older store files predate the fingerprint fields, so a load fills them in without rejecting the file.
function withDefaults(profile) {
  return {
    ...profile,
    os: OS_LIST.includes(profile.os) ? profile.os : 'windows',
    userAgent: normalizeUserAgent(profile.userAgent || { mode: 'auto', value: '' }),
    fingerprint: normalizeFingerprint(profile.fingerprint),
    notes: profile.notes || profile.remark || '',
    group: profile.group || '',
  };
}

// Profiles, saved proxies and settings live in one JSON file. Writes go through a temp file so a crash cannot leave it half-written.
function createStore(dir) {
  const file = path.join(dir, 'store.json');

  function load() {
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (err) {
      if (err.code === 'ENOENT') return { profiles: [], proxies: [], settings: { ...DEFAULT_SETTINGS } };
      throw err;
    }
    return {
      profiles: (parsed.profiles || []).map(withDefaults),
      proxies: parsed.proxies || [],
      settings: { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) },
    };
  }

  function save(data) {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data, null, 2));
    fs.renameSync(`${file}.tmp`, file);
  }

  return {
    listProfiles() {
      return load().profiles;
    },

    getProfile(id) {
      return load().profiles.find((p) => p.id === id) || null;
    },

    saveProfile(input) {
      const data = load();
      const existing = input.id ? data.profiles.find((p) => p.id === input.id) : null;
      const now = new Date().toISOString();
      const profile = {
        id: existing ? existing.id : `p_${crypto.randomBytes(4).toString('hex')}`,
        name: requireText(input.name, 'profile name', 100),
        group: String(input.group || '').trim().slice(0, 60),
        notes: String(input.notes || '').slice(0, 2000),
        os: pickEnum(input.os, OS_LIST, 'windows', 'OS'),
        userAgent: normalizeUserAgent(input.userAgent),
        proxy: normalizeProxy(input.proxy),
        browserVersion: normalizeBrowserVersion(input.browserVersion),
        startUrls: normalizeStartUrls(input.startUrls),
        cookies: normalizeCookies(input.cookies),
        changeIpUrl: normalizeChangeIpUrl(input.changeIpUrl),
        fingerprint: normalizeFingerprint(input.fingerprint),
        createdAt: existing ? existing.createdAt : now,
        updatedAt: now,
      };
      if (existing) {
        data.profiles[data.profiles.indexOf(existing)] = profile;
      } else {
        data.profiles.push(profile);
      }
      save(data);
      return profile;
    },

    deleteProfile(id) {
      const data = load();
      data.profiles = data.profiles.filter((p) => p.id !== id);
      save(data);
    },

    listProxies() {
      return load().proxies;
    },

    // A saved proxy is a named copy of the proxy fields, so profiles can reuse it from a dropdown.
    saveProxy(input) {
      const data = load();
      const existing = input.id ? data.proxies.find((p) => p.id === input.id) : null;
      const proxy = normalizeProxy(input);
      if (!proxy) throw new Error('proxy host is required');
      const entry = {
        id: existing ? existing.id : `x_${crypto.randomBytes(4).toString('hex')}`,
        name: requireText(input.name, 'proxy name', 100),
        ...proxy,
      };
      if (existing) {
        data.proxies[data.proxies.indexOf(existing)] = entry;
      } else {
        data.proxies.push(entry);
      }
      save(data);
      return entry;
    },

    deleteProxy(id) {
      const data = load();
      data.proxies = data.proxies.filter((p) => p.id !== id);
      save(data);
    },

    getSettings() {
      return load().settings;
    },

    // Only the keys present in the patch change.
    setSettings(patch) {
      const data = load();
      if ('chromiumPath' in patch) data.settings.chromiumPath = patch.chromiumPath || null;
      if ('theme' in patch) {
        if (!THEMES.includes(patch.theme)) throw new Error('theme must be system, light or dark');
        data.settings.theme = patch.theme;
      }
      if ('openCheckPage' in patch) data.settings.openCheckPage = Boolean(patch.openCheckPage);
      save(data);
      return data.settings;
    },
  };
}

module.exports = {
  createStore,
  normalizeProxy,
  normalizeBrowserVersion,
  normalizeStartUrls,
  normalizeCookies,
  normalizeChangeIpUrl,
  normalizeUserAgent,
  normalizeFingerprint,
  normalizeScreen,
  DEFAULT_FINGERPRINT,
  DEFAULT_SETTINGS,
  OS_LIST,
  UA_MODES,
  WEBRTC_MODES,
  SCREEN_MODES,
  THEMES,
};
