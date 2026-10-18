const dns = require('node:dns');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');

// Some networks advertise IPv6 but cannot route it, which makes downloads hang. Prefer IPv4 for
// every lookup the process makes.
dns.setDefaultResultOrder('ipv4first');
const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const { createStore, normalizeProxy } = require('./store');
const { findChromium, detectBrowserMajor, launch, stop } = require('./chromium');
const { startRelay, checkProxy, lookupGeo } = require('./proxy');
const { parseProxyString } = require('./proxy-parse');
const { createKernelRegistry } = require('./kernels');
const { MAJOR_OPTIONS, userAgentFor, uaMetadata, resolveFingerprint, buildInjectionScript, flagsFor, buildKernelFlags } = require('./fingerprint');
const { prepareBrowser } = require('./cdp');
const { startCheckServer } = require('./check-server');

const VENDOR_DIR = path.join(__dirname, '..', 'vendor', 'chromium');
const running = new Map(); // profile id -> { child, relay, cdp, debugPort, executable }
const launching = new Set(); // ids still starting up; a download can make this take minutes
let store;
let kernels;
let browserCache;
let win;
let checkServer = null;

// Chromium needs a debugging port per profile. Asking the OS for a free one avoids clashes between profiles.
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

function view(profile) {
  const run = running.get(profile.id);
  return { ...profile, running: Boolean(run), debugPort: run ? run.debugPort : null };
}

function notify() {
  if (win && !win.isDestroyed()) win.webContents.send('profiles:changed');
}

function profileDir(id) {
  return path.join(app.getPath('userData'), 'profiles', id);
}

// Ambient noise is seeded from the profile, so a profile looks the same on every launch unless
// "random fingerprint" is on, in which case each launch gets a new seed.
function seedFor(profile) {
  if (profile.fingerprint.randomFingerprint) return crypto.randomInt(1, 2 ** 31);
  let hash = 2166136261;
  for (const char of profile.id) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function needsGeo(profile) {
  const { timezone, language, location } = profile.fingerprint;
  return [timezone.mode, language.mode, location.mode].includes('ip');
}

// The change-IP URL is called before each launch, which is how rotating proxy services swap the exit IP.
async function callChangeIp(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Change IP URL returned ${res.status}`);
}

function grantedOrigins(startUrls) {
  const origins = new Set();
  for (const url of startUrls) {
    try {
      origins.add(new URL(url).origin);
    } catch {
      // Validation already rejected bad URLs; ignore the rest.
    }
  }
  return [...origins];
}

// Preferences that Chromium reads from disk before the first page loads.
function applyProfilePrefs(dir, prefs) {
  const defaults = path.join(dir, 'Default');
  fs.mkdirSync(defaults, { recursive: true });
  const file = path.join(defaults, 'Preferences');
  let data = {};
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    data = {};
  }
  data.credentials_enable_service = prefs.savePasswords !== false;
  data.profile = { ...(data.profile || {}), password_manager_enabled: prefs.savePasswords !== false };
  fs.writeFileSync(file, JSON.stringify(data));
}

// User-supplied flags are split like a shell would, keeping quoted values together.
function splitLaunchArgs(text) {
  const args = [];
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match;
  while ((match = pattern.exec(String(text || ''))) !== null) {
    args.push(match[1] ?? match[2] ?? match[3]);
  }
  return args;
}

async function launchProfile(id) {
  if (running.has(id) || launching.has(id)) return;
  launching.add(id);
  let relay = null;
  try {
    const profile = store.getProfile(id);
    if (!profile) throw new Error('profile not found');

    // A profile with a version set gets that build from the shared cache, downloading it on first use.
    const kernel = profile.kernel || 'chrome';
    const native = kernel === 'fingerprint';
    if (native && !profile.browserVersion) throw new Error('Pick a fingerprint build for this profile first.');
    const executable = profile.browserVersion
      ? await kernels.ensureBrowser(kernel, profile.browserVersion)
      : findChromium({ configuredPath: store.getSettings().chromiumPath, vendorDir: VENDOR_DIR });
    if (!executable) throw new Error('Chromium not found. Set its path in Settings.');

    if (profile.changeIpUrl) await callChangeIp(profile.changeIpUrl);

    // "Based on IP" needs the exit IP's timezone and country; a failed lookup falls back to the
    // real system values instead of blocking the launch.
    const geo = needsGeo(profile) && profile.proxy ? await lookupGeo(profile.proxy) : null;
    const resolved = resolveFingerprint(profile.fingerprint, {
      os: profile.os,
      major: profile.browserVersion,
      geo,
    });
    const seed = seedFor(profile);
    const script = buildInjectionScript({ fingerprint: profile.fingerprint, resolved, seed, native });

    // An automatic UA only overrides the browser when the profile asks for another OS. The patched
    // kernel sets its own brand and platform, so it only needs the override for a custom UA.
    const hostOs = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
    const detectedMajor = await detectBrowserMajor(executable);
    const major = profile.browserVersion && profile.browserVersion !== 'latest' ? profile.browserVersion : detectedMajor;
    const customUserAgent = profile.userAgent.mode === 'custom';
    const userAgent = customUserAgent
      ? profile.userAgent.value
      : native
        ? null
        : profile.os === hostOs
          ? null
          : userAgentFor(profile.os, major);
    const acceptLanguages = [resolved.language, resolved.language.split('-')[0], 'en'].filter(Boolean).join(',');
    const preferenceFlags = [];
    if (profile.prefs.blockImages) preferenceFlags.push('--blink-settings=imagesEnabled=false');
    if (profile.prefs.restorePages === false) preferenceFlags.push('--hide-crash-restore-bubble');

    const kernelFlags = native
      ? buildKernelFlags({
        fingerprint: profile.fingerprint,
        resolved,
        os: profile.os,
        seed,
        major,
        customUserAgent,
      })
      : [];

    fs.mkdirSync(profileDir(id), { recursive: true });
    applyProfilePrefs(profileDir(id), profile.prefs);
    relay = profile.proxy ? await startRelay(profile.proxy) : null;

    const emulation = {
      timezone: native ? null : resolved.timezone,
      locale: native ? null : resolved.displayLanguage,
      userAgent,
      acceptLanguage: native ? null : acceptLanguages,
      platform: resolved.platform,
      userAgentMetadata: userAgent ? uaMetadata({ userAgent, os: profile.os }) : null,
      geolocation: resolved.location
        ? { ...resolved.location, accuracy: profile.fingerprint.location.accuracy }
        : null,
      grantGeolocation: profile.fingerprint.location.prompt === 'allow'
        ? grantedOrigins(profile.startUrls)
        : [],
    };

    const launchOptions = {
      executable,
      profileDir: profileDir(id),
      proxyServer: relay && relay.proxyServer,
      startUrls: [],
      userAgent,
      acceptLanguages: native ? null : acceptLanguages,
      windowSize: resolved.screen,
      webRtcFlags: native ? [] : flagsFor(profile.fingerprint),
      extraFlags: [...preferenceFlags, ...kernelFlags, ...splitLaunchArgs(profile.launchArgs)],
      env: !native && resolved.timezone ? { TZ: resolved.timezone } : {},
    };
    // The check page comes first, like AdsPower's, so the exit IP and the services the profile can
    // reach are visible right after launch.
    const startUrls = [];
    if (store.getSettings().openCheckPage !== false && checkServer) startUrls.push(checkServer.url);
    startUrls.push(...profile.startUrls);
    const prepareOptions = { cookies: profile.cookies, startUrls, script, emulation };

    // Start URLs always open over DevTools, never on the command line: the first page has to wait
    // for the cookies and the injected script.
    let started;
    try {
      started = await startBrowser(launchOptions, prepareOptions, false);
    } catch (err) {
      // A downloaded build has no root-owned setuid helper, so Chromium refuses to start sandboxed.
      // One retry without the sandbox is better than a profile that never opens; the failure text
      // is still surfaced if the retry fails too.
      if (!/sandbox/i.test(err.message)) throw err;
      started = await startBrowser(launchOptions, prepareOptions, true);
    }

    const entry = { relay, ...started };
    running.set(id, entry);

    // 'error' and 'exit' can both fire, and a profile opened again later must not be cleared by an old child.
    const finish = (err) => {
      if (err) console.error(`profile ${id}:`, err.message);
      if (running.get(id) !== entry) return;
      running.delete(id);
      if (entry.cdp) entry.cdp.close();
      if (relay) relay.close().catch((e) => console.error(e));
      notify();
    };
    entry.child.on('error', finish);
    entry.child.on('exit', () => finish());
    store.markOpened(id);
    notify();
  } catch (err) {
    if (relay) relay.close().catch(() => {});
    throw err;
  } finally {
    launching.delete(id);
  }
}

// Starts Chromium, waits for DevTools, and returns the pieces the running map needs. A browser
// that exits before its port opens fails fast with its own stderr instead of a 20s timeout.
async function startBrowser(launchOptions, prepareOptions, noSandbox) {
  const debugPort = await freePort();
  const child = launch({ ...launchOptions, debugPort, noSandbox });
  const exited = new Promise((_, reject) => {
    child.once('exit', () => {
      const detail = child.stderrText ? child.stderrText() : '';
      reject(new Error(`Chromium closed before its DevTools port opened${detail ? `: ${detail}` : ''}`));
    });
  });
  try {
    const cdp = await Promise.race([prepareBrowser(debugPort, prepareOptions), exited]);
    return { child, cdp, debugPort };
  } catch (err) {
    stop(child);
    throw err;
  }
}

function stopProfile(id) {
  const entry = running.get(id);
  if (entry) {
    if (entry.cdp) entry.cdp.close();
    stop(entry.child);
  }
}

function setupIpc() {
  ipcMain.handle('profiles:list', () => store.listProfiles().map(view));

  ipcMain.handle('profiles:save', (_e, input) => {
    const saved = store.saveProfile(input);
    notify();
    return view(saved);
  });

  ipcMain.handle('profiles:delete', (_e, id) => {
    if (running.has(id)) throw new Error('stop the profile before deleting it');
    // Only ids the store knows reach the rm below, so a crafted id cannot point it at another folder.
    if (!store.getProfile(id)) throw new Error('profile not found');
    store.purgeProfile(id);
    fs.rmSync(profileDir(id), { recursive: true, force: true });
    notify();
  });

  ipcMain.handle('profiles:launch', (_e, id) => launchProfile(id));
  ipcMain.handle('profiles:stop', (_e, id) => stopProfile(id));

  ipcMain.handle('profiles:trash', (_e, id) => {
    if (running.has(id)) throw new Error('stop the profile before deleting it');
    store.trashProfile(id);
    notify();
  });

  ipcMain.handle('profiles:restore', (_e, id) => {
    store.restoreProfile(id);
    notify();
  });

  ipcMain.handle('profiles:purge', (_e, id) => {
    if (running.has(id)) throw new Error('stop the profile before deleting it');
    if (!store.getProfile(id)) throw new Error('profile not found');
    store.purgeProfile(id);
    fs.rmSync(profileDir(id), { recursive: true, force: true });
    notify();
  });

  ipcMain.handle('profiles:trash-list', () => store.listTrash().map(view));

  ipcMain.handle('profiles:duplicate', (_e, id) => {
    const copy = store.duplicateProfile(id);
    notify();
    return view(copy);
  });

  ipcMain.handle('profiles:batch-update', (_e, ids, patch) => {
    const changed = store.updateProfiles(ids, patch);
    notify();
    return changed;
  });

  ipcMain.handle('profiles:export', async (_e, ids) => {
    const payload = store.exportProfiles(ids);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export profiles',
      defaultPath: `browser-manager-profiles-${new Date().toISOString().slice(0, 10)}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePath) return { canceled: true };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
    return { canceled: false, count: payload.profiles.length, filePath };
  });

  ipcMain.handle('profiles:import', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Import profiles',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (canceled || !filePaths.length) return { canceled: true };
    const payload = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    const imported = store.importProfiles(payload);
    notify();
    return { canceled: false, count: imported.length };
  });

  ipcMain.handle('profiles:clear-cookies', (_e, id) => {
    if (running.has(id)) throw new Error('stop the profile first');
    if (!store.getProfile(id)) throw new Error('profile not found');
    const dir = profileDir(id);
    for (const file of ['Default/Cookies', 'Default/Cookies-journal', 'Default/Network/Cookies', 'Default/Network/Cookies-journal']) {
      fs.rmSync(path.join(dir, file), { force: true });
    }
    store.saveProfile({ ...store.getProfile(id), cookies: [] });
    notify();
  });

  ipcMain.handle('proxies:list', () => store.listProxies());
  ipcMain.handle('proxies:save', (_e, input) => {
    const saved = store.saveProxy(input);
    notify();
    return saved;
  });
  ipcMain.handle('proxies:delete', (_e, id) => {
    store.deleteProxy(id);
    notify();
  });

  ipcMain.handle('kernels:list', () => kernels.listKernels());
  ipcMain.handle('browsers:majors', async (_e, kernel = 'chrome') => {
    const installed = new Set(kernels.listInstalled(kernel).map((version) => version.split('.')[0]));
    const majors = kernel === 'chrome'
      ? MAJOR_OPTIONS
      : await kernels.listVersions(kernel).catch(() => []);
    return majors.map((major) => ({ major, installed: installed.has(major) }));
  });
  ipcMain.handle('browsers:versions', (_e, kernel = 'chrome') => kernels.listVersions(kernel));
  ipcMain.handle('browsers:installed', (_e, kernel = 'chrome') => kernels.listInstalled(kernel));
  ipcMain.handle('browsers:remove', (_e, kernel = 'chrome', version) => {
    // A build a running profile is using stays on disk until that profile stops.
    const usedDir = path.join(browserCache, kernel, version) + path.sep;
    for (const entry of running.values()) {
      if (entry.executable.startsWith(usedDir)) throw new Error('a running profile uses this build');
    }
    kernels.removeInstalled(kernel, version);
  });

  ipcMain.handle('proxy:parse', (_e, text, defaultType) => parseProxyString(text, defaultType));
  ipcMain.handle('proxy:check', (_e, proxy) => {
    const clean = normalizeProxy(proxy);
    if (!clean) throw new Error('enter a proxy host first');
    return checkProxy(clean);
  });

  ipcMain.handle('settings:get', () => {
    const settings = store.getSettings();
    const detected = findChromium({ configuredPath: settings.chromiumPath, vendorDir: VENDOR_DIR });
    return { ...settings, detected, dataDir: app.getPath('userData') };
  });
  ipcMain.handle('settings:set', (_e, patch) => store.setSettings(patch));
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 600,
    title: 'Browser Manager',
    backgroundColor: '#0d0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!win) return;
    if (win.isMinimized()) win.restore();
    win.focus();
  });

  // Quitting the app closes every browser it started, so no orphaned Chromium keeps running.
  app.on('before-quit', () => {
    for (const id of running.keys()) stopProfile(id);
    if (checkServer) checkServer.close();
  });

  app.on('window-all-closed', () => app.quit());

  app.whenReady().then(async () => {
    store = createStore(app.getPath('userData'));
    checkServer = await startCheckServer().catch((err) => {
      console.error('check page server:', err.message);
      return null;
    });
    browserCache = path.join(app.getPath('userData'), 'browsers');
    kernels = createKernelRegistry({
      cacheDir: browserCache,
      onProgress: (progress) => {
        if (win && !win.isDestroyed()) win.webContents.send('browsers:progress', progress);
      },
    });
    setupIpc();
    createWindow();
  });
}
