const fs = require('node:fs');
const path = require('node:path');
const { downloadFile } = require('./download');
const { extractArchive, findExecutable } = require('./archive');

const VERSIONS_URL = 'https://product-details.mozilla.org/1.0/firefox_versions.json';
const BASE = 'https://archive.mozilla.org/pub/firefox/releases';
const VERSION_RE = /^\d+\.\d+(\.\d+)?(esr)?$/;

const EXT = { linux: 'tar.xz', win32: 'zip', darwin: 'dmg' };

function downloadUrl(version, platform, arch = 'x64') {
  if (platform === 'win32') throw new Error('Firefox downloads are not offered on Windows; install Firefox and set a custom binary.');
  if (platform === 'darwin') return `${BASE}/${version}/mac/en-US/Firefox%20${version}.dmg`;
  const folder = arch === 'arm64' ? 'linux-aarch64' : 'linux-x86_64';
  return `${BASE}/${version}/${folder}/en-US/firefox-${version}.tar.xz`;
}

async function fetchVersions(fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(VERSIONS_URL);
  } catch {
    throw new Error('Could not reach the Firefox version list. Check the network or proxy.');
  }
  if (!response.ok) throw new Error(`Firefox version list returned ${response.status}`);
  const data = await response.json();
  const versions = [data.LATEST_FIREFOX_VERSION, data.FIREFOX_ESR].filter((value) => VERSION_RE.test(String(value || '')));
  return [...new Set(versions)];
}

// Firefox profiles are isolated with -profile, proxied through prefs, and spoof only what the
// engine exposes: user-agent, languages, timezone (process TZ) and WebRTC policy. Canvas, WebGL
// and fonts cannot be faked natively here.
function createFirefoxManager({
  cacheDir,
  platform = process.platform,
  arch = process.arch,
  onProgress = () => {},
  fetchVersionsImpl = fetchVersions,
  download = downloadFile,
  extract = extractArchive,
}) {
  let versions = null;
  const inflight = new Map();

  async function load() {
    if (!versions) {
      versions = (async () => (await fetchVersionsImpl()).sort((a, b) => b.localeCompare(a, undefined, { numeric: true })))();
      versions.catch(() => { versions = null; });
    }
    return versions;
  }

  function existingBuild(version) {
    const pointer = path.join(cacheDir, version, 'executable.txt');
    if (!fs.existsSync(pointer)) return null;
    const exe = fs.readFileSync(pointer, 'utf8').trim();
    return exe && fs.existsSync(exe) ? exe : null;
  }

  async function listVersions() {
    // Mozilla publishes no Windows archive, so an installed Firefox or a custom binary is used.
    if (platform === 'win32') return [];
    return (await load()).slice();
  }

  async function install(version) {
    const dir = path.join(cacheDir, version);
    const downloadPath = path.join(cacheDir, `${version}.${EXT[platform] || 'tar.bz2'}`);
    fs.mkdirSync(cacheDir, { recursive: true });

    if (!fs.existsSync(downloadPath)) {
      await download(downloadUrl(version, platform, arch), downloadPath, {
        onProgress: (downloaded, total) => onProgress({ version, downloaded, total }),
      });
    }

    const staging = `${dir}.staging`;
    fs.rmSync(staging, { recursive: true, force: true });
    await extract(downloadPath, platform === 'darwin' ? 'dmg' : 'tarxz', staging, platform);
    const exe = findExecutable(staging, platform);
    if (!exe) throw new Error(`No Firefox binary found in the ${version} archive`);

    const relative = path.relative(staging, exe);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(staging, dir);
    const finalExe = path.join(dir, relative);
    fs.writeFileSync(path.join(dir, 'executable.txt'), finalExe);
    fs.rmSync(downloadPath, { force: true });
    return finalExe;
  }

  async function ensureBrowser(version) {
    if (platform === 'win32') throw new Error('Firefox downloads are not offered on Windows; install Firefox or set a custom binary.');
    if (!VERSION_RE.test(String(version))) throw new Error(`invalid Firefox version: ${version}`);
    const cached = existingBuild(version);
    if (cached) return cached;
    if (!inflight.has(version)) {
      inflight.set(version, install(version).finally(() => inflight.delete(version)));
    }
    return inflight.get(version);
  }

  function listInstalled() {
    if (!fs.existsSync(cacheDir)) return [];
    return fs.readdirSync(cacheDir).filter((name) => VERSION_RE.test(name) && existingBuild(name)).sort();
  }

  function removeInstalled(version) {
    if (!VERSION_RE.test(version)) throw new Error(`invalid Firefox version: ${version}`);
    fs.rmSync(path.join(cacheDir, version), { recursive: true, force: true });
  }

  return { listVersions, ensureBrowser, listInstalled, removeInstalled };
}

function prefLines(preferences) {
  return preferences.map(([key, value]) => `user_pref(${JSON.stringify(key)}, ${JSON.stringify(value)});`).join('\n');
}

// Profile preferences are written before Firefox starts; the file is additive so relaunching the
// same profile keeps it in sync with the editor.
function writePrefs(profileDir, { proxyServer, userAgent, languages, webRtc, blockGeolocation, restorePages }) {
  const prefs = [
    ['browser.shell.checkDefaultBrowser', false],
    ['browser.startup.page', 0],
    ['browser.startup.homepage', 'about:blank'],
    ['browser.startup.homepage_override.mstone', 'ignore'],
    ['startup.homepage_welcome_url', 'about:blank'],
    ['startup.homepage_welcome_url.additional', 'about:blank'],
    ['browser.aboutConfig.showWarning', false],
    ['datareporting.policy.dataSubmissionEnabled', false],
    ['datareporting.healthreport.uploadEnabled', false],
    ['toolkit.telemetry.enabled', false],
    ['app.update.auto', false],
    ['app.update.enabled', false],
    ['browser.sessionstore.resume_from_crash', Boolean(restorePages)],
    // BiDi (WebDriver) is not enabled by default in current Firefox builds.
    ['remote.active-protocols', 3],
  ];

  if (userAgent) prefs.push(['general.useragent.override', userAgent]);
  if (languages && languages.length) prefs.push(['intl.accept_languages', languages.join(',')]);
  if (webRtc !== 'real' && webRtc !== 'forward') prefs.push(['media.peerconnection.ice.proxy_only', true]);
  if (blockGeolocation) prefs.push(['geo.enabled', false]);

  if (proxyServer) {
    const { hostname, port } = new URL(proxyServer);
    prefs.push(
      ['network.proxy.type', 1],
      ['network.proxy.http', hostname],
      ['network.proxy.http_port', Number(port)],
      ['network.proxy.ssl', hostname],
      ['network.proxy.ssl_port', Number(port)],
      ['network.proxy.share_proxy_settings', true],
      // Firefox defaults to failover_direct=true. A broken proxy must not silently switch the
      // profile to the system route; it should behave like no internet instead.
      ['network.proxy.failover_direct', false],
      ['network.proxy.no_proxies_on', 'localhost, 127.0.0.1'],
    );
  }

  fs.mkdirSync(profileDir, { recursive: true });
  fs.writeFileSync(path.join(profileDir, 'user.js'), prefLines(prefs));
}

function firefoxUserAgent(os, version) {
  const major = String(version || '128').split('.')[0];
  const platform = os === 'windows'
    ? 'Windows NT 10.0; Win64; x64'
    : os === 'macos'
      ? 'Macintosh; Intel Mac OS X 10.15'
      : 'X11; Linux x86_64';
  return `Mozilla/5.0 (${platform}; rv:${major}.0) Gecko/20100101 Firefox/${major}.0`;
}

function buildArgs({ profileDir, startUrls = [], windowSize }) {
  const args = ['-profile', profileDir, '-no-remote'];
  if (windowSize) args.push('-width', String(windowSize.width), '-height', String(windowSize.height));
  return args.concat(startUrls);
}

module.exports = {
  createFirefoxManager,
  fetchVersions,
  downloadUrl,
  writePrefs,
  buildArgs,
  firefoxUserAgent,
  VERSION_RE,
};
