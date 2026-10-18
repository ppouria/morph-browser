const fs = require('node:fs');
const path = require('node:path');
const { downloadFile } = require('./download');
const { extractArchive, findExecutable } = require('./archive');

const BUCKETS = {
  linux: { x64: 'Linux_x64', arm64: 'Linux_x64' },
  win32: { x64: 'Win_x64', arm64: 'Win_x64' },
  darwin: { x64: 'Mac', arm64: 'Mac_Arm' },
};

const ARCHIVE = { linux: 'chrome-linux.zip', win32: 'chrome-win.zip', darwin: 'chrome-mac.zip' };
const STORAGE = 'https://storage.googleapis.com/chromium-browser-snapshots';

// Google does not publish official Chromium *release* binaries, only the build of the current
// trunk. This kernel therefore offers a single "latest snapshot" build.
function createChromiumManager({
  cacheDir,
  platform = process.platform,
  arch = process.arch,
  onProgress = () => {},
  fetchImpl = fetch,
  download = downloadFile,
  extract = extractArchive,
}) {
  const bucket = (BUCKETS[platform] || BUCKETS.linux)[arch === 'arm64' ? 'arm64' : 'x64'];
  const archive = ARCHIVE[platform] || ARCHIVE.linux;
  const inflight = new Map();

  const pointerPath = () => path.join(cacheDir, 'latest', 'executable.txt');

  function installed() {
    const pointer = pointerPath();
    if (!fs.existsSync(pointer)) return null;
    const exe = fs.readFileSync(pointer, 'utf8').trim();
    return exe && fs.existsSync(exe) ? exe : null;
  }

  async function position() {
    const response = await fetchImpl(`${STORAGE}/${bucket}/LAST_CHANGE`);
    if (!response.ok) throw new Error(`Chromium snapshot list returned ${response.status}`);
    const text = (await response.text()).trim();
    if (!/^\d+$/.test(text)) throw new Error('Unexpected Chromium snapshot response');
    return text;
  }

  async function ensureBrowser(version = 'latest') {
    if (version !== 'latest') throw new Error('The Chromium snapshot kernel only ships the latest build');
    const cached = installed();
    if (cached) return cached;

    if (!inflight.has('latest')) {
      inflight.set('latest', (async () => {
        const revision = await position();
        const dir = path.join(cacheDir, 'latest');
        const downloadPath = path.join(cacheDir, `snapshot-${revision}.zip`);
        fs.mkdirSync(cacheDir, { recursive: true });

        if (!fs.existsSync(downloadPath)) {
          await download(`${STORAGE}/${bucket}/${revision}/${archive}`, downloadPath, {
            onProgress: (downloaded, total) => onProgress({ version: `snapshot ${revision}`, downloaded, total }),
          });
        }

        const staging = path.join(cacheDir, 'latest.staging');
        fs.rmSync(staging, { recursive: true, force: true });
        await extract(downloadPath, 'zip', staging, platform);
        const exe = findExecutable(staging, platform);
        if (!exe) throw new Error('No browser binary found in the Chromium archive');

        const relative = path.relative(staging, exe);
        fs.rmSync(dir, { recursive: true, force: true });
        fs.renameSync(staging, dir);
        const finalExe = path.join(dir, relative);
        fs.writeFileSync(path.join(dir, 'executable.txt'), finalExe);
        fs.writeFileSync(path.join(dir, 'revision.txt'), revision);
        fs.rmSync(downloadPath, { force: true });
        return finalExe;
      })().finally(() => inflight.delete('latest')));
    }
    return inflight.get('latest');
  }

  async function listVersions() {
    return ['latest'];
  }

  function listInstalled() {
    return installed() ? ['latest'] : [];
  }

  function removeInstalled(version) {
    if (version !== 'latest') throw new Error('invalid build version: latest expected');
    if (inflight.has('latest')) throw new Error('the snapshot is still downloading');
    fs.rmSync(path.join(cacheDir, 'latest'), { recursive: true, force: true });
  }

  return { listVersions, ensureBrowser, listInstalled, removeInstalled };
}

module.exports = { createChromiumManager, BUCKETS, ARCHIVE };
