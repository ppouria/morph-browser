const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createKernelRegistry, KERNEL_INFO } = require('../src/kernels');
const { createCftManager, parseVersions, platformKey } = require('../src/cft');
const { createChromiumManager } = require('../src/chromium-snapshots');
const { createUngoogledManager, CANDIDATES } = require('../src/ungoogled');
const { parseReleases } = require('../src/github-kernel');

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pb-kernel-'));

test('the registry exposes every kernel with a description', () => {
  assert.deepEqual(KERNEL_INFO.map((kernel) => kernel.id), ['chrome', 'cft', 'chromium', 'ungoogled', 'fingerprint']);
  for (const kernel of KERNEL_INFO) assert.ok(kernel.label && kernel.description);
});

test('the chromium snapshot kernel only offers the latest build', async () => {
  const manager = createChromiumManager({ cacheDir: tmp(), platform: 'linux' });
  assert.deepEqual(await manager.listVersions(), ['latest']);
  await assert.rejects(manager.ensureBrowser('150'), /only ships the latest/);
});

test('chrome for testing maps platforms and versions', () => {
  assert.equal(platformKey('linux', 'x64'), 'linux64');
  assert.equal(platformKey('win32', 'x64'), 'win64');
  assert.equal(platformKey('darwin', 'arm64'), 'mac-arm64');
  assert.equal(platformKey('darwin', 'x64'), 'mac-x64');

  const payload = {
    versions: [
      { version: '151.0.7000.10', downloads: { chrome: [{ platform: 'linux64', url: 'https://example.test/151.zip' }] } },
      { version: '151.0.7000.20', downloads: { chrome: [{ platform: 'linux64', url: 'https://example.test/151b.zip' }] } },
      { version: '150.0.1.2', downloads: { chrome: [{ platform: 'win64', url: 'https://example.test/150.zip' }] } },
    ],
  };
  const entries = parseVersions(payload, 'linux64');
  assert.deepEqual(entries.map((entry) => entry.version), ['151.0.7000.20', '151.0.7000.10']);
});

test('chrome for testing downloads and unpacks a build', async () => {
  const cacheDir = tmp();
  const calls = [];
  const manager = createCftManager({
    cacheDir,
    platform: 'linux',
    arch: 'x64',
    fetchVersionsImpl: async () => ({
      versions: [{ version: '151.0.7000.10', downloads: { chrome: [{ platform: 'linux64', url: 'https://example.test/151.zip' }] } }],
    }),
    download: async (url, dest) => { calls.push(url); fs.writeFileSync(dest, 'zip'); },
    extract: async (file, kind, dir) => {
      fs.mkdirSync(path.join(dir, 'chrome-linux64'), { recursive: true });
      fs.writeFileSync(path.join(dir, 'chrome-linux64', 'chrome'), '');
    },
  });
  assert.deepEqual(await manager.listVersions(), ['151']);
  const exe = await manager.ensureBrowser('151');
  assert.match(exe, /151\.0\.7000\.10\/chrome-linux64\/chrome$/);
  assert.deepEqual(manager.listInstalled(), ['151.0.7000.10']);
  assert.equal(calls.length, 1);
});

test('ungoogled picks the archive for the platform and arch', () => {
  const releases = [
    { tag_name: '155.0.8059.84-1', draft: false, prerelease: false, assets: [
      { name: 'ungoogled-chromium-155.0.8059.84-1-x86_64_linux.tar.xz', browser_download_url: 'x' },
      { name: 'ungoogled-chromium-155.0.8059.84-1-arm64_linux.tar.xz', browser_download_url: 'y' },
    ] },
  ];
  const entries = parseReleases(releases, {
    tagPattern: /^(\d+\.\d+\.\d+\.\d+)/,
    candidates: (platform, arch) => CANDIDATES[platform](arch),
    platform: 'linux',
    arch: 'arm64',
  });
  assert.equal(entries[0].version, '155.0.8059.84');
  assert.match(entries[0].asset.name, /arm64/);
});

test('the registry lists installed builds per kernel', async () => {
  const registry = createKernelRegistry({ cacheDir: tmp(), platform: 'linux', arch: 'x64' });
  assert.deepEqual(registry.listInstalled('chrome'), []);
  assert.deepEqual(registry.listInstalled('fingerprint'), []);
  assert.deepEqual(registry.listInstalled('chromium'), []);
  assert.throws(() => registry.listInstalled('nope'), /unknown kernel/);
});
