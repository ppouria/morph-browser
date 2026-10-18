const fs = require('node:fs');
const path = require('node:path');
const { downloadFile } = require('./download');
const { extractArchive, findExecutable } = require('./archive');

const VERSION_RE = /^\d+\.\d+\.\d+\.\d+$/;
const MAJOR_RE = /^\d{2,3}$/;
const byVersionDesc = (a, b) => b.localeCompare(a, undefined, { numeric: true });

function pickAsset(release, candidates) {
  for (const candidate of candidates) {
    const asset = (release.assets || []).find((entry) => candidate.re.test(entry.name));
    if (asset) return { ...asset, kind: candidate.kind };
  }
  return null;
}

// Turns GitHub releases into version/asset pairs for one platform. Repositories tag releases
// differently, so the pattern is configuration.
function parseReleases(releases, { tagPattern, candidates, platform, arch }) {
  return (releases || [])
    .filter((release) => !release.draft && !release.prerelease)
    .map((release) => {
      const match = tagPattern.exec(String(release.tag_name || '').trim());
      if (!match) return null;
      const version = match[1];
      if (!VERSION_RE.test(version)) return null;
      const asset = pickAsset(release, candidates(platform, arch));
      return asset ? { version, asset } : null;
    })
    .filter(Boolean)
    .sort((a, b) => byVersionDesc(a.version, b.version));
}

async function fetchReleases(repo, fetchImpl = fetch) {
  let response;
  try {
    response = await fetchImpl(`https://api.github.com/repos/${repo}/releases?per_page=100`, {
      headers: { 'User-Agent': 'browser-manager', Accept: 'application/vnd.github+json' },
    });
  } catch {
    throw new Error('Could not reach the GitHub release list. Check the network or proxy.');
  }
  if (response.status === 403) throw new Error('GitHub rate-limited the release list. Try again in a few minutes.');
  if (!response.ok) throw new Error(`Release list for ${repo} returned ${response.status}`);
  return response.json();
}

// A kernel backed by one or more GitHub repositories (one repository per platform when the
// project publishes separate builds).
function createGithubKernel({
  repoFor,
  tagPattern,
  candidates,
  cacheDir,
  platform = process.platform,
  arch = process.arch,
  onProgress = () => {},
  fetchImpl = fetch,
  download = downloadFile,
  extract = extractArchive,
}) {
  const inflight = new Map();
  const cache = new Map();

  async function releasesFor() {
    const repo = repoFor(platform);
    if (!cache.has(repo)) {
      cache.set(repo, (async () => parseReleases(await fetchReleases(repo, fetchImpl), {
        tagPattern,
        candidates,
        platform,
        arch,
      }))());
      cache.get(repo).catch(() => cache.delete(repo));
    }
    return cache.get(repo);
  }

  function existingBuild(version) {
    const pointer = path.join(cacheDir, version, 'executable.txt');
    if (!fs.existsSync(pointer)) return null;
    const exe = fs.readFileSync(pointer, 'utf8').trim();
    return exe && fs.existsSync(exe) ? exe : null;
  }

  function installedForMajor(major) {
    if (!fs.existsSync(cacheDir)) return null;
    const versions = fs.readdirSync(cacheDir)
      .filter((name) => VERSION_RE.test(name) && name.split('.')[0] === String(major))
      .sort(byVersionDesc);
    for (const version of versions) {
      const exe = existingBuild(version);
      if (exe) return exe;
    }
    return null;
  }

  async function install(version, asset) {
    const dir = path.join(cacheDir, version);
    const downloadPath = path.join(cacheDir, `${version}${path.extname(asset.name) || '.bin'}`);
    fs.mkdirSync(cacheDir, { recursive: true });

    if (!fs.existsSync(downloadPath)) {
      await download(asset.browser_download_url, downloadPath, {
        onProgress: (downloaded, total) => onProgress({ version, downloaded, total }),
      });
    }

    const staging = `${dir}.staging`;
    fs.rmSync(staging, { recursive: true, force: true });
    await extract(downloadPath, asset.kind, staging, platform);
    const exe = findExecutable(staging, platform);
    if (!exe) throw new Error(`No browser binary found in the ${version} archive`);

    // The staging folder is renamed into place, so the pointer is written with the final path.
    const relative = path.relative(staging, exe);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.renameSync(staging, dir);
    const finalExe = path.join(dir, relative);
    fs.writeFileSync(path.join(dir, 'executable.txt'), finalExe);
    fs.rmSync(downloadPath, { force: true });
    return finalExe;
  }

  async function listVersions() {
    const entries = await releasesFor();
    return [...new Set(entries.map((entry) => entry.version.split('.')[0]))]
      .sort((a, b) => Number(b) - Number(a));
  }

  async function ensureBrowser(major) {
    if (!MAJOR_RE.test(String(major))) throw new Error(`invalid Chromium version: ${major}`);
    const cached = installedForMajor(major);
    if (cached) return cached;

    const entries = await releasesFor();
    const entry = entries.find((candidate) => candidate.version.split('.')[0] === String(major));
    if (!entry) throw new Error(`no ${major} build is available for this platform`);

    if (!inflight.has(entry.version)) {
      inflight.set(entry.version, install(entry.version, entry.asset).finally(() => inflight.delete(entry.version)));
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

module.exports = { createGithubKernel, parseReleases, pickAsset, fetchReleases };
