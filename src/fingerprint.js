const { OS_LIST } = require('./store');

// Chrome majors this app offers. The list is fixed on purpose: a profile can only pick a major
// that Google publishes a Linux .deb for, and the newest matching build is resolved at launch.
const MAJOR_OPTIONS = ['155', '154', '153', '152', '151', '150', '149', '148', '147', '146', '145', '144', '143', '142', '141'];

const OS_LABELS = { windows: 'Windows', macos: 'macOS', linux: 'Linux' };

// Font families a page can probe with document.fonts.check. A preset makes a profile answer like
// the matching OS instead of echoing whatever this machine has installed.
const FONT_PRESETS = {
  windows: [
    'Arial', 'Arial Black', 'Bahnschrift', 'Calibri', 'Cambria', 'Candara', 'Comic Sans MS', 'Consolas',
    'Constantia', 'Corbel', 'Courier New', 'Ebrima', 'Franklin Gothic Medium', 'Gabriola', 'Gadugi',
    'Georgia', 'Impact', 'Ink Free', 'Lucida Console', 'Lucida Sans Unicode', 'Malgun Gothic',
    'Microsoft YaHei', 'MS Gothic', 'Palatino Linotype', 'Segoe UI', 'Tahoma', 'Times New Roman',
    'Trebuchet MS', 'Verdana',
  ],
  macos: [
    'Arial', 'Arial Black', 'Avenir', 'Avenir Next', 'Baskerville', 'Charter', 'Courier New', 'Futura',
    'Geneva', 'Georgia', 'Helvetica', 'Helvetica Neue', 'Hoefler Text', 'Lucida Grande', 'Menlo',
    'Monaco', 'Optima', 'Palatino', 'San Francisco', 'SF Pro Text', 'Times New Roman', 'Trebuchet MS',
    'Verdana',
  ],
  linux: [
    'Arial', 'Cantarell', 'Courier New', 'DejaVu Sans', 'DejaVu Sans Mono', 'DejaVu Serif', 'FreeSans',
    'FreeSerif', 'Liberation Mono', 'Liberation Sans', 'Liberation Serif', 'Noto Sans', 'Noto Serif',
    'Times New Roman', 'Ubuntu', 'Verdana',
  ],
};

// Client Hints metadata for a custom user-agent. Without it, Sec-CH-UA keeps reporting the real
// binary and gives the spoof away.
function uaMetadata({ userAgent = '', os = 'windows' } = {}) {
  const match = /Chrome\/([\d.]+)/.exec(userAgent) || [];
  const parts = (match[1] || '').split('.').filter(Boolean);
  const major = parts[0] || '151';
  const full = parts.length >= 3 ? match[1] : `${major}.0.0.0`;
  const platform = os === 'macos' ? 'macOS' : os === 'linux' ? 'Linux' : 'Windows';
  const platformVersion = os === 'macos' ? '14.0.0' : os === 'linux' ? '6.5.0' : '10.0.0';
  return {
    brands: [
      { brand: 'Chromium', version: major },
      { brand: 'Google Chrome', version: major },
      { brand: 'Not?A_Brand', version: '99' },
    ],
    fullVersionList: [
      { brand: 'Chromium', version: full },
      { brand: 'Google Chrome', version: full },
      { brand: 'Not?A_Brand', version: '99.0.0.0' },
    ],
    fullVersion: full,
    platform,
    platformVersion,
    architecture: 'x86',
    bitness: '64',
    model: '',
    mobile: false,
    wow64: false,
  };
}

// A user-agent is a request header, so it is set with a Chromium flag and nothing needs injecting.
function userAgentFor(os, major) {
  const chrome = `${major || '151'}.0.0.0`;
  if (os === 'macos') {
    return `Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
  }
  if (os === 'linux') {
    return `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
  }
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chrome} Safari/537.36`;
}

function platformFor(os) {
  if (os === 'macos') return 'MacIntel';
  if (os === 'linux') return 'Linux x86_64';
  return 'Win32';
}

// Turns the stored mode into the values Chromium is actually launched with. "ip" leaves the
// decision to the geo lookup in main.js, which fills the resolved object in before launch.
function resolveFingerprint(fingerprint, { os = 'windows', major = null, geo = null } = {}) {
  const tz = fingerprint.timezone.mode === 'custom'
    ? fingerprint.timezone.value
    : fingerprint.timezone.mode === 'ip' && geo && geo.timezone
      ? geo.timezone
      : null;

  const languageMode = fingerprint.language.mode;
  const language = languageMode === 'custom'
    ? fingerprint.language.value
    : languageMode === 'ip' && geo && geo.countryCode
      ? geo.countryCode.toLowerCase()
      : 'en-US';

  const display = fingerprint.displayLanguage.mode === 'custom'
    ? fingerprint.displayLanguage.value
    : fingerprint.displayLanguage.mode === 'language'
      ? language
      : 'en-US';

  const location = fingerprint.location.mode === 'custom'
    ? { latitude: fingerprint.location.latitude, longitude: fingerprint.location.longitude }
    : fingerprint.location.mode === 'ip' && geo && Number.isFinite(geo.latitude)
      ? { latitude: geo.latitude, longitude: geo.longitude }
      : null;

  const screen = fingerprint.screen.mode === 'custom'
    ? { width: fingerprint.screen.width, height: fingerprint.screen.height }
    : fingerprint.screen.mode === 'preset'
      ? parsePreset(fingerprint.screen.preset)
      : null;

  return {
    timezone: tz,
    language,
    languages: [language],
    displayLanguage: display,
    location,
    screen,
    platform: platformFor(os),
  };
}

function parsePreset(preset) {
  const match = /^(\d{3,4})x(\d{3,4})$/.exec(String(preset || ''));
  if (!match) return null;
  return { width: Number(match[1]), height: Number(match[2]) };
}

function flagsFor(fingerprint) {
  const args = [];
  switch (fingerprint.webRtc) {
    case 'disabled':
      args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
      break;
    case 'proxy-udp':
      args.push('--force-webrtc-ip-handling-policy=disable_non_proxied_udp');
      break;
    case 'replace':
      args.push('--force-webrtc-ip-handling-policy=default_public_interface_only');
      break;
    default:
      break;
  }
  return args;
}

// Small, seeded PRNG so canvas and audio noise is stable for one profile but changes when
// "random fingerprint" asks for a new seed on every launch.
function seededRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The script runs before any page script (Page.addScriptToEvaluateOnNewDocument). Each block is
// isolated so one unsupported API cannot take the rest of the overrides down with it.
function buildInjectionScript({ fingerprint, resolved, seed = 1, native = false }) {
  // With the patched kernel the browser already spoofs platform, languages, fonts, WebRTC and the
  // CPU count, so this script only fills the gaps (screen, memory, geolocation, WebGPU).
  const config = {
    platform: native ? null : resolved.platform,
    language: native ? null : resolved.displayLanguage,
    languages: native ? [] : resolved.languages,
    screen: resolved.screen,
    webgl: fingerprint.webgl.mode === 'custom' ? { vendor: fingerprint.webgl.vendor, renderer: fingerprint.webgl.renderer } : null,
    webgpu: fingerprint.webgpu,
    webRtc: native ? 'forward' : fingerprint.webRtc,
    locationBlock: fingerprint.location.mode === 'block',
    hardware: native ? { cpu: null, ram: fingerprint.hardware.ram } : fingerprint.hardware,
    fonts: native || fingerprint.fonts.mode === 'default' ? null : FONT_PRESETS[fingerprint.fonts.mode],
    noise: fingerprint.noise,
    seed: seed >>> 0,
  };

  return `(() => {
  const C = ${JSON.stringify(config)};
  const define = (obj, key, value) => {
    try { Object.defineProperty(obj, key, { get: () => value, configurable: true }); } catch (e) {}
  };
  try { if (C.platform) define(navigator, 'platform', C.platform); } catch (e) {}
  try {
    if (C.language) {
      define(navigator, 'language', C.language);
      define(navigator, 'languages', Object.freeze(C.languages.slice()));
    }
  } catch (e) {}
  try {
    if (C.screen) {
      const w = C.screen.width, h = C.screen.height;
      define(screen, 'width', w); define(screen, 'height', h);
      define(screen, 'availWidth', w); define(screen, 'availHeight', h);
      define(window, 'outerWidth', w); define(window, 'outerHeight', h);
    }
  } catch (e) {}
  if (C.webRtc === 'disabled') {
    try { delete window.RTCPeerConnection; } catch (e) { window.RTCPeerConnection = undefined; }
    try { delete window.RTCDataChannel; } catch (e) {}
  }
  if (C.webRtc === 'replace') {
    try {
      const Native = window.RTCPeerConnection;
      if (Native) {
        const isPrivate = (address) => /^(10\\.|127\\.|169\\.254\\.|192\\.168\\.|172\\.(1[6-9]|2[0-9]|3[01])\\.)/.test(address)
          || address.indexOf(':') !== -1
          || /\\.local$/i.test(address);
        const Wrapped = function (...args) {
          const pc = new Native(...args);
          const add = pc.addEventListener.bind(pc);
          pc.addEventListener = function (type, listener, options) {
            if (type !== 'icecandidate' || typeof listener !== 'function') return add(type, listener, options);
            return add(type, function (event) {
              const candidate = event.candidate;
              const address = candidate && candidate.candidate ? (candidate.candidate.split(' ')[4] || '') : '';
              if (!address || !isPrivate(address)) listener.call(this, event);
            }, options);
          };
          return pc;
        };
        Wrapped.prototype = Native.prototype;
        window.RTCPeerConnection = Wrapped;
      }
    } catch (e) {}
  }
  if (C.locationBlock) {
    try {
      const geo = navigator.geolocation;
      if (geo) {
        const deny = (ok, fail) => { if (typeof fail === 'function') fail({ code: 1, message: 'User denied Geolocation' }); };
        geo.getCurrentPosition = function (ok, fail) { deny(ok, fail); };
        geo.watchPosition = function (ok, fail) { deny(ok, fail); return 0; };
      }
    } catch (e) {}
  }
  if (C.webgpu === 'disabled') {
    try { delete Navigator.prototype.gpu; } catch (e) {}
  }
  let rand = (() => { let s = C.seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; })();
  if (C.webgl) {
    try {
      const wrap = (proto) => {
        if (!proto) return;
        const original = proto.getParameter;
        proto.getParameter = function (parameter) {
          if (parameter === 37445) return C.webgl.vendor;
          if (parameter === 37446) return C.webgl.renderer;
          return original.call(this, parameter);
        };
      };
      wrap(window.WebGLRenderingContext && WebGLRenderingContext.prototype);
      wrap(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype);
    } catch (e) {}
  }
  if (C.hardware) {
    try { if (C.hardware.cpu) define(navigator, 'hardwareConcurrency', C.hardware.cpu); } catch (e) {}
    try { if (C.hardware.ram) define(navigator, 'deviceMemory', C.hardware.ram); } catch (e) {}
  }
  if (C.fonts && C.fonts.length) {
    try {
      const allowed = Object.create(null);
      for (const family of C.fonts) allowed[String(family).toLowerCase()] = true;
      const faces = document.fonts;
      if (faces && faces.check) {
        const original = faces.check.bind(faces);
        faces.check = function (font, text) {
          const family = String(font || '').split(',')[0].replace(/["']/g, '').trim().toLowerCase();
          if (family && !allowed[family]) return false;
          return original(font, text);
        };
      }
    } catch (e) {}
  }
  if (C.noise && C.noise.canvas) {
    try {
      const Alpha = (value) => ((value & 0xffffff) | (((rand() * 3) | 0) << 24)) >>> 0;
      const original = HTMLCanvasElement.prototype.toDataURL;
      HTMLCanvasElement.prototype.toDataURL = function (...args) {
        const ctx = this.getContext('2d');
        if (ctx && this.width && this.height) {
          try {
            const data = ctx.getImageData(0, 0, Math.min(this.width, 24), Math.min(this.height, 24));
            for (let i = 0; i < data.data.length; i += 4) data.data[i] = data.data[i] ^ ((rand() * 2) | 0);
            ctx.putImageData(data, 0, 0);
          } catch (e) {}
        }
        return original.apply(this, args);
      };
      const originalBlob = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, ...rest) {
        const ctx = this.getContext('2d');
        if (ctx && this.width && this.height) {
          try {
            const data = ctx.getImageData(0, 0, 1, 1);
            data.data[0] = Alpha(data.data[0]);
            ctx.putImageData(data, 0, 0);
          } catch (e) {}
        }
        return originalBlob.call(this, cb, ...rest);
      };
    } catch (e) {}
  }
  if (C.noise && C.noise.webglImage) {
    try {
      const proto = window.WebGLRenderingContext && WebGLRenderingContext.prototype;
      if (proto && proto.readPixels) {
        const original = proto.readPixels;
        proto.readPixels = function (...args) {
          const result = original.apply(this, args);
          try {
            const pixels = args[6];
            if (pixels && pixels.length) pixels[0] = pixels[0] ^ ((rand() * 2) | 0);
          } catch (e) {}
          return result;
        };
      }
    } catch (e) {}
  }
  if (C.noise && C.noise.audioContext) {
    try {
      const proto = window.AnalyserNode && AnalyserNode.prototype;
      if (proto) {
        const wrap = (name) => {
          const original = proto[name];
          if (!original) return;
          proto[name] = function (...args) {
            const result = original.apply(this, args);
            try {
              const out = args[0];
              if (out && out.length) out[0] += (rand() - 0.5) * 1e-7;
            } catch (e) {}
            return result;
          };
        };
        wrap('getFloatFrequencyData');
        wrap('getByteFrequencyData');
      }
    } catch (e) {}
  }
  if (C.noise && C.noise.mediaDevice) {
    try {
      const md = navigator.mediaDevices;
      if (md && md.enumerateDevices) {
        const original = md.enumerateDevices.bind(md);
        md.enumerateDevices = async function () {
          const list = await original();
          return list.map((device) => {
            const clone = Object.create(Object.getPrototypeOf(device));
            for (const key of ['deviceId', 'groupId', 'kind', 'label']) {
              const value = device[key];
              Object.defineProperty(clone, key, { value: key === 'deviceId' || key === 'groupId' ? value.slice(0, -4) + Math.floor(rand() * 9000 + 1000) : value, enumerable: true });
            }
            return clone;
          });
        };
      }
    } catch (e) {}
  }
  if (C.noise && C.noise.clientRects) {
    try {
      const proto = Element.prototype;
      const original = proto.getClientRects;
      proto.getClientRects = function () {
        const list = original.call(this);
        if (!list.length) return list;
        const first = list[0];
        const clone = new DOMRect(first.x + rand() * 0.02, first.y + rand() * 0.02, first.width, first.height);
        const out = [clone];
        for (let i = 1; i < list.length; i++) out.push(list[i]);
        return out;
      };
    } catch (e) {}
  }
  if (C.noise && C.noise.speechVoices) {
    try {
      const synth = window.speechSynthesis;
      if (synth && synth.getVoices) {
        const original = synth.getVoices.bind(synth);
        synth.getVoices = function () {
          const voices = original();
          if (!voices.length) return voices;
          const copy = voices.slice(1);
          copy.push(voices[0]);
          return copy;
        };
      }
    } catch (e) {}
  }
})();`;
}

// Flags for the patched kernel. These replace the DevTools emulation: the spoofing happens inside
// the browser, so pages cannot notice a debugger overriding anything.
function buildKernelFlags({ fingerprint, resolved, os = 'windows', seed = 1, major = null, customUserAgent = false }) {
  const args = [
    `--fingerprint=${(seed >>> 0) % 2147483647}`,
    `--fingerprint-platform=${os}`,
  ];

  if (fingerprint.webRtc !== 'real' && fingerprint.webRtc !== 'forward') {
    args.push('--disable-non-proxied-udp');
  }
  if (!customUserAgent) {
    args.push('--fingerprint-brand=Chrome');
    if (major) args.push(`--fingerprint-brand-version=${major}.0.0.0`);
  }
  if (fingerprint.hardware.cpu) args.push(`--fingerprint-hardware-concurrency=${fingerprint.hardware.cpu}`);
  if (resolved.timezone) args.push(`--timezone=${resolved.timezone}`);
  const languages = (resolved.languages || []).filter(Boolean);
  if (languages.length) {
    args.push(`--accept-lang=${languages.join(',')}`);
    args.push(`--lang=${languages[0]}`);
  }
  return args;
}

module.exports = {
  MAJOR_OPTIONS,
  FONT_PRESETS,
  uaMetadata,
  OS_LABELS,
  OS_LIST,
  userAgentFor,
  platformFor,
  resolveFingerprint,
  buildInjectionScript,
  flagsFor,
  buildKernelFlags,
  seededRandom,
};
