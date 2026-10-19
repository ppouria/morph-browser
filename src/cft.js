const fs = require('node:fs');
const path = require('node:path');
const { downloadFile } = require('./download');
const { extractArchive, findExecutable } = require('./archive');

const VERSIONS_URL = 'https://googlechromelabs.github.io/chrome-for-testing/known-good-versions-with-downloads.json';
const VERSION_RE = /^\d+\.\d+\.\d+\.\d+$/;
const MAJOR_RE = /^\d{2,3}$/;
const byVersionDesc = (a, b) => b.localeCompare(a, undefined, { numeric: true });

// Chrome for Testing publishes one folder per version with a plain zip for every desktop
// platform, which makes it the most predictable kernel to pin.
function platformKey(platform, arch) {
  if (platform === 'win32') return 'win64';
  if (platform === 'darwin') return arch === 'arm64' ? 'mac-arm64' : 'mac-x64';
  // Google publishes no Linux arm64 build for Chrome for Testing.
  return arch === 'arm64' ? null : 'linux64';
}

async function fetchVersions(fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(VERSIONS_URL);
  } catch {
    throw new Error('Could not reach the Chrome for Testing version list. Check the network or proxy.');
  }
  if (!response.ok) throw new Error(`Chrome for Testing version list returned ${response.status}`);
  return response.json();
}

function parseVersions(payload, key) {
  return (payload.versions || [])
    .map((entry) => {
      const version = String(entry.version || '');
      if (!VERSION_RE.test(version)) return null;
      const download = (entry.downloads && entry.downloads.chrome || []).find((item) => item.platform === key);
      return download ? { version, url: download.url } : null;
    })
    .filter(Boolean)
    .sort((a, b) => byVersionDesc(a.version, b.version));
}

function createCftManager({
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
  const key = platformKey(platform, arch);

  function load() {
    if (!key) return Promise.resolve([]);
    if (!versions) {
      versions = (async () => parseVersions(await fetchVersionsImpl(), key))();
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

  function installedForMajor(major) {
    if (!fs.existsSync(cacheDir)) return null;
    const found = fs.readdirSync(cacheDir)
      .filter((name) => VERSION_RE.test(name) && name.split('.')[0] === String(major))
      .sort(byVersionDesc);
    for (const version of found) {
      const exe = existingBuild(version);
      if (exe) return exe;
    }
    return null;
  }

  async function install(version, url) {
    const dir = path.join(cacheDir, version);
    const downloadPath = path.join(cacheDir, `${version}.zip`);
    fs.mkdirSync(cacheDir, { recursive: true });

    if (!fs.existsSync(downloadPath)) {
      await download(url, downloadPath, {
        onProgress: (downloaded, total) => onProgress({ version, downloaded, total }),
      });
    }

    const staging = `${dir}.staging`;
    fs.rmSync(staging, { recursive: true, force: true });
    await extract(downloadPath, 'zip', staging, platform);
    const exe = findExecutable(staging, platform);
    if (!exe) throw new Error(`No browser binary found in the ${version} archive`);

    const relative = path.relative(staging, exe);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(staging, dir);
    const finalExe = path.join(dir, relative);
    fs.writeFileSync(path.join(dir, 'executable.txt'), finalExe);
    fs.rmSync(downloadPath, { force: true });
    return finalExe;
  }

  async function listVersions() {
    const entries = await load();
    return [...new Set(entries.map((entry) => entry.version.split('.')[0]))]
      .sort((a, b) => Number(b) - Number(a));
  }

  async function ensureBrowser(major) {
    if (!key) throw new Error('Chrome for Testing has no Linux arm64 build');
    if (!MAJOR_RE.test(String(major))) throw new Error(`invalid Chromium version: ${major}`);
    const cached = installedForMajor(major);
    if (cached) return cached;

    const entries = await load();
    const entry = entries.find((candidate) => candidate.version.split('.')[0] === String(major));
    if (!entry) throw new Error(`no Chrome for Testing ${major} build is available`);

    if (!inflight.has(entry.version)) {
      inflight.set(entry.version, install(entry.version, entry.url).finally(() => inflight.delete(entry.version)));
    }
    return inflight.get(entry.version);
  }

  function listInstalled() {
    if (!fs.existsSync(cacheDir)) return [];
    return fs.readdirSync(cacheDir)
      .filter((name) => VERSION_RE.test(name) && existingBuild(name))
      .sort(byVersionDesc);
  }

  function removeInstalled(version) {
    if (!VERSION_RE.test(version)) throw new Error(`invalid build version: ${version}`);
    if (inflight.has(version)) throw new Error(`build ${version} is still downloading`);
    fs.rmSync(path.join(cacheDir, version), { recursive: true, force: true });
  }

  return { listVersions, ensureBrowser, listInstalled, removeInstalled };
}

module.exports = { createCftManager, parseVersions, platformKey, VERSIONS_URL };
