const dns = require('node:dns');
const path = require('node:path');
const fs = require('node:fs');
const net = require('node:net');
const crypto = require('node:crypto');

// Some networks advertise IPv6 but cannot route it, which makes downloads hang. Prefer IPv4 for
// every lookup the process makes.
dns.setDefaultResultOrder('ipv4first');
const { spawn, execFile } = require('node:child_process');
const { app, BrowserWindow, dialog, ipcMain, screen, shell } = require('electron');
const { createStore, normalizeProxy } = require('./store');
const { findChromium, detectBrowserMajor, launch, stop, resolveMacBundle } = require('./chromium');
const { startRelay, checkProxy, probeProxy, lookupGeo, lookupProxyLocation } = require('./proxy');
const { startChain } = require('./chain');
const { parseProxyString } = require('./proxy-parse');
const { createKernelRegistry } = require('./kernels');
const { MAJOR_OPTIONS, userAgentFor, uaMetadata, resolveFingerprint, buildInjectionScript, flagsFor, buildKernelFlags } = require('./fingerprint');
const { prepareBrowser } = require('./cdp');
const { startCheckServer } = require('./check-server');
const { createUpdater } = require('./updates');
const { applyAutoStart } = require('./autostart');
const { detectExecutable } = require('./system-kernel');
const { writePrefs: writeFirefoxPrefs, buildArgs: buildFirefoxArgs, firefoxUserAgent } = require('./firefox');
const { setCookies: setBidiCookies } = require('./bidi');

// The app was called Browser Manager before the rename; profile data moves with it so existing
// profiles keep working instead of starting from an empty store.
const DATA_DIR_NAME = 'morph-browser';
const LEGACY_DATA_DIR_NAME = 'browser-manager';

function useDataDir() {
  const appData = app.getPath('appData');
  const target = path.join(appData, DATA_DIR_NAME);
  const legacy = path.join(appData, LEGACY_DATA_DIR_NAME);
  if (!fs.existsSync(target) && fs.existsSync(legacy)) {
    try {
      fs.renameSync(legacy, target);
    } catch {
      fs.cpSync(legacy, target, { recursive: true });
      fs.rmSync(legacy, { recursive: true, force: true });
    }
  }
  // Downloaded kernels store an absolute path to their binary; the rename moved those folders.
  const browsers = path.join(target, 'browsers');
  if (fs.existsSync(browsers)) {
    for (const kernel of fs.readdirSync(browsers)) {
      const kernelDir = path.join(browsers, kernel);
      if (!fs.statSync(kernelDir).isDirectory()) continue;
      for (const version of fs.readdirSync(kernelDir)) {
        const pointer = path.join(kernelDir, version, 'executable.txt');
        if (!fs.existsSync(pointer)) continue;
        const exe = fs.readFileSync(pointer, 'utf8');
        if (exe.includes(legacy)) fs.writeFileSync(pointer, exe.split(legacy).join(target));
      }
    }
  }

  app.setPath('userData', target);
}

app.setName('Morph Browser');
app.setDesktopName('morph-browser.desktop');
if (process.platform === 'win32') app.setAppUserModelId('dev.morphbrowser.app');
// Wayland and GNOME match a window to its desktop entry; this makes the dock show the app icon.
app.commandLine.appendSwitch('class', 'morph-browser');
useDataDir();

// In development the app runs from the checkout, so a desktop entry is written once to point the
// shell at the icon. Packaged builds ship their own entry and skip this.
function ensureDevDesktopEntry() {
  if (app.isPackaged || process.platform !== 'linux') return;
  try {
    const icon = path.join(__dirname, '..', 'build', 'icon.png');
    if (!fs.existsSync(icon)) return;
    const dir = path.join(app.getPath('home'), '.local', 'share', 'applications');
    const exec = `"${process.execPath}" "${path.join(__dirname, '..')}" --no-sandbox`;
    const content = [
      '[Desktop Entry]',
      'Type=Application',
      'Name=Morph Browser',
      'Comment=Multi-profile browser manager',
      `Exec=${exec}`,
      `Icon=${icon}`,
      'Terminal=false',
      'Categories=Utility;',
      'StartupWMClass=morph-browser',
      '',
    ].join('\n');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'morph-browser.desktop');
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) fs.writeFileSync(file, content);
  } catch (err) {
    console.error('desktop entry:', err.message);
  }
}

const VENDOR_DIR = path.join(__dirname, '..', 'vendor', 'chromium');
const running = new Map(); // profile id -> { child, relay, cdp, debugPort, executable }
const launching = new Set(); // ids still starting up; a download can make this take minutes
let store;
let kernels;
let browserCache;
let win;
let checkServer = null;
let updater = null;

// Downloads happen while a profile launches, but the UI needs to show them separately. Each entry
// is a browser build being fetched, keyed by kernel and requested version.
const downloads = new Map();

function downloadList() {
  return [...downloads.values()].map((task) => ({ ...task })).sort((a, b) => b.startedAt - a.startedAt);
}

function broadcastDownloads() {
  if (win && !win.isDestroyed()) win.webContents.send('browsers:progress', downloadList());
}

function installedBuild(kernel, version) {
  const installed = kernels.listInstalled(kernel);
  return installed.some((entry) => entry === version || entry.split('.')[0] === version);
}

function findTask(kernel, version) {
  for (const task of downloads.values()) {
    if (task.kernel !== kernel || task.status !== 'downloading') continue;
    if (task.version === version || version.startsWith(`${task.version}.`) || task.version === 'latest') return task;
  }
  return null;
}

// Wraps a build download so the sidebar can show progress and the final result.
function trackDownload(kernel, version, run) {
  if (installedBuild(kernel, version)) return run();
  const key = `${kernel}:${version}`;
  if (findTask(kernel, version)) return run();
  const info = kernels.listKernels().find((entry) => entry.id === kernel);
  const task = {
    key,
    kernel,
    label: info ? info.label : kernel,
    version,
    status: 'downloading',
    received: 0,
    total: 0,
    error: null,
    startedAt: Date.now(),
  };
  downloads.set(key, task);
  broadcastDownloads();
  return run().then((result) => {
    task.status = 'done';
    task.received = task.total || task.received;
    task.finishedAt = Date.now();
    broadcastDownloads();
    setTimeout(() => {
      if (downloads.get(key) === task) {
        downloads.delete(key);
        broadcastDownloads();
      }
    }, 45000);
    return result;
  }).catch((err) => {
    task.status = 'error';
    task.error = err.message;
    task.finishedAt = Date.now();
    broadcastDownloads();
    throw err;
  });
}

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

// The profile name, its number and the note travel in the fragment: they are shown on the start
// page but never sent to a server.
function checkUrl(profile) {
  const base = checkServer ? checkServer.url : '';
  if (!base) return '';
  const params = new URLSearchParams();
  if (profile.name) params.set('name', profile.name);
  if (profile.number) params.set('id', String(profile.number));
  if (profile.notes) params.set('note', profile.notes);
  const fragment = params.toString();
  return fragment ? `${base}#${fragment}` : base;
}

// Linux matches a window to a desktop entry by class/app id, so a hidden entry with a numbered
// icon is how the dock shows which profile a browser window belongs to.
function ensureProfileWindowIcon(profile, executable) {
  if (process.platform !== 'linux') return null;
  const number = Number.isInteger(profile.number) && profile.number > 0 && profile.number <= 99 ? profile.number : null;
  if (!number) return null;
  const source = path.join(__dirname, '..', 'build', 'badges', `${number}.png`);
  if (!fs.existsSync(source)) return null;
  try {
    const cls = `morph-p${number}`;
    // An icon name in the hicolor theme is found by every desktop, unlike a path inside the app.
    const themeDir = path.join(app.getPath('home'), '.local', 'share', 'icons', 'hicolor', '256x256', 'apps');
    fs.mkdirSync(themeDir, { recursive: true });
    const icon = path.join(themeDir, `${cls}.png`);
    if (!fs.existsSync(icon)) fs.copyFileSync(source, icon);

    const dir = path.join(app.getPath('home'), '.local', 'share', 'applications');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${cls}.desktop`);
    const content = [
      '[Desktop Entry]',
      'Type=Application',
      `Name=Morph Browser #${number}`,
      'NoDisplay=true',
      `Exec="${executable}" %U`,
      `Icon=${cls}`,
      `StartupWMClass=${cls}`,
      'Terminal=false',
      'Categories=Utility;',
      '',
    ].join('\n');
    if (!fs.existsSync(file) || fs.readFileSync(file, 'utf8') !== content) fs.writeFileSync(file, content);
    execFile('gtk-update-icon-cache', ['-f', '-t', path.join(app.getPath('home'), '.local', 'share', 'icons', 'hicolor')], () => {});
    return cls;
  } catch (err) {
    console.error('profile icon:', err.message);
    return null;
  }
}

function removeProfileWindowIcon(profile) {
  if (process.platform !== 'linux' || !profile || !profile.number) return;
  const cls = `morph-p${profile.number}`;
  fs.rmSync(path.join(app.getPath('home'), '.local', 'share', 'applications', `${cls}.desktop`), { force: true });
  fs.rmSync(path.join(app.getPath('home'), '.local', 'share', 'icons', 'hicolor', '256x256', 'apps', `${cls}.png`), { force: true });
}

function isCheckUrl(url) {
  return Boolean(checkServer) && (url === checkServer.url || url.startsWith(checkServer.url));
}

// The tabs a running profile has open, minus the check page itself.
async function readTabs(entry) {
  if (!entry || !entry.cdp) return null;
  try {
    const { targetInfos } = await entry.cdp.conn.send('Target.getTargets');
    return targetInfos
      .filter((target) => target.type === 'page' && /^https?:/i.test(target.url) && !isCheckUrl(target.url))
      .map((target) => target.url);
  } catch {
    return null;
  }
}

function snapshotTabs(id, entry) {
  readTabs(entry).then((urls) => {
    if (!urls) return;
    const profile = store.getProfile(id);
    if (!profile || JSON.stringify(profile.lastTabs || []) === JSON.stringify(urls)) return;
    store.setLastTabs(id, urls);
  }).catch(() => {});
}

function detectFirefoxVersion(executable) {
  return new Promise((resolve) => {
    execFile(executable, ['--version'], { timeout: 5000 }, (err, stdout) => {
      if (err) return resolve(null);
      const match = /Firefox\/(\d+)/i.exec(String(stdout || '')) || /Firefox (\d+)/i.exec(String(stdout || ''));
      resolve(match ? `${match[1]}.0` : null);
    });
  });
}

function notifyNotice(text, level = 'warning') {
  if (win && !win.isDestroyed()) win.webContents.send('profiles:notice', { text, level });
}

function appProxy() {
  const setting = store.getSettings().upstreamProxy;
  return setting && setting.enabled && setting.proxy ? setting.proxy : null;
}

// When a profile has a fallback configured, look at the primary proxy first. A dead proxy would
// otherwise leave the browser without a connection.
async function chooseProxy(profile, upstream = null) {
  if (!profile.proxy) return { proxy: null, fallback: null };
  const mode = profile.fallback?.mode || 'none';
  if (mode === 'none') return { proxy: profile.proxy, fallback: null };

  const reachable = await probeProxy(profile.proxy, 6000, { upstream });
  if (reachable) return { proxy: profile.proxy, fallback: null };

  if (mode === 'direct') {
    notifyNotice(`Proxy for “${profile.name}” is unreachable — using a direct connection.`);
    return { proxy: null, fallback: 'direct' };
  }
  if (mode === 'proxy' && profile.fallback.proxy) {
    notifyNotice(`Proxy for “${profile.name}” is unreachable — using its fallback proxy.`);
    return { proxy: profile.fallback.proxy, fallback: 'proxy' };
  }
  return { proxy: profile.proxy, fallback: null };
}

// Firefox has no DevTools protocol: cookies go through WebDriver BiDi and everything else is a
// profile preference. The process is treated like Chromium once it is running.
async function launchFirefoxProfile(id, profile, executable, proxy, uaVersion = null, upstream = null) {
  const kernel = 'firefox';
  const geo = profile.fingerprint && needsGeo(profile) && (proxy || upstream)
    ? await lookupGeo(proxy || upstream, { upstream: proxy ? upstream : null })
    : null;
  const versions = await kernels.listVersions('firefox').catch(() => []);
  const version = uaVersion || profile.browserVersion || versions[0] || '128.0';
  const resolved = resolveFingerprint(profile.fingerprint, { os: profile.os, major: version, geo });
  const relay = upstream ? await startChain(upstream, proxy) : proxy ? await startRelay(proxy) : null;

  try {
    const dir = profileDir(id);
    fs.mkdirSync(dir, { recursive: true });
    const userAgent = profile.userAgent.mode === 'custom'
      ? profile.userAgent.value
      : firefoxUserAgent(profile.os, version);
    const languages = [resolved.language, resolved.language.split('-')[0], 'en'].filter(Boolean);

    writeFirefoxPrefs(dir, {
      proxyServer: relay ? relay.proxyServer : null,
      userAgent,
      languages,
      webRtc: profile.fingerprint.webRtc,
      blockGeolocation: profile.fingerprint.location.mode === 'block',
      restorePages: profile.prefs.restorePages,
    });

    const startUrls = [];
    if (store.getSettings().openCheckPage !== false && checkServer) {
      startUrls.push(checkUrl(profile));
    }
    startUrls.push(...profile.startUrls);

    const debugPort = await freePort();
    const args = buildFirefoxArgs({
      profileDir: dir,
      startUrls,
      windowSize: profile.fingerprint.screen.mode === 'custom' ? resolved.screen : null,
    });
    const child = spawn(executable, [...args, '--remote-debugging-port', String(debugPort)], {
      env: {
        ...process.env,
        TZ: resolved.timezone || process.env.TZ,
        MOZ_CRASHREPORTER_DISABLE: '1',
        MOZ_DISABLE_AUTO_SAFE_MODE: '1',
      },
      stdio: 'ignore',
    });

    const entry = { child, relay, cdp: null, debugPort: null };
    running.set(id, entry);
    const finish = (err) => {
      if (err) console.error(`profile ${id}:`, err.message);
      if (running.get(id) !== entry) return;
      running.delete(id);
      if (relay) relay.close().catch((error) => console.error(error));
      notify();
    };
    child.on('error', finish);
    child.on('exit', () => finish());

    // Cookie import is best effort: a blocked BiDi port must not keep the browser from opening.
    if (profile.cookies && profile.cookies.length) {
      setBidiCookies(debugPort, profile.cookies, { timeout: 25000 })
        .catch((err) => console.error(`profile ${id}: cookies were not imported (${err.message})`));
    }

    store.markOpened(id);
    notify();
  } catch (err) {
    if (relay) relay.close().catch(() => {});
    throw err;
  }
}

async function launchProfile(id) {
  if (running.has(id) || launching.has(id)) return;
  launching.add(id);
  let relay = null;
  try {
    const profile = store.getProfile(id);
    if (!profile) throw new Error('profile not found');

    // A profile with a version set gets that build from the shared cache, downloading it on first
    // use. A custom binary always wins, which is how forks without a download API are used.
    const kernel = profile.kernel || 'chrome';
    if (kernel === 'firefox' && profile.os === 'android') {
      throw new Error('Android emulation needs a Chromium kernel; pick Chrome, Chromium or Chrome for Testing.');
    }
    // The patched kernel has no Android platform mode, so Android profiles use the injected
    // emulation even when the kernel is fingerprint-chromium.
    const native = kernel === 'fingerprint' && profile.os !== 'android';
    // A macOS file picker returns the .app bundle; the binary inside it is what spawn needs.
    const customPath = profile.executablePath && process.platform === 'darwin'
      ? (resolveMacBundle(profile.executablePath) || profile.executablePath)
      : profile.executablePath;
    if (customPath && !fs.existsSync(customPath)) throw new Error(`The custom binary does not exist: ${customPath}`);
    if (kernel === 'firefox') {
      const upstream = appProxy();
      const chosen = await chooseProxy(profile, upstream);
      if (profile.changeIpUrl && !chosen.fallback) await callChangeIp(profile.changeIpUrl);
      const versions = await kernels.listVersions('firefox').catch(() => []);
      const firefoxVersion = profile.browserVersion || versions[0];
      let firefoxExecutable = customPath;
      // Mozilla ships no Windows archive, so an installed Firefox is used when it exists.
      if (!firefoxExecutable && process.platform === 'win32') {
        firefoxExecutable = detectExecutable('firefox', 'win32');
      }
      if (!firefoxExecutable) {
        if (!firefoxVersion) throw new Error('Firefox is not installed. Install Firefox or set a custom binary for this profile.');
        firefoxExecutable = await trackDownload('firefox', firefoxVersion, () => kernels.ensureBrowser('firefox', firefoxVersion));
      }
      const firefoxUaVersion = firefoxVersion || await detectFirefoxVersion(firefoxExecutable);
      await launchFirefoxProfile(id, profile, firefoxExecutable, chosen.proxy, firefoxUaVersion, upstream);
      return;
    }
    if (native && !profile.browserVersion) throw new Error('Pick a fingerprint build for this profile first.');
    let executable = customPath;
    if (!executable) {
      if (kernel === 'chrome' && process.platform !== 'linux') {
        // Google publishes Chrome builds for Linux only; other systems use the installed app.
        executable = findChromium({ configuredPath: store.getSettings().chromiumPath, vendorDir: VENDOR_DIR });
      } else if (kernel === 'chrome') {
        executable = profile.browserVersion
          ? await trackDownload('chrome', profile.browserVersion, () => kernels.ensureBrowser('chrome', profile.browserVersion))
          : findChromium({ configuredPath: store.getSettings().chromiumPath, vendorDir: VENDOR_DIR });
      } else if (kernel === 'brave' && process.platform === 'win32') {
        // Brave publishes no Windows zip, so only an installed copy works.
        executable = detectExecutable('brave', 'win32');
        if (!executable) throw new Error('Brave downloads are not available on Windows. Install Brave or set a custom binary for this profile.');
      } else {
        let wanted = profile.browserVersion;
        if (!wanted) {
          const versions = await kernels.listVersions(kernel).catch(() => []);
          wanted = versions[0];
        }
        if (!wanted) throw new Error(`no ${kernel} build is available for this platform`);
        executable = await trackDownload(kernel, wanted, () => kernels.ensureBrowser(kernel, wanted));
      }
    }
    if (!executable) throw new Error('Chromium not found. Set its path in Settings.');

    const upstream = appProxy();
    const chosen = await chooseProxy(profile, upstream);
    if (profile.changeIpUrl && !chosen.fallback) await callChangeIp(profile.changeIpUrl);

    // "Based on IP" needs the exit IP's timezone and country; a failed lookup falls back to the
    // real system values instead of blocking the launch.
    const exitProxy = chosen.proxy || upstream;
    const geo = needsGeo(profile) && exitProxy
      ? await lookupGeo(exitProxy, { upstream: chosen.proxy ? upstream : null })
      : null;

    // A Chrome install on macOS/Windows is not a downloaded build, so the stored version can be
    // stale or absent; the binary's real major is the only safe one there.
    const detectedMajor = await detectBrowserMajor(executable);
    const useStoredVersion = Boolean(profile.browserVersion)
      && profile.browserVersion !== 'latest'
      && !(kernel === 'chrome' && process.platform !== 'linux');
    const effectiveVersion = useStoredVersion ? profile.browserVersion : detectedMajor;

    const resolved = resolveFingerprint(profile.fingerprint, {
      os: profile.os,
      major: effectiveVersion,
      geo,
    });
    const seed = seedFor(profile);
    const script = buildInjectionScript({ fingerprint: profile.fingerprint, resolved, seed, native });

    // An automatic UA only overrides the browser when the profile asks for another OS. The patched
    // kernel sets its own brand and platform, so it only needs the override for a custom UA.
    const hostOs = process.platform === 'darwin' ? 'macos' : process.platform === 'win32' ? 'windows' : 'linux';
    const major = effectiveVersion;
    // Brave and Thorium report their own version, not the Chromium version the user-agent needs.
    const uaMajor = ['brave', 'thorium'].includes(kernel) ? detectedMajor || major : major;
    const customUserAgent = profile.userAgent.mode === 'custom';
    const userAgent = customUserAgent
      ? profile.userAgent.value
      : native
        ? null
        : profile.os === hostOs
          ? null
          : userAgentFor(profile.os, uaMajor, profile.fingerprint.android);
    const acceptLanguages = [resolved.language, resolved.language.split('-')[0], 'en'].filter(Boolean).join(',');
    const preferenceFlags = [];
    if (profile.prefs.blockImages) preferenceFlags.push('--blink-settings=imagesEnabled=false');
    if (profile.prefs.restorePages === false) preferenceFlags.push('--hide-crash-restore-bubble');

    const windowClass = ensureProfileWindowIcon(profile, executable);
    const classFlags = windowClass ? [`--class=${windowClass}`] : [];

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
    relay = upstream ? await startChain(upstream, chosen.proxy) : chosen.proxy ? await startRelay(chosen.proxy) : null;

    const emulation = {
      timezone: native ? null : resolved.timezone,
      locale: native ? null : resolved.displayLanguage,
      userAgent,
      acceptLanguage: native ? null : acceptLanguages,
      platform: resolved.platform,
      userAgentMetadata: userAgent
        ? uaMetadata({ userAgent, os: profile.os, android: profile.fingerprint.android })
        : null,
      mobile: resolved.mobile
        ? { ...resolved.mobile, maxTouchPoints: 5 }
        : null,
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
      extraFlags: [
        ...preferenceFlags,
        ...(resolved.mobile ? ['--touch-events=enabled'] : []),
        ...kernelFlags,
        ...classFlags,
        ...splitLaunchArgs(profile.launchArgs),
      ],
      env: !native && resolved.timezone ? { TZ: resolved.timezone } : {},
    };
    // The check page comes first, like AdsPower's, so the exit IP and the services the profile can
    // reach are visible right after launch.
    const startUrls = [];
    if (store.getSettings().openCheckPage !== false && checkServer) {
      startUrls.push(checkUrl(profile));
    }
    for (const url of profile.startUrls) {
      if (!startUrls.includes(url)) startUrls.push(url);
    }
    // Tabs from the previous session return after the info page, so that page is always first.
    for (const url of profile.lastTabs || []) {
      if (startUrls.length >= 12) break;
      if (!startUrls.includes(url) && !isCheckUrl(url)) startUrls.push(url);
    }
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
      if (entry.tabsTimer) clearInterval(entry.tabsTimer);
      snapshotTabs(id, entry);
      running.delete(id);
      if (entry.cdp) entry.cdp.close();
      if (relay) relay.close().catch((e) => console.error(e));
      notify();
    };
    entry.child.on('error', finish);
    entry.child.on('exit', () => finish());
    entry.tabsTimer = setInterval(() => snapshotTabs(id, entry), 12000);
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

async function stopProfile(id) {
  const entry = running.get(id);
  if (!entry) return;
  if (entry.tabsTimer) clearInterval(entry.tabsTimer);
  // Remember the open tabs before the process goes away.
  const urls = await readTabs(entry);
  if (urls) store.setLastTabs(id, urls);
  if (entry.cdp) entry.cdp.close();
  stop(entry.child);
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
    const profile = store.getProfile(id);
    store.purgeProfile(id);
    fs.rmSync(profileDir(id), { recursive: true, force: true });
    removeProfileWindowIcon(profile);
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
    const profile = store.getProfile(id);
    store.purgeProfile(id);
    fs.rmSync(profileDir(id), { recursive: true, force: true });
    removeProfileWindowIcon(profile);
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
      defaultPath: `morph-browser-profiles-${new Date().toISOString().slice(0, 10)}.json`,
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
  ipcMain.handle('proxies:save', async (_e, input) => {
    const upstream = appProxy();
    const existing = input.id ? store.listProxies().find((entry) => entry.id === input.id) : null;
    let location = input.location || null;
    const unchanged = existing
      && existing.host === input.host
      && existing.port === Number(input.port)
      && existing.type === input.type
      && (existing.username || '') === (input.username || '');
    if (!location && unchanged) location = existing.location || null;
    if (!location) {
      try {
        location = await lookupProxyLocation(input, { upstream });
      } catch {
        location = null;
      }
    }
    const saved = store.saveProxy({ ...input, location });
    notify();
    return saved;
  });

  ipcMain.handle('proxies:recheck', async (_e, id) => {
    const proxy = store.listProxies().find((entry) => entry.id === id);
    if (!proxy) throw new Error('proxy not found');
    const location = await lookupProxyLocation(proxy, { upstream: appProxy() });
    const saved = store.saveProxy({ ...proxy, location });
    notify();
    return saved;
  });

  ipcMain.handle('proxies:import', async (_e, text, options = {}) => {
    const upstream = appProxy();
    const lines = String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const existing = store.listProxies();
    const parsed = [];
    const errors = [];
    let skipped = 0;

    for (const line of lines) {
      try {
        const entry = parseProxyString(line, options.defaultType || 'http');
        const duplicate = existing.some((proxy) => proxy.type === entry.type
          && proxy.host === entry.host
          && proxy.port === entry.port
          && proxy.username === entry.username);
        if (duplicate) {
          skipped += 1;
          continue;
        }
        parsed.push({ ...entry, name: `${options.namePrefix ? `${options.namePrefix} ` : ''}${entry.host}:${entry.port}` });
      } catch (err) {
        errors.push({ line, error: err.message });
      }
    }

    const total = parsed.length;
    let done = 0;
    const results = [];
    const worker = async () => {
      for (;;) {
        const entry = parsed.shift();
        if (!entry) return;
        let location = null;
        if (options.check !== false) {
          try {
            location = await lookupProxyLocation(entry, { upstream });
          } catch {
            location = null;
          }
        }
        results.push({ ...entry, location });
        done += 1;
        if (win && !win.isDestroyed()) win.webContents.send('proxies:progress', { done, total });
      }
    };
    await Promise.all(Array.from({ length: Math.min(4, Math.max(1, total)) }, worker));

    const imported = store.saveProxies(results);
    notify();
    return { imported: imported.length, skipped, errors };
  });
  ipcMain.handle('proxies:delete', (_e, id) => {
    store.deleteProxy(id);
    notify();
  });

  ipcMain.handle('kernels:list', () => kernels.listKernels());
  ipcMain.handle('browsers:majors', async (_e, kernel = 'chrome') => {
    const installedList = kernels.listInstalled(kernel);
    const installed = new Set(installedList);
    for (const version of installedList) installed.add(version.split('.')[0]);
    const majors = kernel === 'chrome'
      ? (process.platform === 'linux' && process.arch === 'x64' ? MAJOR_OPTIONS : [])
      : await kernels.listVersions(kernel).catch(() => []);
    return majors.map((major) => ({ major, installed: installed.has(major) }));
  });
  ipcMain.handle('browsers:versions', (_e, kernel = 'chrome') => kernels.listVersions(kernel));
  ipcMain.handle('browsers:installed', (_e, kernel = 'chrome') => kernels.listInstalled(kernel));
  ipcMain.handle('browsers:tasks', () => downloadList());
  ipcMain.handle('browsers:dismiss-task', (_e, key) => {
    downloads.delete(key);
    broadcastDownloads();
  });

  ipcMain.handle('browsers:stats', async () => {
    const list = kernels.listKernels();
    const groups = [];
    for (const kernel of list) {
      const builds = [];
      for (const version of kernels.listInstalled(kernel.id)) {
        const dir = path.join(browserCache, kernel.id, version);
        builds.push({ version, dir, size: await folderSize(dir) });
      }
      groups.push({ ...kernel, builds });
    }
    return groups;
  });

  ipcMain.handle('browsers:remove-all', (_e, kernel = 'chrome') => {
    const dirs = kernels.listInstalled(kernel).map((version) => path.join(browserCache, kernel, version));
    for (const entry of running.values()) {
      if (dirs.some((dir) => entry.executable.startsWith(dir + path.sep))) {
        throw new Error('a running profile uses a build from this kernel');
      }
    }
    for (const dir of dirs) sizeCache.delete(dir);
    fs.rmSync(path.join(browserCache, kernel), { recursive: true, force: true });
    notify();
  });

  ipcMain.handle('browsers:remove', (_e, kernel = 'chrome', version) => {
    // A build a running profile is using stays on disk until that profile stops.
    const usedDir = path.join(browserCache, kernel, version) + path.sep;
    for (const entry of running.values()) {
      if (entry.executable.startsWith(usedDir)) throw new Error('a running profile uses this build');
    }
    kernels.removeInstalled(kernel, version);
  });

  ipcMain.handle('proxy:parse', (_e, text, defaultType) => parseProxyString(text, defaultType));
  ipcMain.handle('proxy:check', async (_e, proxy, options = {}) => {
    const clean = normalizeProxy(proxy);
    if (!clean) throw new Error('enter a proxy host first');
    const upstream = options.direct ? null : appProxy();
    const exit = await checkProxy(clean, undefined, { upstream });
    const location = await lookupProxyLocation(clean, { upstream }).catch(() => null);
    return { ...exit, location };
  });

  ipcMain.handle('settings:get', () => {
    const settings = store.getSettings();
    const detected = findChromium({ configuredPath: settings.chromiumPath, vendorDir: VENDOR_DIR });
    return { ...settings, detected, dataDir: app.getPath('userData') };
  });
  ipcMain.handle('settings:set', (_e, patch) => {
    const settings = store.setSettings(patch);
    if ('launchOnBoot' in patch) {
      try {
        applyAutoStart({ enabled: Boolean(settings.launchOnBoot), app, isPackaged: app.isPackaged });
      } catch (err) {
        console.error('autostart:', err.message);
      }
    }
    if ('updates' in patch && updater) updater.applySettings(settings);
    return settings;
  });

  ipcMain.handle('updates:state', () => (updater ? updater.getState() : null));
  ipcMain.handle('updates:check', () => updater && updater.check());
  ipcMain.handle('updates:download', () => updater && updater.download());
  ipcMain.handle('updates:install', () => updater && updater.install());
  ipcMain.handle('settings:reset', () => {
    const settings = store.resetSettings();
    notify();
    return settings;
  });
  ipcMain.handle('app:info', () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    platform: process.platform,
  }));
  ipcMain.handle('shell:open-path', (_e, target) => {
    // Only paths inside the app's data directory may be opened from the renderer.
    const resolved = path.resolve(String(target || ''));
    const root = app.getPath('userData');
    if (!resolved.startsWith(root + path.sep)) throw new Error('blocked path');
    return shell.openPath(resolved);
  });
  ipcMain.handle('shell:open-data-dir', () => shell.openPath(app.getPath('userData')));

  ipcMain.handle('shell:open-external', (_e, url) => {
    // Only the project page can be opened, so a compromised page cannot launch arbitrary URLs.
    const target = String(url || '');
    const allowed = [
      'https://github.com/ppouria/morph-browser',
      'https://opensource.org/license/mit',
    ];
    if (!allowed.some((prefix) => target.startsWith(prefix))) throw new Error('blocked URL');
    return shell.openExternal(target);
  });
}

const sizeCache = new Map();

// Sizes are shown in Settings; du keeps this fast on Linux and macOS, and the fallback walks
// directories on Windows.
function folderSize(dir) {
  const cached = sizeCache.get(dir);
  if (cached && Date.now() - cached.at < 60000) return Promise.resolve(cached.size);
  const remember = (size) => { sizeCache.set(dir, { size, at: Date.now() }); return size; };
  if (process.platform !== 'win32') {
    return new Promise((resolve) => {
      // GNU du has -b; BSD du (macOS) only has -k, so the result is converted to bytes.
      const args = process.platform === 'darwin' ? ['-sk', dir] : ['-sb', dir];
      execFile('du', args, { timeout: 20000 }, (err, stdout) => {
        const value = err ? 0 : Number(String(stdout).split('\t')[0]) || 0;
        resolve(remember(process.platform === 'darwin' ? value * 1024 : value));
      });
    });
  }
  return (async () => {
    let total = 0;
    const stack = [dir];
    while (stack.length) {
      const current = stack.pop();
      let entries;
      try {
        entries = await fs.promises.readdir(current, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const entry of entries) {
        const full = path.join(current, entry.name);
        if (entry.isDirectory()) stack.push(full);
        else {
          try { total += (await fs.promises.stat(full)).size; } catch { /* skip */ }
        }
      }
    }
    return remember(total);
  })();
}

function createWindow() {
  const stored = store.getSettings();
  const saved = stored.rememberWindow && stored.window ? stored.window : null;
  let bounds = null;
  if (saved) {
    const display = screen.getDisplayMatching(saved);
    const area = display.workArea;
    const width = Math.min(Math.max(saved.width, 720), area.width);
    const height = Math.min(Math.max(saved.height, 540), area.height);
    bounds = {
      width,
      height,
      x: Math.min(Math.max(saved.x, area.x), area.x + area.width - width),
      y: Math.min(Math.max(saved.y, area.y), area.y + area.height - height),
    };
  }
  win = new BrowserWindow({
    width: bounds ? bounds.width : 1280,
    height: bounds ? bounds.height : 820,
    ...(bounds ? { x: bounds.x, y: bounds.y } : {}),
    minWidth: 760,
    minHeight: 540,
    title: 'Morph Browser',
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    backgroundColor: '#0d0f14',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  if (saved && saved.maximized) win.maximize();

  win.on('close', () => {
    if (win.isDestroyed() || !store.getSettings().rememberWindow) return;
    const normal = win.getNormalBounds();
    store.setSettings({ window: { ...normal, maximized: win.isMaximized() } });
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
    ensureDevDesktopEntry();
    store = createStore(app.getPath('userData'));
    checkServer = await startCheckServer().catch((err) => {
      console.error('check page server:', err.message);
      return null;
    });
    browserCache = path.join(app.getPath('userData'), 'browsers');
    // A .deb install and the Windows portable build cannot update themselves.
    const updatesSupported = !app.isPackaged
      ? true
      : process.platform === 'linux'
        ? Boolean(process.env.APPIMAGE)
        : process.platform === 'win32'
          ? !process.env.PORTABLE_EXECUTABLE_DIR
          : true;
    updater = createUpdater({
      getSettings: () => store.getSettings(),
      isPackaged: app.isPackaged,
      supported: updatesSupported,
      currentVersion: app.getVersion(),
      onChange: (state) => {
        if (win && !win.isDestroyed()) win.webContents.send('updates:state', state);
      },
    });
    updater.init();
    try {
      applyAutoStart({ enabled: Boolean(store.getSettings().launchOnBoot), app, isPackaged: app.isPackaged });
    } catch (err) {
      console.error('autostart:', err.message);
    }
    kernels = createKernelRegistry({
      cacheDir: browserCache,
      onProgress: (progress) => {
        const task = findTask(progress.kernel, String(progress.version || ''));
        if (task) {
          task.received = progress.downloaded;
          task.total = progress.total;
        }
        broadcastDownloads();
      },
    });
    setupIpc();
    createWindow();
    if (store.getSettings().updates?.checkOnLaunch !== false) {
      setTimeout(() => updater.check(), 4000);
    }
  });
}
