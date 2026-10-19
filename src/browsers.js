const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { once } = require('node:events');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const { extractArchive } = require('./archive');
const HISTORY_URL = 'https://versionhistory.googleapis.com/v1/chrome/platforms/linux/channels/stable/versions?pageSize=500';
const MAJOR_RE = /^\d{2,3}$/;
const VERSION_DIR_RE = /^\d+\.\d+\.\d+\.\d+$/;
const PROBE_CONCURRENCY = 15;
const CHROME_BINARY = path.join('opt', 'google', 'chrome', 'chrome');

const debUrl = (version) =>
  `https://dl.google.com/linux/chrome/deb/pool/main/g/google-chrome-stable/google-chrome-stable_${version}-1_amd64.deb`;

const byVersionDesc = (a, b) => b.localeCompare(a, undefined, { numeric: true });

// Every stable release Google has published, from its official version-history API.
async function fetchHistory() {
  let res;
  try {
    res = await fetch(HISTORY_URL);
  } catch {
    throw new Error("Could not reach Google's Chrome version list. Check the network or proxy, then try again.");
  }
  if (!res.ok) throw new Error(`Chrome version list returned ${res.status}`);
  const body = await res.json();
  return (body.versions || []).map((v) => v.version);
}

// Google keeps .deb files for only some builds, so each version is checked before it is offered.
// Some CDNs reject HEAD, so a one-byte ranged GET is the fallback.
async function probeDeb(version) {
  try {
    const res = await fetch(debUrl(version), { method: 'HEAD' });
    if (res.status === 200) return true;
  } catch {
    return false;
  }
  try {
    const res = await fetch(debUrl(version), { headers: { Range: 'bytes=0-0' } });
    return res.status === 200 || res.status === 206;
  } catch {
    return false;
  }
}

// Resumes a partial file when the server supports ranges, so a dropped connection does not restart a 140 MB download.
async function downloadTo(version, dest, onProgress) {
  const have = fs.existsSync(dest) ? fs.statSync(dest).size : 0;
  const res = await fetch(debUrl(version), { headers: have ? { Range: `bytes=${have}-` } : {} });
  if (res.status === 416) {
    fs.rmSync(dest, { force: true });
    throw new Error(`Chrome ${version} partial download was invalid; try again`);
  }
  if (!res.ok) throw new Error(`Chrome ${version} download returned ${res.status}`);

  const resumed = res.status === 206;
  const total = (resumed ? have : 0) + (Number(res.headers.get('content-length')) || 0);
  const out = fs.createWriteStream(dest, { flags: resumed ? 'a' : 'w' });
  let downloaded = resumed ? have : 0;
  for await (const chunk of res.body) {
    downloaded += chunk.length;
    if (!out.write(chunk)) await once(out, 'drain');
    onProgress(downloaded, total);
  }
  await new Promise((resolve, reject) => out.end((err) => (err ? reject(err) : resolve())));
}

async function unpackDeb(debPath, dir) {
  try {
    await execFileAsync('dpkg-deb', ['-x', debPath, dir]);
    return;
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  // Fedora, Arch and others have no dpkg-deb; a .deb is an ar archive with a tar payload.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'morph-deb-'));
  try {
    try {
      await execFileAsync('ar', ['x', debPath], { cwd: tmp });
    } catch (err) {
      if (err.code === 'ENOENT') throw new Error('dpkg-deb or ar is needed to unpack Chrome on Linux');
      throw err;
    }
    const data = fs.readdirSync(tmp).find((name) => name.startsWith('data.tar.'));
    if (!data) throw new Error('the Chrome package has no data archive');
    const kind = data.endsWith('.xz') ? 'tarxz'
      : data.endsWith('.gz') ? 'targz'
        : data.endsWith('.zst') ? 'tarzst'
          : null;
    if (!kind) throw new Error(`unsupported Chrome package compression: ${data}`);
    await extractArchive(path.join(tmp, data), kind, dir, 'linux');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

async function mapLimit(items, limit, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: limit }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return results;
}

// Official Google Chrome builds, one folder per full version in the cache. A major version resolves to its
// newest build that Google still serves. Simultaneous requests for one build share one download.
// Windows and macOS are not supported yet: Google publishes only the current build there, so the list is empty.
function createBrowserManager({
  cacheDir,
  platform = process.platform,
  arch = process.arch,
  fetchVersions = fetchHistory,
  probe = probeDeb,
  download = downloadTo,
  unpack = unpackDeb,
  onProgress = () => {},
}) {
  const inflight = new Map();
  let available = null; // Map: major -> available full versions, newest first

  async function loadAvailable() {
    if (!available) {
      available = (async () => {
        if (platform !== 'linux' || arch !== 'x64') return new Map();
        const versions = (await fetchVersions()).sort(byVersionDesc);
        const ok = await mapLimit(versions, PROBE_CONCURRENCY, probe);
        const byMajor = new Map();
        versions.forEach((v, i) => {
          if (!ok[i]) return;
          const major = v.split('.')[0];
          byMajor.set(major, [...(byMajor.get(major) || []), v]);
        });
        return byMajor;
      })();
      // A failed lookup (for example, offline) is retried on the next request instead of being cached.
      available.catch(() => { available = null; });
    }
    return available;
  }

  async function listVersions() {
    const majors = [...(await loadAvailable()).keys()];
    return majors.sort((a, b) => Number(b) - Number(a));
  }

  async function installVersion(version) {
    const dir = path.join(cacheDir, version);
    const debPath = path.join(cacheDir, `${version}.deb`);
    fs.mkdirSync(cacheDir, { recursive: true });

    if (!fs.existsSync(debPath)) {
      const partPath = `${debPath}.part`;
      await download(version, partPath, (downloaded, total) => onProgress({ version, downloaded, total }));
      fs.renameSync(partPath, debPath);
    }

    // Unpack into a staging folder and rename it only when complete, so an interrupted unpack never looks installed.
    const staging = `${dir}.staging`;
    fs.rmSync(staging, { recursive: true, force: true });
    fs.mkdirSync(staging, { recursive: true });
    await unpack(debPath, staging);
    fs.renameSync(staging, dir);
    fs.rmSync(debPath, { force: true });
    return path.join(dir, CHROME_BINARY);
  }

  // A build already unpacked in the cache is used as is: starting a profile must not depend on
  // Google being reachable.
  function installedForMajor(major) {
    if (!fs.existsSync(cacheDir)) return null;
    return fs.readdirSync(cacheDir)
      .filter((name) => VERSION_DIR_RE.test(name) && name.split('.')[0] === major)
      .sort(byVersionDesc)
      .map((name) => path.join(cacheDir, name, CHROME_BINARY))
      .find((exe) => fs.existsSync(exe)) || null;
  }

  async function ensureBrowser(major) {
    if (!MAJOR_RE.test(major)) throw new Error(`invalid Chromium version: ${major}`);
    const cached = installedForMajor(major);
    if (cached) return cached;
    const hits = (await loadAvailable()).get(major);
    if (!hits) throw new Error(`no Chromium ${major} build is available for this system`);

    const version = hits[0];
    const exe = path.join(cacheDir, version, CHROME_BINARY);
    if (fs.existsSync(exe)) return exe;

    if (!inflight.has(version)) {
      inflight.set(version, installVersion(version).finally(() => inflight.delete(version)));
    }
    return inflight.get(version);
  }

  function listInstalled() {
    if (!fs.existsSync(cacheDir)) return [];
    return fs.readdirSync(cacheDir)
      .filter((name) => VERSION_DIR_RE.test(name) && fs.existsSync(path.join(cacheDir, name, CHROME_BINARY)))
      .sort(byVersionDesc);
  }

  function removeInstalled(version) {
    if (!VERSION_DIR_RE.test(version)) throw new Error(`invalid build version: ${version}`);
    if (inflight.has(version)) throw new Error(`Chrome ${version} is still downloading`);
    fs.rmSync(path.join(cacheDir, version), { recursive: true, force: true });
  }

  return { listVersions, ensureBrowser, listInstalled, removeInstalled };
}

module.exports = { createBrowserManager, MAJOR_RE };
