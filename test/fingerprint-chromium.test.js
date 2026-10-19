const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createFingerprintManager, CANDIDATES } = require('../src/fingerprint-chromium');
const { parseReleases, pickAsset } = require('../src/github-kernel');
const { findExecutable } = require('../src/archive');

const assets = (version) => [
  { name: `ungoogled-chromium_${version}-1.1_windows_x64.zip`, browser_download_url: `https://example.test/${version}/win.zip` },
  { name: `ungoogled-chromium-${version}-1-x86_64_linux.tar.xz`, browser_download_url: `https://example.test/${version}/linux.tar.xz` },
  { name: `ungoogled-chromium_${version}-1.1_macos.dmg`, browser_download_url: `https://example.test/${version}/mac.dmg` },
];

const RELEASES = [
  { tag_name: '150.0.7871.186', draft: false, prerelease: false, assets: assets('150.0.7871.186') },
  { tag_name: '148.0.7778.215', draft: false, prerelease: false, assets: assets('148.0.7778.215') },
  { tag_name: 'not-a-version', draft: false, prerelease: false, assets: assets('0') },
  { tag_name: '140.0.1.2', draft: true, prerelease: false, assets: assets('140.0.1.2') },
];

const TAG = /^(\d+\.\d+\.\d+\.\d+)/;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pb-fp-'));

test('picks the archive that matches each platform', () => {
  assert.equal(pickAsset(RELEASES[0], CANDIDATES.linux).kind, 'tarxz');
  assert.equal(pickAsset(RELEASES[0], CANDIDATES.win32).kind, 'zip');
  assert.equal(pickAsset(RELEASES[0], CANDIDATES.darwin).kind, 'dmg');
  assert.equal(pickAsset({ assets: [] }, CANDIDATES.linux), null);
});

test('keeps only real releases, newest first', () => {
  const entries = parseReleases(RELEASES, {
    tagPattern: TAG,
    candidates: (platform) => CANDIDATES[platform],
    platform: 'linux',
    arch: 'x64',
  });
  assert.deepEqual(entries.map((entry) => entry.version), ['150.0.7871.186', '148.0.7778.215']);
});

test('finds the browser binary inside a nested archive', () => {
  const dir = tmp();
  fs.mkdirSync(path.join(dir, 'chrome-linux'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'chrome-linux', 'chrome'), '');
  assert.equal(findExecutable(dir, 'linux'), path.join(dir, 'chrome-linux', 'chrome'));
});

test('downloads and unpacks a build once, then reuses it', async () => {
  const cacheDir = tmp();
  const calls = { downloads: 0, extract: 0 };
  const manager = createFingerprintManager({
    cacheDir,
    platform: 'linux',
    arch: 'x64',
    fetchImpl: async () => ({ ok: true, json: async () => RELEASES }),
    download: async (url, dest) => {
      calls.downloads++;
      fs.writeFileSync(dest, 'archive');
    },
    extract: async (file, kind, dir) => {
      calls.extract++;
      fs.mkdirSync(path.join(dir, 'chrome-linux'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'chrome-linux', 'chrome'), '');
    },
  });

  assert.deepEqual(await manager.listVersions(), ['150', '148']);
  const exe = await manager.ensureBrowser('150');
  assert.ok(exe.endsWith(path.join('150.0.7871.186', 'chrome-linux', 'chrome')));
  await manager.ensureBrowser('150');
  assert.equal(calls.downloads, 1);
  assert.equal(calls.extract, 1);
  assert.deepEqual(manager.listInstalled(), ['150.0.7871.186']);

  manager.removeInstalled('150.0.7871.186');
  assert.deepEqual(manager.listInstalled(), []);
});

test('reports a major that the kernel does not ship', async () => {
  const manager = createFingerprintManager({
    cacheDir: tmp(),
    platform: 'linux',
    fetchImpl: async () => ({ ok: true, json: async () => RELEASES }),
  });
  await assert.rejects(manager.ensureBrowser('99'), /no 99 build is available/);
  await assert.rejects(manager.ensureBrowser('../etc'), /invalid Chromium version/);
});
